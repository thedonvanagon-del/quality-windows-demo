# Static site hosting on AWS

Two sites, one shared module:

| Stack | Site source | Domain |
|---|---|---|
| `nosy-neighbors` | `sites/nosy-neighbors/` | `nosyneighborscoffeeco.com` |
| `sb-builder` | `sites/sb-builder/` | not set yet — you fill it in |

Both get the same architecture: a private S3 bucket, CloudFront in front of it
via Origin Access Control, an ACM certificate, and Route53 records. Nothing is
readable straight from S3; CloudFront is the only way in.

```
      DNS (Route53)
           |
     CloudFront  <-- ACM cert (us-east-1), security headers, router function
           |            OAC, signed with SigV4
      S3 bucket (private, versioned, encrypted)
```

## Before you start

You need:

- **Terraform** >= 1.6 — `brew install terraform`
- **AWS CLI v2** — `brew install awscli`, then `aws configure`
- **Credentials** with permission over S3, CloudFront, ACM, and Route53

Check you are pointed at the right account before anything else:

```bash
aws sts get-caller-identity
```

## Step 1 — find out what already exists

This matters more than it sounds. If you built any of this in the console
already, Terraform will try to create a *second* copy and hit errors that are
annoying to unpick. Look first:

```bash
DOMAIN=nosyneighborscoffeeco.com

# Is there a hosted zone? (Registering through Route53 creates one automatically.)
aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN" \
  --query 'HostedZones[].{Name:Name,Id:Id}' --output table

# Any distribution already claiming this domain?
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Quantity>\`0\`].{Id:Id,Domain:DomainName,Aliases:Aliases.Items}" \
  --output json

# Any certificate already issued?
aws acm list-certificates --region us-east-1 \
  --query "CertificateSummaryList[?DomainName=='$DOMAIN']" --output table

# Any bucket that looks like the site bucket?
aws s3 ls | grep -i nosy
```

Then:

- **Hosted zone exists** — good, that is the default. Leave
  `create_hosted_zone = false` and Terraform will adopt it.
- **No hosted zone** — set `create_hosted_zone = true` in `terraform.tfvars`.
- **A distribution already serves this domain** — import it (Step 4) or remove
  the alias from it first. CloudFront refuses to put the same CNAME on two
  distributions, so a fresh apply will fail with `CNAMEAlreadyExists`.
- **Bucket or certificate exists** — import them (Step 4), or let Terraform
  create new ones and clean the old up afterwards.

## Step 2 — configure

```bash
cd aws/stacks/nosy-neighbors
cp terraform.tfvars.example terraform.tfvars   # edit if the defaults are wrong
```

For the Santa Barbara builder, `domain_name` has **no default** — nobody has
said which domain it ships on. Set it before the first apply:

```bash
cd aws/stacks/sb-builder
cp terraform.tfvars.example terraform.tfvars
# then edit: domain_name = "the-real-domain.com"
```

## Step 3 — apply

```bash
terraform init
terraform plan      # read this before saying yes
terraform apply
```

The first apply waits on DNS validation of the certificate. Five to ten minutes
is normal. CloudFront then takes another ten or so to finish deploying.

## Step 4 — only if you are adopting existing resources

Run these *instead of* letting Terraform create fresh ones, from inside the
stack directory, before `apply`:

```bash
# S3 bucket
terraform import module.site.aws_s3_bucket.site nosyneighborscoffeeco-com-site

# CloudFront distribution
terraform import module.site.aws_cloudfront_distribution.site E1234567890ABC

# Certificate (ARN from the us-east-1 list above)
terraform import module.site.aws_acm_certificate.site \
  arn:aws:acm:us-east-1:111122223333:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Origin Access Control
terraform import module.site.aws_cloudfront_origin_access_control.site E2ABCDEF12345

# DNS records, one per name and type: ZONEID_name_TYPE
terraform import 'module.site.aws_route53_record.site["apex-A"]' \
  Z0123456789ABC_nosyneighborscoffeeco.com_A
```

Then run `terraform plan` and read it carefully. The plan shows how the live
resource differs from this config — that diff is the point of the exercise.

A hosted zone needs no import while `create_hosted_zone = false`, because the
module reads it as a data source rather than owning it.

## Step 5 — point the domain

```bash
terraform output name_servers
```

Set those four at whoever the domain is registered with. If it is registered in
Route53 and the zone above is the one Route53 created, this is already done.

**This is the step that gets skipped.** Right now `nosyneighborscoffeeco.com`
has no DNS records at all, so until the registrar serves these nameservers, the
site is invisible no matter how healthy the AWS side looks.

Watch it land:

```bash
dig +short NS nosyneighborscoffeeco.com
dig +short nosyneighborscoffeeco.com
```

Propagation is usually minutes, but give it up to 48 hours before worrying.

## Step 6 — publish the site

```bash
./aws/scripts/deploy.sh nosy-neighbors --dry-run   # see what would change
./aws/scripts/deploy.sh nosy-neighbors             # do it
```

The script reads the bucket and distribution from Terraform state, uploads HTML
and assets with different cache lifetimes, invalidates CloudFront, and waits for
the invalidation to finish.

Test before DNS resolves by hitting the distribution directly:

```bash
curl -I "https://$(terraform -chdir=aws/stacks/nosy-neighbors output -raw distribution_domain_name)"
```

## Everyday changes

Edit files under `sites/<stack>/`, then:

```bash
./aws/scripts/deploy.sh nosy-neighbors
```

No Terraform needed unless the infrastructure itself changes.

## What it costs

Roughly **$1–3 per month per site** at small-cafe traffic:

- Route53 hosted zone — $0.50/month, the only guaranteed charge
- S3 storage and requests — cents
- CloudFront — generous perpetual free tier; a marketing site rarely exceeds it
- ACM certificate — free
- Domain registration — about $13/year if Route53 is the registrar

## Things worth knowing

**The certificate must live in us-east-1.** CloudFront reads certificates from
nowhere else. The module handles this with a second provider alias; the bucket
can still live wherever you like.

**Missing files come back as 403, not 404.** A private bucket behind OAC grants
`s3:GetObject` only, so S3 cannot distinguish "no such key" from "not allowed".
The distribution maps both onto `/404.html`, which is why that file has to exist
in every site directory.

**Nothing is content-hashed.** `deploy.sh` caches assets for a day rather than a
year for exactly this reason. Add a build step that fingerprints filenames and
you can safely raise it.

**Two hosted zones for one domain is the classic failure.** The registrar points
at one set of nameservers; your records live in the other. If the site will not
resolve, check that `terraform output name_servers` matches
`dig +short NS <domain>` before looking anywhere else.

**State is local by default.** Fine for one person. The moment anyone else
deploys, uncomment the S3 backend in `versions.tf` and run
`terraform init -migrate-state`.

## Verifying a stack without applying it

```bash
terraform fmt -recursive -check
terraform validate
```

Both run without AWS credentials. `terraform plan` does not — it reads live
account state.

The CloudFront router function has its own tests — URL rewriting is the one
piece of real logic here, and a mistake in it breaks every request:

```bash
node aws/modules/static-site/cloudfront-router.test.js
```

CI runs all of this on every pull request — formatting, `validate` on both
stacks, the router tests, shellcheck on `deploy.sh`, and a check that every site
directory has its `404.html`. None of it needs AWS credentials, so it runs on
forks and on branches without touching the account. See
`.github/workflows/checks.yml`.
