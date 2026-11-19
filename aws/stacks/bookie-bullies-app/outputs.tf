output "static_ip" {
  description = "Point the domain's A record here, then save it as the repo variable APP_HOST."
  value       = aws_lightsail_static_ip.app.ip_address
}

output "dns_record" {
  description = "The DNS record to add if Route 53 isn't handling it."
  value       = "A  ${var.domain_name}  ->  ${aws_lightsail_static_ip.app.ip_address}"
}

output "ssh" {
  value = "ssh -i bb-deploy ubuntu@${aws_lightsail_static_ip.app.ip_address}"
}
