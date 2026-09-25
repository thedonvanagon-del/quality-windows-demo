terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }

  # Local state is fine for one person on one machine. Once anyone else deploys,
  # create the bucket then uncomment this and run `terraform init -migrate-state`.
  # backend "s3" {
  #   bucket       = "CHANGE-ME-tfstate"
  #   key          = "STACK-NAME/terraform.tfstate"
  #   region       = "us-west-2"
  #   encrypt      = true
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.aws_region
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
