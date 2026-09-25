module "site" {
  source = "../../modules/static-site"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  domain_name        = var.domain_name
  create_hosted_zone = var.create_hosted_zone
  comment            = "Nosy Neighbors Coffee Co."

  tags = {
    Project = "nosy-neighbors"
    Owner   = "buddha-beans"
  }
}
