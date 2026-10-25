# Secret containers only. Their values are added out of band by an operator, so no secret
# value ever appears in configuration, plans or state.

locals {
  secrets = {
    django-secret-key    = [google_service_account.backend, google_service_account.jobs]
    database-url-app     = [google_service_account.backend]
    database-url-owner   = [google_service_account.jobs]
    r2-access-key-id     = [google_service_account.backend, google_service_account.jobs]
    r2-secret-access-key = [google_service_account.backend, google_service_account.jobs]
    anthropic-api-key    = [google_service_account.risk_engine]
  }

  secret_accessors = merge([
    for secret, accounts in local.secrets : {
      for account in accounts : "${secret}/${account.account_id}" => {
        secret = secret
        member = account.member
      }
    }
  ]...)
}

resource "google_secret_manager_secret" "this" {
  for_each = local.secrets

  secret_id = each.key

  # Stored in Frankfurt only, never replicated outside the EU.
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "accessors" {
  for_each = local.secret_accessors

  secret_id = google_secret_manager_secret.this[each.value.secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value.member
}
