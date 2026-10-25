provider "google" {
  project = var.project_id
  region  = var.region

  # Every resource carries the same labels, so costs and ownership stay traceable.
  default_labels = {
    app         = "grc"
    environment = var.environment
    managed-by  = "opentofu"
  }
}

# Reads its API token from the CLOUDFLARE_API_TOKEN environment variable, never from
# configuration or state.
provider "cloudflare" {}
