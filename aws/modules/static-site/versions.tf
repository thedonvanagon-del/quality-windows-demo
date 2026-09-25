terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"

      # CloudFront reads ACM certificates only from us-east-1, wherever the rest
      # of the stack lives. The caller must pass both providers.
      configuration_aliases = [aws.us_east_1]
    }
  }
}
