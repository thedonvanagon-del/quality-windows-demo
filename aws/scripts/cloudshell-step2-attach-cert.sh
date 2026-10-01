#!/usr/bin/env bash
# STEP 2 of 2 — run in AWS CloudShell once step 1's certificate says ISSUED.
#
# Adds nosyneighbors.coffee to the CloudFront distribution's alternate domain
# names and attaches the new certificate. That is the piece that makes the bare
# domain load; DNS alone never could.

set -euo pipefail

DOMAIN="nosyneighbors.coffee"
CF_DOMAIN="dt3yywat0csl.cloudfront.net"
ARN=$(cat ~/nn-cert-arn.txt)

STATUS=$(aws acm describe-certificate --region us-east-1 --certificate-arn "${ARN}" \
  --query Certificate.Status --output text)
if [ "${STATUS}" != "ISSUED" ]; then
  echo "Certificate is ${STATUS}, not ISSUED. Check the Namecheap records from step 1." >&2
  exit 1
fi
echo "Certificate ISSUED."

DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='${CF_DOMAIN}'].Id | [0]" --output text)
if [ -z "${DIST_ID}" ] || [ "${DIST_ID}" = "None" ]; then
  echo "No distribution found with domain ${CF_DOMAIN}." >&2
  exit 1
fi
echo "Distribution: ${DIST_ID}"

aws cloudfront get-distribution-config --id "${DIST_ID}" > ~/nn-dist.json
ETAG=$(python3 -c "import json;print(json.load(open('$HOME/nn-dist.json'))['ETag'])")

# Keep a copy of the original config: this is the file to restore from if the
# update turns out wrong.
cp ~/nn-dist.json ~/nn-dist-backup.json
echo "Backup: ~/nn-dist-backup.json"

python3 - "$ARN" "$DOMAIN" <<'PY'
import json, os, sys
arn, domain = sys.argv[1], sys.argv[2]
cfg = json.load(open(os.path.expanduser("~/nn-dist.json")))["DistributionConfig"]

aliases = cfg.setdefault("Aliases", {"Quantity": 0, "Items": []})
items = aliases.get("Items", [])
for name in (domain, f"www.{domain}"):
    if name not in items:
        items.append(name)
aliases["Items"] = items
aliases["Quantity"] = len(items)

cfg["ViewerCertificate"] = {
    "ACMCertificateArn": arn,
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021",
    "Certificate": arn,
    "CertificateSource": "acm",
}

json.dump(cfg, open(os.path.expanduser("~/nn-dist-new.json"), "w"))
print("  aliases now:", ", ".join(items))
PY

aws cloudfront update-distribution \
  --id "${DIST_ID}" \
  --if-match "${ETAG}" \
  --distribution-config "file://${HOME}/nn-dist-new.json" \
  --query 'Distribution.Status' --output text

echo
echo "Update submitted. CloudFront takes about 10 minutes to deploy."
echo "Watch it:"
echo "  aws cloudfront get-distribution --id ${DIST_ID} --query Distribution.Status --output text"
echo
echo "When it says Deployed, load https://${DOMAIN}"
