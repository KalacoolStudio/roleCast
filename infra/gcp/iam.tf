resource "google_service_account" "runtime" {
  account_id   = "${var.name}-runtime"
  display_name = "Role Cast runtime"
  depends_on   = [google_project_service.required]
}
resource "google_service_account" "deploy" {
  account_id   = "${var.name}-deploy"
  display_name = "Role Cast main-branch deployment"
  depends_on   = [google_project_service.required]
}
resource "google_artifact_registry_repository_iam_member" "runtime" {
  location   = var.region
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.runtime.email}"
}
resource "google_artifact_registry_repository_iam_member" "deploy" {
  location   = var.region
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deploy.email}"
}
resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each  = google_secret_manager_secret.runtime
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}
resource "google_storage_bucket_iam_member" "backup_writer" {
  bucket = google_storage_bucket.backups.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.runtime.email}"
}
resource "google_storage_bucket_iam_member" "backup_readers" {
  for_each = var.administrators
  bucket   = google_storage_bucket.backups.name
  role     = "roles/storage.objectViewer"
  member   = each.value
}
resource "google_project_iam_custom_role" "discovery" {
  project     = var.project_id
  role_id     = "${replace(var.name, "-", "_")}_instance_discovery"
  title       = "Role Cast instance discovery"
  permissions = ["compute.instances.get", "compute.instances.list", "compute.projects.get"]
}
locals {
  operators = setunion(var.administrators, toset(["serviceAccount:${var.name}-deploy@${var.project_id}.iam.gserviceaccount.com"]))
  clients   = setunion(var.application_users, local.operators)
}
resource "google_project_iam_member" "discovery" {
  project    = var.project_id
  for_each   = local.clients
  role       = google_project_iam_custom_role.discovery.name
  member     = each.value
  depends_on = [google_service_account.deploy]
}
resource "google_iap_tunnel_instance_iam_member" "app_users" {
  for_each = var.application_users
  project  = var.project_id
  zone     = var.zone
  instance = google_compute_instance.app.name
  role     = "roles/iap.tunnelResourceAccessor"
  member   = each.value
  condition {
    title      = "application-port-only"
    expression = "destination.port == 8080"
  }
}
resource "google_iap_tunnel_instance_iam_member" "operators" {
  for_each = local.operators
  project  = var.project_id
  zone     = var.zone
  instance = google_compute_instance.app.name
  role     = "roles/iap.tunnelResourceAccessor"
  member   = each.value
  condition {
    title      = "administrative-ssh-only"
    expression = "destination.port == 22"
  }
  depends_on = [google_service_account.deploy]
}
resource "google_compute_instance_iam_member" "operators" {
  for_each      = local.operators
  project       = var.project_id
  zone          = var.zone
  instance_name = google_compute_instance.app.name
  role          = "roles/compute.osAdminLogin"
  member        = each.value
  depends_on    = [google_service_account.deploy]
}
resource "google_service_account_iam_member" "runtime_use" {
  for_each           = local.operators
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = each.value
  depends_on         = [google_service_account.deploy]
}
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${var.name}-github"
  display_name              = "Role Cast GitHub"
  depends_on                = [google_project_service.required]
}
resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-main"
  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.owner_id"      = "assertion.repository_owner_id"
  }
  attribute_condition = "assertion.repository_id == '${var.github_repository_id}' && assertion.repository_owner_id == '${var.github_owner_id}' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == '${var.github_repository}/.github/workflows/deploy-gcp.yml@refs/heads/main' && (assertion.event_name == 'push' || assertion.event_name == 'workflow_dispatch')"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}
resource "google_service_account_iam_member" "github" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}
