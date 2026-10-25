locals {
  # Cloud Run's deterministic URL. Django must accept it as a host: the edge proxy
  # forwards requests to it under that name.
  backend_host = "grc-backend-${data.google_project.this.number}.${var.region}.run.app"
}

# Every service and job ignores its image after creation: releases are deployed by CD,
# and an apply must never roll a running release back.

resource "google_cloud_run_v2_service" "backend" {
  name                = "grc-backend"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  template {
    service_account = google_service_account.backend.email
    # Matches gunicorn's workers x threads: extra requests wait at the load balancer
    # instead of inside an overloaded instance.
    max_instance_request_concurrency = 8
    timeout                          = "60s"

    scaling {
      min_instance_count = 0
      # A hard cost ceiling for the public demo.
      max_instance_count = 1
    }

    containers {
      image = var.backend_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # Billed only while handling requests.
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "APP_ENV"
        value = "production"
      }
      env {
        name  = "ALLOWED_HOSTS"
        value = local.backend_host
      }
      env {
        name  = "CSRF_TRUSTED_ORIGINS"
        value = var.app_origin
      }
      env {
        name  = "RISK_ENGINE_URL"
        value = google_cloud_run_v2_service.risk_engine.uri
      }
      env {
        name = "DJANGO_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["django-secret-key"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["database-url-app"].secret_id
            version = "latest"
          }
        }
      }

      startup_probe {
        http_get {
          path = "/health/ready"
        }
        period_seconds    = 5
        failure_threshold = 12
      }
      liveness_probe {
        http_get {
          path = "/health/live"
        }
        period_seconds = 30
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_secret_manager_secret_iam_member.accessors]
}

# Public on purpose: the edge proxy calls it on behalf of browsers, and the application
# itself authenticates every request.
resource "google_cloud_run_v2_service_iam_member" "backend_public" {
  name     = google_cloud_run_v2_service.backend.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service" "risk_engine" {
  name                = "grc-risk-engine"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  template {
    service_account                  = google_service_account.risk_engine.email
    max_instance_request_concurrency = 40
    timeout                          = "30s"

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = var.risk_engine_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      env {
        name  = "APP_ENV"
        value = "production"
      }

      startup_probe {
        http_get {
          path = "/health/ready"
        }
        period_seconds    = 5
        failure_threshold = 12
      }
      liveness_probe {
        http_get {
          path = "/health/live"
        }
        period_seconds = 30
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}

# Reachable from the internet, but only callers with this role get past Google's front
# door: the API service, and nobody else.
resource "google_cloud_run_v2_service_iam_member" "risk_engine_called_by_backend" {
  name     = google_cloud_run_v2_service.risk_engine.name
  location = var.region
  role     = "roles/run.invoker"
  member   = google_service_account.backend.member
}
