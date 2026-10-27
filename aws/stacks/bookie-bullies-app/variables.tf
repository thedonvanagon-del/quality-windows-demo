variable "domain_name" {
  description = "Where the app answers. Its DNS A record points at the static IP this stack outputs."
  type        = string
  default     = "app.bookiebullies.com"
}

variable "aws_region" {
  description = "Lightsail region. Ohio, next to the Bookie Bullies site."
  type        = string
  default     = "us-east-2"
}

variable "availability_zone" {
  type    = string
  default = "us-east-2a"
}

variable "bundle_id" {
  description = <<-DESC
    Server size. nano is the smallest Linux plan with a disk and an IPv4
    address included; it runs this app with room to spare. List the current
    plans and prices with: aws lightsail get-bundles --region us-east-2
  DESC
  type        = string
  default     = "nano_3_0"
}

variable "deploy_public_key" {
  description = <<-DESC
    Public half of the SSH key GitHub Actions deploys with. Make one in
    CloudShell with: ssh-keygen -t ed25519 -N "" -f bb-deploy
    then paste the contents of bb-deploy.pub here. The private half
    (bb-deploy) goes in the repo secret APP_SSH_KEY.
  DESC
  type        = string
}

variable "route53_zone_id" {
  description = "If bookiebullies.com's DNS is in Route 53, its hosted zone ID, and this stack adds the record. Leave null to add the A record by hand."
  type        = string
  default     = null
}
