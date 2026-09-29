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
    Mail for this domain is handled by the Buddha Beans Google Workspace, with
    nosyneighbors.coffee added there as a secondary domain (2026-09-29).
    hello@ is an alias on an existing Workspace user, so this adds no license.

    smtp.google.com at priority 1 is what the Admin console gives new domains;
    buddhabeanscoffee.com uses aspmx.l.google.com, and either is valid.

    These must exist in Route53 before the nameservers ever move there, or
    mail stops arriving with nothing visibly wrong on the website. Check them
    against the live zone first.
  DESC
  type        = list(string)
  default     = ["1 smtp.google.com"]
}

variable "txt_records" {
  description = <<-DESC
    Apex TXT records: SPF authorising Google to send for the domain.

    Add the google-site-verification value from the Admin console here too
    before any move to Route53 -- Google re-checks it, and losing it can
    unverify the domain.

    This module only manages apex MX and TXT. The DKIM record
    (google._domainkey) and DMARC record (_dmarc) live at other names and must
    be recreated by hand in Route53 before a nameserver switch. Without DKIM,
    mail sent as hello@ loses its signature and starts landing in spam.
  DESC
  type        = list(string)
  default     = ["v=spf1 include:_spf.google.com ~all"]
}
