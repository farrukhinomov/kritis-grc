output "backend_url" {
  description = "Cloud Run URL of the API; the edge proxy forwards /api/* here."
  value       = google_cloud_run_v2_service.backend.uri
}

output "risk_engine_url" {
  description = "Cloud Run URL of the risk engine (callable only by the API's service account)."
  value       = google_cloud_run_v2_service.risk_engine.uri
}

output "image_repository" {
  description = "Artifact Registry path that CD pushes images to."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "workload_identity_provider" {
  description = "Value for google-github-actions/auth's workload_identity_provider input."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account" {
  description = "Service account GitHub Actions deploys as."
  value       = google_service_account.deployer.email
}

output "evidence_bucket" {
  description = "R2 bucket for File Evidence (EU jurisdiction)."
  value       = cloudflare_r2_bucket.evidence.name
}
