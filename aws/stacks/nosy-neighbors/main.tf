module "site" {
  source = "../../modules/static-site"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  domain_name        = var.domain_name
  create_hosted_zone = var.create_hosted_zone
  comment            = "Nosy Neighbors Coffee Co."

  # Carried over from Namecheap so email forwarding survives the nameserver move.
  mx_records  = var.mx_records
  txt_records = var.txt_records

  tags = {
    Project = "nosy-neighbors"
    Owner   = "buddha-beans"
  }
}
