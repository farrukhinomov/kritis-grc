terraform {
  required_version = "~> 1.13"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.8"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28"
    }
  }

  # State lives in a versioned bucket created once by hand, so it survives
  # mistakes and can be rolled back. The bucket name is passed with -backend-config.
  backend "gcs" {
    prefix = "grc/demo"
  }
}
