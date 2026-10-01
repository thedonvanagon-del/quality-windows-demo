#!/usr/bin/env bash
#
# Publish a site to its CloudFront distribution.
#
#   ./aws/scripts/deploy.sh nosy-neighbors
#   ./aws/scripts/deploy.sh sb-builder --dry-run
#
# Reads the bucket and distribution straight out of Terraform state, so there
# are no IDs to keep in sync by hand. Run `terraform apply` in the stack first.

set -euo pipefail

STACK="${1:-}"
DRY_RUN=false

if [[ "${2:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK_DIR="${REPO_ROOT}/aws/stacks/${STACK}"
# Override when the site source lives somewhere other than sites/<stack>:
#   SITE_DIR=path/to/site ./aws/scripts/deploy.sh <stack>
SITE_DIR="${SITE_DIR:-${REPO_ROOT}/sites/${STACK}}"

die() {
  echo "error: $*" >&2
  exit 1
}

[[ -n "$STACK" ]] || die "usage: $(basename "$0") <nosy-neighbors|sb-builder> [--dry-run]"
[[ -d "$STACK_DIR" ]] || die "no such stack: ${STACK_DIR}"
[[ -d "$SITE_DIR" ]] || die "no such site directory: ${SITE_DIR}"

command -v aws >/dev/null 2>&1 || die "the AWS CLI is not installed. https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
command -v terraform >/dev/null 2>&1 || die "terraform is not installed."

# Refuse to sync an empty directory: with --delete that would wipe the live site.
if [[ -z "$(find -L "$SITE_DIR" -type f -print -quit)" ]]; then
  die "${SITE_DIR} has no files in it. Refusing to sync, because --delete would empty the bucket."
fi

read_output() {
  terraform -chdir="$STACK_DIR" output -raw "$1" 2>/dev/null \
    || die "could not read '$1' from Terraform state. Has 'terraform apply' run in ${STACK_DIR}?"
}

BUCKET="$(read_output bucket_name)"
DISTRIBUTION_ID="$(read_output distribution_id)"

echo "stack:        ${STACK}"
echo "source:       ${SITE_DIR}"
echo "bucket:       s3://${BUCKET}"
echo "distribution: ${DISTRIBUTION_ID}"
echo

SYNC_FLAGS=(--delete)
if [[ "$DRY_RUN" == true ]]; then
  SYNC_FLAGS+=(--dryrun)
  echo "(dry run: nothing will be uploaded or invalidated)"
  echo
fi

# Two passes, because HTML and fingerprint-free assets want different cache
# lifetimes. The --exclude/--include filters apply to the destination listing as
# well as the source, so each pass only ever deletes files it is responsible for.

# Nothing here is content-hashed yet, so assets cannot be marked immutable: a
# browser that cached style.css or a logo would hold it past any CloudFront
# invalidation. A day is a fair trade until there is a build step that
# fingerprints filenames -- then raise this to a year and add ", immutable".
echo "==> assets (cached for a day)"
aws s3 sync "$SITE_DIR" "s3://${BUCKET}" \
  "${SYNC_FLAGS[@]}" \
  --exclude "*.html" \
  --cache-control "public, max-age=86400, stale-while-revalidate=604800"

echo
echo "==> html (always revalidated, so edits go live on the next request)"
aws s3 sync "$SITE_DIR" "s3://${BUCKET}" \
  "${SYNC_FLAGS[@]}" \
  --exclude "*" \
  --include "*.html" \
  --cache-control "public, max-age=0, must-revalidate" \
  --content-type "text/html; charset=utf-8"

if [[ "$DRY_RUN" == true ]]; then
  echo
  echo "dry run finished. Nothing changed."
  exit 0
fi

echo
echo "==> invalidating CloudFront cache"
INVALIDATION_ID="$(
  aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --query 'Invalidation.Id' \
    --output text
)"

echo "invalidation ${INVALIDATION_ID} created; waiting for it to complete"
aws cloudfront wait invalidation-completed \
  --distribution-id "$DISTRIBUTION_ID" \
  --id "$INVALIDATION_ID"

echo
echo "done: $(terraform -chdir="$STACK_DIR" output -raw site_url)"
