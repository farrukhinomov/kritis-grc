variable "project_id" {
  description = "Google Cloud project that hosts the demo."
  type        = string
}

variable "region" {
  description = "Google Cloud region. Frankfurt keeps every byte of tenant data in Germany."
  type        = string
  default     = "europe-west3"

  validation {
    condition     = startswith(var.region, "europe-")
    error_message = "Tenant data must stay in the EU: choose a europe-* region."
  }
}

variable "environment" {
  description = "Environment name used in labels and resource names."
  type        = string
  default     = "demo"
}

variable "github_repository" {
  description = "GitHub repository (owner/name) that may deploy through Workload Identity Federation."
  type        = string
}

variable "billing_account_id" {
  description = "Billing account the budget alert is attached to (format XXXXXX-XXXXXX-XXXXXX)."
  type        = string
}

variable "budget_amount" {
  description = "Monthly budget in the billing account's currency. Alerts only; it never stops spending."
  type        = number
  default     = 1
}

variable "budget_currency" {
  description = "Currency of the billing account; must match it exactly."
  type        = string
  default     = "EUR"
}

variable "budget_alert_emails" {
  description = "Addresses that receive budget alerts, in addition to the billing account's admins."
  type        = list(string)
  default     = []
}

variable "backend_image" {
  description = "Initial image for the Django service. Later releases are deployed by CD, not by OpenTofu."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "risk_engine_image" {
  description = "Initial image for the risk engine. Later releases are deployed by CD, not by OpenTofu."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "app_origin" {
  description = "Origin the browser loads the app from; the only origin allowed to talk to the storage bucket."
  type        = string
  default     = "https://grc.inomov.online"
}

variable "cloudflare_account_id" {
  description = "Cloudflare account that owns the R2 bucket."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare DNS zone of the app's domain."
  type        = string
}

variable "app_hostname" {
  description = "Hostname of the app inside the Cloudflare zone."
  type        = string
  default     = "grc"
}

variable "evidence_bucket_name" {
  description = "Name of the R2 bucket that stores File Evidence."
  type        = string
  default     = "grc-demo-evidence"
}
