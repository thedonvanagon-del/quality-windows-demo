variable "domain_name" {
  description = "Apex domain for the Nosy Neighbors site."
  type        = string
  default     = "nosyneighbors.coffee"
}

variable "aws_region" {
  description = "Region for the origin bucket. The certificate is always created in us-east-1."
  type        = string
  default     = "us-west-2"
}

variable "create_hosted_zone" {
  description = <<-DESC
    true here, unlike the other stack.

    The domain is registered at Namecheap and still served by Namecheap's
    nameservers, so no Route53 zone exists for the apex yet. There is a Route53
    zone for "www.nosyneighbors.coffee" — a subdomain zone, not this one — and
    adopting that would put the apex records in the wrong place.
  DESC
  type        = bool
  default     = true
}

variable "mx_records" {
  description = <<-DESC
    Copied from the live Namecheap zone on 2026-09-28. These are Namecheap's
    email forwarding servers. They must exist in Route53 before the domain's
    nameservers are switched, or forwarded mail stops arriving with nothing
    visibly broken on the website.

    Re-check them against Namecheap before the switch; keep them in sync after.
  DESC
  type        = list(string)
  default = [
    "10 eforward1.registrar-servers.com",
    "10 eforward2.registrar-servers.com",
    "10 eforward3.registrar-servers.com",
    "15 eforward4.registrar-servers.com",
    "20 eforward5.registrar-servers.com",
  ]
}

variable "txt_records" {
  description = "Apex TXT records. The SPF entry below is Namecheap's, copied from the live zone on 2026-09-28."
  type        = list(string)
  default     = ["v=spf1 include:spf.efwd.registrar-servers.com ~all"]
}
