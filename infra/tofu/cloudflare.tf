# File Evidence storage and the app's DNS name.

resource "cloudflare_r2_bucket" "evidence" {
  account_id = var.cloudflare_account_id
  name       = var.evidence_bucket_name
  # The EU jurisdiction can only be set at creation: data never leaves the EU, and moving
  # it later means a new bucket and a migration.
  jurisdiction = "eu"
}

# No public r2.dev address: files are only reachable through short-lived signed URLs.
resource "cloudflare_r2_managed_domain" "evidence" {
  account_id   = var.cloudflare_account_id
  bucket_name  = cloudflare_r2_bucket.evidence.name
  jurisdiction = cloudflare_r2_bucket.evidence.jurisdiction
  enabled      = false
}

# Browsers upload and download directly with signed URLs, and only from the app's origin.
resource "cloudflare_r2_bucket_cors" "evidence" {
  account_id   = var.cloudflare_account_id
  bucket_name  = cloudflare_r2_bucket.evidence.name
  jurisdiction = cloudflare_r2_bucket.evidence.jurisdiction

  rules = [{
    allowed = {
      methods = ["GET", "PUT"]
      origins = [var.app_origin]
      headers = ["content-type"]
    }
    max_age_seconds = 3600
  }]
}

resource "cloudflare_dns_record" "app" {
  zone_id = var.cloudflare_zone_id
  name    = var.app_hostname
  type    = "CNAME"
  content = "cname.vercel-dns.com"
  # DNS only: proxying through Cloudflare would interfere with Vercel's own certificate.
  proxied = false
  ttl     = 1
  comment = "GRC platform frontend on Vercel (managed by OpenTofu)"
}
