# Static site hosting on AWS

Two sites, one shared module:

| Stack | Site source | Domain |
|---|---|---|
| `nosy-neighbors` | `sites/nosy-neighbors/` | `nosyneighbors.coffee` |
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

- **Terraform** >= 1.6 — `brew install terraform`
- **AWS CLI v2** — `brew install awscli`, then `aws configure`
- **Credentials** with permission over S3, CloudFront, ACM, and Route53

Confirm the account first:

```bash
aws sts get-caller-identity
```

---

# nosyneighbors.coffee: what is already live

Checked 2026-09-28 from public DNS. Read this before running anything, because
the domain is **half-configured across two providers** and a plain `apply` will
collide with what exists.

**The apex is on Namecheap.**

```
nosyneighbors.coffee
  NS   dns1.registrar-servers.com, dns2.registrar-servers.com
  A    13.227.34.x                (CloudFront)
  MX   eforward1-5.registrar-servers.com   <- Namecheap email forwarding
  TXT  v=spf1 include:spf.efwd.registrar-servers.com ~all
```

**`www` is delegated to its own Route53 zone.**

```
www.nosyneighbors.coffee
  NS     ns-214.awsdns-26.com, ns-912.awsdns-50.net,
         ns-1455.awsdns-53.org, ns-1996.awsdns-57.co.uk
  CNAME  dt3yywat0csl.cloudfront.net
```

That Route53 hosted zone was created for `www.nosyneighbors.coffee` rather than
for `nosyneighbors.coffee`. It is a zone one level too deep — it can only ever
hold `www` records, which is why the apex had to be handled separately at
Namecheap. Its SOA serial is 1, so nothing has been changed in it since
creation.

### Three things this implies

1. **`create_hosted_zone = true`** for this stack. There is no apex zone to
   adopt, and adopting the `www` one would put apex records at the wrong level.

2. **A CloudFront distribution already claims `www.nosyneighbors.coffee`**
   (`dt3yywat0csl.cloudfront.net`). CloudFront refuses to serve one alias from
   two distributions, so a fresh apply fails with `CNAMEAlreadyExists` until you
   either import that distribution or take the alias off it. See
   *Adopting what exists* below.

3. **Email forwarding is the thing most likely to break.** It is configured at
   Namecheap and routed by the MX records above. Move the nameservers without
   carrying those across and mail stops arriving, with nothing visibly wrong
   with the website. The stack now manages them (`mx_records`, `txt_records` in
   `stacks/nosy-neighbors/variables.tf`) — but read the warning in step 3.

---

# Attaching the domain: what to do at Namecheap

The short version: **change the nameservers to Route53's**. Everything else
follows from that. But do it in this order, or the certificate will hang and
your mail will drop.

## Step 1 — create the apex zone and mail records first

You need Route53 to be ready *before* Namecheap points at it. Apply only the
DNS pieces:

```bash
cd aws/stacks/nosy-neighbors
terraform init
terraform apply \
  -target=module.site.aws_route53_zone.this \
  -target=module.site.aws_route53_record.mx \
  -target=module.site.aws_route53_record.txt
```

Then read off the nameservers:

```bash
terraform output name_servers
```

Four values, like `ns-123.awsdns-15.com`. Keep them to hand.

Do **not** run a full `apply` yet. The certificate validates over DNS, and DNS
does not point at Route53 until step 2, so it would sit and eventually time out.

## Step 2 — switch the nameservers

In Namecheap:

1. Sign in, go to **Domain List**
2. Click **Manage** next to `nosyneighbors.coffee`
3. Find the **NAMESERVERS** section on the Domain tab
4. Change the dropdown from **Namecheap BasicDNS** to **Custom DNS**
5. Paste the four Route53 nameservers, one per row (use **ADD NAMESERVER** for
   rows three and four). Trailing dots are fine either way.
6. Click the green checkmark to save

Namecheap says up to 48 hours. In practice `.coffee` usually updates within an
hour or two.

Watch it flip:

```bash
dig +short NS nosyneighbors.coffee
```

When that returns the `awsdns` names instead of `registrar-servers.com`, you are
through.

## Step 3 — check your email still works

**Read this before step 2 if email matters to you.**

Namecheap documents its free email forwarding as requiring their own
nameservers. Copying the MX records into Route53 is necessary, and it may be
sufficient — but it is not something Namecheap supports, so treat it as
unverified until you have tested it.

Decide up front which you want:

- **Test and hope.** Do the switch, then send a message to your forwarded
  address from an outside account. If it arrives, you are fine.
