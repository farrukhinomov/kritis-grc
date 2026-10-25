# One service account per workload, each with only the access it needs.

resource "google_service_account" "backend" {
  account_id   = "grc-backend"
  display_name = "GRC API (Django) runtime"
}

resource "google_service_account" "risk_engine" {
  account_id   = "grc-risk-engine"
  display_name = "GRC risk engine runtime"
}

resource "google_service_account" "jobs" {
  account_id   = "grc-jobs"
  display_name = "GRC migration and demo-reset jobs"
}

resource "google_service_account" "scheduler" {
  account_id   = "grc-scheduler"
  display_name = "GRC Cloud Scheduler caller"
}

resource "google_service_account" "deployer" {
  account_id   = "grc-deployer"
  display_name = "GRC deployments from GitHub Actions"
}

# --- Workload Identity Federation -------------------------------------------------------
# GitHub Actions exchanges its short-lived OIDC token for Google credentials. No service
# account key exists anywhere, so there is nothing that could leak or need rotating.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Only this repository can authenticate at all; forks and other repositories can't.
  attribute_condition = "assertion.repository == '${var.github_repository}'"
}

# Only workflows running on main may deploy; pull requests from any branch cannot.
resource "google_service_account_iam_member" "deployer_from_github_main" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.ref/refs/heads/main"
}

# --- Deployer permissions ---------------------------------------------------------------

resource "google_artifact_registry_repository_iam_member" "deployer_pushes_images" {
  repository = google_artifact_registry_repository.images.name
  location   = var.region
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.deployer.member
}

resource "google_project_iam_member" "deployer_deploys_cloud_run" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = google_service_account.deployer.member
}

# Deploying a service or job "as" its runtime account requires permission to act as it.
resource "google_service_account_iam_member" "deployer_acts_as_runtime" {
  for_each = {
    backend     = google_service_account.backend.name
    risk_engine = google_service_account.risk_engine.name
    jobs        = google_service_account.jobs.name
  }

  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer.member
}
