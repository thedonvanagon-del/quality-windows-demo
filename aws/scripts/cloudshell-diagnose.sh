#!/usr/bin/env bash
# Read-only. Changes nothing. Run in AWS CloudShell and paste the output back.
#
# Answers the four questions that decide why nosyneighbors.coffee won't load:
#   1. Does the distribution list the bare domain as a name it serves?
#   2. Which certificate is attached, and does it cover the bare domain?
#   3. Was a new certificate requested, and has it validated?
#   4. Is there actually a site in the origin bucket?

set -uo pipefail

DOMAIN="nosyneighbors.coffee"
CF_DOMAIN="dt3yywat0csl.cloudfront.net"

echo "===== 1-2. DISTRIBUTION ====="
DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='${CF_DOMAIN}'].Id | [0]" --output text)
echo "id: ${DIST_ID}"

aws cloudfront get-distribution --id "${DIST_ID}" --query '{
  Status:       Distribution.Status,
  Aliases:      Distribution.DistributionConfig.Aliases.Items,
  CertArn:      Distribution.DistributionConfig.ViewerCertificate.ACMCertificateArn,
  CertSource:   Distribution.DistributionConfig.ViewerCertificate.CertificateSource,
  DefaultRoot:  Distribution.DistributionConfig.DefaultRootObject,
  Origins:      Distribution.DistributionConfig.Origins.Items[].DomainName
}' --output json

ATTACHED=$(aws cloudfront get-distribution --id "${DIST_ID}" \
  --query 'Distribution.DistributionConfig.ViewerCertificate.ACMCertificateArn' --output text)
if [ -n "${ATTACHED}" ] && [ "${ATTACHED}" != "None" ]; then
  echo "attached cert covers:"
  aws acm describe-certificate --region us-east-1 --certificate-arn "${ATTACHED}" \
    --query 'Certificate.SubjectAlternativeNames' --output text
fi

echo
echo "===== 3. CERTIFICATES FOR THIS DOMAIN (us-east-1) ====="
aws acm list-certificates --region us-east-1 \
  --certificate-statuses PENDING_VALIDATION ISSUED INACTIVE EXPIRED VALIDATION_TIMED_OUT REVOKED FAILED \
  --query "CertificateSummaryList[?contains(DomainName, '${DOMAIN}')].[Status,DomainName,CertificateArn]" \
  --output text | while read -r STATUS NAME ARN; do
    echo "- ${STATUS}  ${NAME}"
    echo "  ${ARN}"
    if [ "${STATUS}" = "PENDING_VALIDATION" ]; then
      aws acm describe-certificate --region us-east-1 --certificate-arn "${ARN}" \
        --query 'Certificate.DomainValidationOptions[].[DomainName,ValidationStatus,ResourceRecord.Name]' \
        --output text | sed 's/^/    /'
    fi
  done

echo
echo "===== 4. ORIGIN CONTENT ====="
aws cloudfront get-distribution --id "${DIST_ID}" \
  --query 'Distribution.DistributionConfig.Origins.Items[].DomainName' --output text | tr '\t' '\n' |
while read -r ORIGIN; do
  echo "origin: ${ORIGIN}"
  case "${ORIGIN}" in
    *.s3.*amazonaws.com|*.s3-website*)
      BUCKET="${ORIGIN%%.s3*}"
      echo "bucket: ${BUCKET}"
      aws s3 ls "s3://${BUCKET}/" 2>&1 | head -15
      ;;
    *)
      echo "(not an S3 origin)"
      ;;
  esac
done

echo
echo "===== done ====="
