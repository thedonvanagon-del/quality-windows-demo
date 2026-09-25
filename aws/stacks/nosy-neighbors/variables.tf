variable "domain_name" {
  description = "Apex domain for the Nosy Neighbors site."
  type        = string
  default     = "nosyneighborscoffeeco.com"
}

variable "aws_region" {
  description = "Region for the origin bucket. The certificate is always created in us-east-1."
  type        = string
  default     = "us-west-2"
}

variable "create_hosted_zone" {
  description = "Leave false to adopt the zone that already exists. See the module variable for why this matters."
  type        = bool
  default     = false
}
