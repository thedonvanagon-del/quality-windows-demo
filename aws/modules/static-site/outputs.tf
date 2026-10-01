output "bucket_name" {
  description = "Origin bucket. Deploy by syncing the built site into it."
  value       = aws_s3_bucket.site.id
}

output "distribution_id" {
  description = "CloudFront distribution ID. Needed to invalidate the cache after a deploy."
  value       = aws_cloudfront_distribution.site.id
}

output "distribution_domain_name" {
  description = "CloudFront hostname. Useful for testing before DNS is pointed."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "hosted_zone_id" {
  description = "Route53 hosted zone serving this domain."
  value       = local.zone_id
}

output "name_servers" {
  description = "Set these four nameservers at your registrar. Until they match, the domain will not resolve."
  value       = local.name_servers
}

output "certificate_arn" {
  description = "Validated ACM certificate backing the distribution."
  value       = aws_acm_certificate_validation.site.certificate_arn
}

output "site_url" {
  description = "Public URL once DNS has propagated."
  value       = "https://${var.domain_name}"
}
