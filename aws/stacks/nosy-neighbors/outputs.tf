output "bucket_name" {
  description = "Origin bucket for deploys."
  value       = module.site.bucket_name
}

output "distribution_id" {
  description = "CloudFront distribution ID, for cache invalidation."
  value       = module.site.distribution_id
}

output "distribution_domain_name" {
  description = "CloudFront hostname, for testing before DNS is pointed."
  value       = module.site.distribution_domain_name
}

output "name_servers" {
  description = "Nameservers this domain must use at its registrar."
  value       = module.site.name_servers
}

output "site_url" {
  description = "Public URL once DNS resolves."
  value       = module.site.site_url
}
