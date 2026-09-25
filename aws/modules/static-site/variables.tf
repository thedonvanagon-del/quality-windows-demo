variable "domain_name" {
  description = "Apex domain for the site, e.g. nosyneighborscoffeeco.com. No scheme, no www, no trailing dot."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]*\\.[a-z]{2,}$", var.domain_name))
    error_message = "domain_name must be a bare apex domain, e.g. example.com."
  }
}

variable "enable_www" {
  description = "Also serve www.<domain_name> and 301 it to the apex."
  type        = bool
  default     = true
}

variable "create_hosted_zone" {
  description = <<-DESC
    false (default): adopt the Route53 hosted zone that already exists for domain_name.
    true: create a new hosted zone.

    Leave this false if the domain was registered through Route53 -- registration
    already created a zone. A second zone serves different nameservers than the
    registrar points at, which is the usual reason a freshly deployed site never
    resolves. Check first:

      aws route53 list-hosted-zones-by-name --dns-name <domain_name>
  DESC
  type        = bool
  default     = false
}

variable "bucket_name" {
  description = "Override the origin bucket name. Defaults to the domain with dots replaced by dashes, suffixed '-site'. Must be globally unique across all of S3."
  type        = string
  default     = null
}

variable "price_class" {
  description = "CloudFront price class. PriceClass_100 covers North America and Europe and is the cheapest."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

variable "not_found_page" {
  description = "Object served for 404s, as a root-relative path."
  type        = string
  default     = "/404.html"
}

variable "comment" {
  description = "Human-readable label on the CloudFront distribution."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags merged into every taggable resource."
  type        = map(string)
  default     = {}
}

variable "content_security_policy" {
  description = <<-DESC
    Content-Security-Policy header value, or null to omit the header.

    The default allows Google Fonts and inline <style>/<script>, because both of
    these sites ship their CSS inline. Tighten it once the pages stop doing that.
    If you add a third-party form (Formspree, Mailchimp, Klaviyo), widen
    form-action and connect-src or the submission will be blocked.
  DESC
  type        = string
  default     = "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  nullable    = true
}
