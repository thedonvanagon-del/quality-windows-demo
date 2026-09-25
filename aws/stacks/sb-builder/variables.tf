variable "domain_name" {
  description = <<-DESC
    Apex domain for the Santa Barbara small business website builder.

    No default on purpose: unlike the coffee site, nobody has told me which
    domain this ships on. Set it in terraform.tfvars before the first apply.
  DESC
  type        = string
}

variable "aws_region" {
  description = "Region for the origin bucket. The certificate is always created in us-east-1."
  type        = string
  default     = "us-west-2"
}

variable "create_hosted_zone" {
  description = "Set true if no Route53 hosted zone exists for this domain yet."
  type        = bool
  default     = false
}
