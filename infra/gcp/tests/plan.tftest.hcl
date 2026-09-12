mock_provider "google" {}

variables {
  project_id           = "rolecast-example"
  github_repository_id = "123456789"
  github_owner_id      = "1234567"
  application_users    = ["user:viewer@example.com"]
  administrators       = ["user:operator@example.com"]
}

run "private_persistent_runtime" {
  command = plan
  assert {
    condition     = alltrue([for f in local.startup_files : !strcontains(f.content, "ExecStart=/var/lib/") && !strcontains(f.content, "ExecStopPost=/var/lib/")])
    error_message = "COS /var is noexec; units must invoke the host script through /bin/bash."
  }
  assert {
    condition     = google_compute_firewall.iap.source_ranges == toset(["35.235.240.0/20"])
    error_message = "Only IAP sources may reach the VM."
  }
  assert {
    condition     = google_compute_instance.app.deletion_protection && google_compute_disk.data.size == 10 && length(google_compute_instance.app.attached_disk) == 1
    error_message = "The VM must retain a separate persistent data disk."
  }
  assert {
    condition     = google_storage_bucket.backups.public_access_prevention == "enforced" && !google_storage_bucket.backups.force_destroy
    error_message = "Backups must be private and protected from implicit deletion."
  }
  assert {
    condition     = google_iap_tunnel_instance_iam_member.app_users["user:viewer@example.com"].condition[0].expression == "destination.port == 8080" && !contains(keys(google_compute_instance_iam_member.operators), "user:viewer@example.com")
    error_message = "App users must not get shell access."
  }
  assert {
    condition     = strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "assertion.repository_id == '123456789'") && strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "assertion.repository_owner_id == '1234567'") && strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, "assertion.ref == 'refs/heads/main'") && strcontains(google_iam_workload_identity_pool_provider.github.attribute_condition, ".github/workflows/deploy-gcp.yml@refs/heads/main")
    error_message = "Cloud identity must be bound to the repository, owner, branch and deployment workflow."
  }
  assert {
    condition     = length(google_secret_manager_secret.runtime) == 3 && google_storage_bucket_iam_member.backup_writer.role == "roles/storage.objectCreator"
    error_message = "Runtime receives only named secret access and backup creation rights."
  }
}
run "reject_public_access" {
  command = plan
  variables { application_users = ["allUsers"] }
  expect_failures = [var.application_users]
}
run "reject_wrong_zone" {
  command = plan
  variables { zone = "us-central1-a" }
  expect_failures = [var.zone]
}
run "reject_mutable_secret" {
  command = plan
  variables { secret_versions = { LLM_API_KEY = "latest", LLM_BASE_URL = "1", LLM_MODEL = "1" } }
  expect_failures = [var.secret_versions]
}
