locals {
  www_domain  = "www.${var.domain_name}"
  bucket_name = coalesce(var.bucket_name, "${replace(var.domain_name, ".", "-")}-site")
  origin_id   = "s3-${local.bucket_name}"

  # Every name the certificate and the distribution must answer for.
  cert_domains = var.enable_www ? [var.domain_name, local.www_domain] : [var.domain_name]

  zone_id = var.create_hosted_zone ? aws_route53_zone.this[0].zone_id : data.aws_route53_zone.this[0].zone_id

  name_servers = var.create_hosted_zone ? aws_route53_zone.this[0].name_servers : data.aws_route53_zone.this[0].name_servers

  # A and AAAA for each served name, so the site answers on IPv4 and IPv6.
  dns_records = merge(
    {
      "apex-A"    = { name = var.domain_name, type = "A" }
      "apex-AAAA" = { name = var.domain_name, type = "AAAA" }
    },
    var.enable_www ? {
      "www-A"    = { name = local.www_domain, type = "A" }
      "www-AAAA" = { name = local.www_domain, type = "AAAA" }
    } : {}
  )

  tags = merge({
    Domain    = var.domain_name
    ManagedBy = "terraform"
  }, var.tags)
}

# ---------------------------------------------------------------------------
# DNS zone
# ---------------------------------------------------------------------------

data "aws_route53_zone" "this" {
  count = var.create_hosted_zone ? 0 : 1

  name         = "${var.domain_name}."
  private_zone = false
}

resource "aws_route53_zone" "this" {
  count = var.create_hosted_zone ? 1 : 0

  name = var.domain_name
  tags = local.tags
}

# ---------------------------------------------------------------------------
# Origin bucket. Private: CloudFront reaches it through Origin Access Control,
# nothing is readable straight from S3.
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "site" {
  bucket = local.bucket_name
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Keeps the previous copy of every page, so a bad deploy is recoverable.
resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Old versions are only useful for rollback. Drop them after 90 days.
resource "aws_s3_bucket_lifecycle_configuration" "site" {
  bucket     = aws_s3_bucket.site.id
  depends_on = [aws_s3_bucket_versioning.site]

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# ---------------------------------------------------------------------------
# Certificate. Must live in us-east-1 for CloudFront to use it.
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "site" {
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = var.enable_www ? [local.www_domain] : []
  validation_method         = "DNS"
  tags                      = local.tags

  lifecycle {
    create_before_destroy = true
  }
}

# for_each keys come from a static local, so the plan is complete before apply
# even though the record values are only known afterwards.
resource "aws_route53_record" "cert_validation" {
  for_each = toset(local.cert_domains)

  zone_id         = local.zone_id
  allow_overwrite = true
  ttl             = 60

  name = one([
    for dvo in aws_acm_certificate.site.domain_validation_options :
    dvo.resource_record_name if dvo.domain_name == each.key
  ])

  type = one([
    for dvo in aws_acm_certificate.site.domain_validation_options :
    dvo.resource_record_type if dvo.domain_name == each.key
  ])

  records = [one([
    for dvo in aws_acm_certificate.site.domain_validation_options :
    dvo.resource_record_value if dvo.domain_name == each.key
  ])]
}

resource "aws_acm_certificate_validation" "site" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# ---------------------------------------------------------------------------
# CloudFront
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${local.bucket_name}-oac"
  description                       = "Lets CloudFront read ${local.bucket_name} while the bucket stays private."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "router" {
  name    = "${replace(var.domain_name, ".", "-")}-router"
  runtime = "cloudfront-js-2.0"
  comment = "www to apex redirect and directory-index rewriting for ${var.domain_name}"
  publish = true
  code    = file("${path.module}/cloudfront-router.js")
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_response_headers_policy" "site" {
  name    = "${replace(var.domain_name, ".", "-")}-security-headers"
  comment = "Baseline security headers for ${var.domain_name}"

  security_headers_config {
    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }

    dynamic "content_security_policy" {
      for_each = var.content_security_policy == null ? [] : [var.content_security_policy]

      content {
        content_security_policy = content_security_policy.value
        override                = true
      }
    }
  }
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = local.cert_domains
  price_class         = var.price_class
  comment             = coalesce(var.comment, var.domain_name)
  tags                = local.tags

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = local.origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.site.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.router.arn
    }
  }

  # A private bucket reached through OAC has no s3:ListBucket grant, so a missing
  # key comes back as 403 rather than 404. Both have to land on the 404 page.
  dynamic "custom_error_response" {
    for_each = toset([403, 404])

    content {
      error_code            = custom_error_response.value
      response_code         = 404
      response_page_path    = var.not_found_page
      error_caching_min_ttl = 60
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ---------------------------------------------------------------------------
# Bucket policy: only this distribution may read.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "site" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site.json

  depends_on = [aws_s3_bucket_public_access_block.site]
}

# ---------------------------------------------------------------------------
# DNS records pointing the domain at the distribution
# ---------------------------------------------------------------------------

resource "aws_route53_record" "site" {
  for_each = local.dns_records

  zone_id = local.zone_id
  name    = each.value.name
  type    = each.value.type

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}