- **Move email somewhere that expects external DNS.** Cloudflare Email Routing
  is free and works with any nameservers; a paid mailbox (Fastmail, Google
  Workspace) is the sturdier answer if the address matters commercially. Either
  way you replace `mx_records` and `txt_records` with the new provider's values.

Do not skip this because the website looks fine. Mail failures are silent.

## Step 4 — the rest of the stack

Once DNS resolves through Route53:

```bash
terraform apply
```

The certificate validates in a few minutes now that Route53 answers for the
domain. CloudFront then takes ten or so to deploy.

## Step 5 — publish the site

```bash
./aws/scripts/deploy.sh nosy-neighbors --dry-run
./aws/scripts/deploy.sh nosy-neighbors
```

## Step 6 — clean up the leftover zone

Once `nosyneighbors.coffee` and `www.nosyneighbors.coffee` both serve from the
new stack, the old `www.nosyneighbors.coffee` hosted zone is dead weight at
$0.50/month. Delete it **after** confirming the new setup works — not before,
or you break `www` in the gap.

```bash
aws route53 list-hosted-zones-by-name --dns-name www.nosyneighbors.coffee
aws route53 delete-hosted-zone --id <that zone id>
```

A zone must be empty of everything but its own NS and SOA records before it will
delete.

---

# Adopting what exists

The `www` CloudFront distribution already holds an alias this stack wants. Pick
one:

**Import it** — keeps the distribution, its URL, and any warm cache:

```bash
cd aws/stacks/nosy-neighbors
terraform import module.site.aws_cloudfront_distribution.site <distribution-id>
terraform plan   # read carefully: this shows how the live one differs
```

Find the id with:

```bash
aws cloudfront list-distributions \
  --query "DistributionList.Items[?contains(Aliases.Items || \`[]\`, 'www.nosyneighbors.coffee')].{Id:Id,Domain:DomainName}" \
  --output table
```

**Or release the alias** — simpler if that distribution was a first attempt you
do not care about. Edit it in the CloudFront console, remove
`www.nosyneighbors.coffee` from its alternate domain names, save, wait for it to
finish deploying, then apply this stack normally.

Other resources import the same way if they already exist:

```bash
terraform import module.site.aws_s3_bucket.site nosyneighbors-coffee-site
terraform import module.site.aws_acm_certificate.site arn:aws:acm:us-east-1:<acct>:certificate/<id>
terraform import module.site.aws_cloudfront_origin_access_control.site <oac-id>
terraform import 'module.site.aws_route53_record.site["apex-A"]' <zone-id>_nosyneighbors.coffee_A
```

---

# The other stack

`sb-builder` has **no default domain** — nobody has said which one it ships on.
Set it before its first apply:

```bash
cd aws/stacks/sb-builder
cp terraform.tfvars.example terraform.tfvars
# edit: domain_name = "the-real-domain.com"
```

Its `create_hosted_zone` defaults to `false`, so check whether a zone exists
first:

```bash
aws route53 list-hosted-zones-by-name --dns-name <domain>
```

---

# Everyday changes

Edit files under `sites/<stack>/`, then:

```bash
./aws/scripts/deploy.sh nosy-neighbors
```

No Terraform needed unless the infrastructure itself changes.

# What it costs

Roughly **$1–3 per month per site**:

- Route53 hosted zone — $0.50/month, the only guaranteed charge
- S3 storage and requests — cents
- CloudFront — generous perpetual free tier
- ACM certificate — free

# Things worth knowing

**The certificate must live in us-east-1.** CloudFront reads certificates from
nowhere else. The module handles this with a second provider alias; the bucket
can live wherever you like.

**Missing files come back as 403, not 404.** A private bucket behind OAC grants
`s3:GetObject` only, so S3 cannot distinguish "no such key" from "not allowed".
The distribution maps both onto `/404.html`, which is why that file must exist
in every site directory.

**Nothing is content-hashed.** `deploy.sh` caches assets for a day rather than a
year for exactly that reason. Add a build step that fingerprints filenames and
you can safely raise it.

**State is local by default.** Fine for one person. The moment anyone else
deploys, uncomment the S3 backend in `versions.tf` and run
`terraform init -migrate-state`.

# Checking your work without applying

```bash
terraform fmt -recursive -check
terraform validate
node aws/modules/static-site/cloudfront-router.test.js
```

None of those need AWS credentials. CI runs all of them, plus shellcheck on
`deploy.sh` and a check that every site directory has its `404.html` — see
`.github/workflows/checks.yml`.

`terraform plan` does need credentials; it reads live account state.
