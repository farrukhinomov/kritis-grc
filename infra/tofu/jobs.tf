# Jobs reuse the API image with a different command. Both run as the database owner, the
# only role allowed to change the schema or purge demo data.

locals {
  job_env = {
    APP_ENV              = "production"
    ALLOWED_HOSTS        = local.backend_host
    CSRF_TRUSTED_ORIGINS = var.app_origin
  }
  job_secrets = {
    DJANGO_SECRET_KEY = "django-secret-key"
    DATABASE_URL      = "database-url-owner"
  }
  jobs = {
    migrate = {
      name = "grc-migrate"
      args = ["python", "manage.py", "migrate", "--noinput"]
    }
    demo-reset = {
      name = "grc-demo-reset"
      args = ["python", "manage.py", "reset_demo_tenant"]
    }
  }
}

resource "google_cloud_run_v2_job" "this" {
  for_each = local.jobs

  name                = each.value.name
  location            = var.region
  deletion_protection = true

  template {
    template {
      service_account = google_service_account.jobs.email
      # A failed migration or reset must be looked at, not repeated blindly.
      max_retries = 0
      timeout     = "600s"

      containers {
        image   = var.backend_image
        command = [each.value.args[0]]
        args    = slice(each.value.args, 1, length(each.value.args))

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        dynamic "env" {
          for_each = local.job_env
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = local.job_secrets
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.this[env.value].secret_id
                version = "latest"
              }
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }

  depends_on = [google_secret_manager_secret_iam_member.accessors]
}

# --- Schedules --------------------------------------------------------------------------
# Both start paused: their endpoints and commands arrive with later milestones, and a
# schedule that fails every minute would only produce noise.

resource "google_cloud_scheduler_job" "outbox_drain" {
  name        = "grc-outbox-drain"
  region      = var.region
  description = "Delivers pending domain events; the safety net behind delivery on commit."
  schedule    = "* * * * *"
  time_zone   = "Etc/UTC"
  paused      = true

  attempt_deadline = "60s"
  retry_config {
    retry_count = 0
  }

  http_target {
    http_method = "POST"
    # Called on the service directly, not through the edge proxy; the signed token below
    # is what the endpoint checks.
    uri = "${google_cloud_run_v2_service.backend.uri}/internal/outbox/drain"
    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.backend.uri
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_scheduler_job" "demo_reset" {
  name        = "grc-demo-reset"
  region      = var.region
  description = "Restores the Demo Tenant every night; also keeps the free database awake."
  schedule    = "0 3 * * *"
  time_zone   = "Europe/Berlin"
  paused      = true

  attempt_deadline = "60s"

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/${google_cloud_run_v2_job.this["demo-reset"].id}:run"
    oauth_token {
      service_account_email = google_service_account.scheduler.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_job_iam_member" "scheduler_runs_demo_reset" {
  name     = google_cloud_run_v2_job.this["demo-reset"].name
  location = var.region
  role     = "roles/run.invoker"
  member   = google_service_account.scheduler.member
}
