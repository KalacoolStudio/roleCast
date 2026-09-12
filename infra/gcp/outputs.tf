output "github_variables" {
  description = "Non-secret GitHub production environment variables."
  value = merge({
    GCP_PROJECT_ID                 = var.project_id
    GCP_REGION                     = var.region
    GCP_ZONE                       = var.zone
    GCP_INSTANCE                   = google_compute_instance.app.name
    GCP_REPOSITORY                 = google_artifact_registry_repository.app.repository_id
    GCP_WORKLOAD_IDENTITY_PROVIDER = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOY_SERVICE_ACCOUNT     = google_service_account.deploy.email
    }, var.https_gateway_enabled ? {
    GCP_APPLICATION_URL = google_cloud_run_v2_service.gateway[0].uri
  } : {})
}
output "runtime_secret_versions" { value = local.runtime_config.secretVersions }
output "backup_bucket" { value = google_storage_bucket.backups.name }
output "data_disk" { value = google_compute_disk.data.name }
output "application_tunnel" {
  value = "gcloud compute start-iap-tunnel ${var.name} 8080 --project=${var.project_id} --zone=${var.zone} --local-host-port=127.0.0.1:18080"
}
output "administrator_ssh" {
  value = "gcloud compute ssh ${var.name} --project=${var.project_id} --zone=${var.zone} --tunnel-through-iap"
}
