#!/usr/bin/env bash
# STEP 1 of 2 — run in AWS CloudShell (console, terminal icon, top right).
#
# Requests the certificate CloudFront needs and prints the two DNS records to
# add at Namecheap, already split into the Host and Value columns Namecheap
# actually asks for.

set -euo pipefail

DOMAIN="nosyneighbors.coffee"

echo "Requesting certificate for ${DOMAIN} and www.${DOMAIN} in us-east-1..."
ARN=$(aws acm request-certificate \
  --region us-east-1 \
  --domain-name "${DOMAIN}" \
  --subject-alternative-names "www.${DOMAIN}" \
  --validation-method DNS \
  --query CertificateArn --output text)

echo "  ${ARN}"
echo "${ARN}" > ~/nn-cert-arn.txt
echo "  (saved to ~/nn-cert-arn.txt for step 2)"

# ACM populates the validation records a moment after the request.
echo
echo "Waiting for validation records..."
for _ in $(seq 1 15); do
  COUNT=$(aws acm describe-certificate --region us-east-1 --certificate-arn "${ARN}" \
    --query 'length(Certificate.DomainValidationOptions[?ResourceRecord])' --output text 2>/dev/null || echo 0)
  [ "${COUNT}" = "2" ] && break
  sleep 2
done

echo
echo "=================================================================="
echo " ADD THESE TWO RECORDS AT NAMECHEAP"
echo " Domain List > Manage > Advanced DNS > Add New Record"
echo " Type: CNAME Record      TTL: Automatic"
echo "=================================================================="

aws acm describe-certificate --region us-east-1 --certificate-arn "${ARN}" \
  --query 'Certificate.DomainValidationOptions[].[ResourceRecord.Name,ResourceRecord.Value]' \
  --output text | while read -r NAME VALUE; do
    # Namecheap's Host field takes only the part before the domain.
    HOST="${NAME%.${DOMAIN}.}"
    echo
    echo "  Host  : ${HOST}"
    echo "  Value : ${VALUE}"
  done

echo
echo "=================================================================="
echo "Paste Host EXACTLY as shown - do not append the domain."
echo "Namecheap adds it for you; typing it twice is the usual reason"
echo "validation never completes."
echo
echo "Then wait for ISSUED (usually 2-10 minutes):"
echo "  aws acm describe-certificate --region us-east-1 \\"
echo "    --certificate-arn \$(cat ~/nn-cert-arn.txt) \\"
echo "    --query Certificate.Status --output text"
echo
echo "Once it says ISSUED, run step 2."
