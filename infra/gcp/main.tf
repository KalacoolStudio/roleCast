locals {
  services = toset([
    "compute.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com",
    "iam.googleapis.com", "iamcredentials.googleapis.com", "sts.googleapis.com",
    "iap.googleapis.com", "oslogin.googleapis.com", "storage.googleapis.com",
  ])
  secret_ids = {
    LLM_API_KEY  = "${var.name}-llm-api-key"
    LLM_BASE_URL = "${var.name}-llm-base-url"
    LLM_MODEL    = "${var.name}-llm-model"
  }
  image_repository = "${var.region}-docker.pkg.dev/${var.project_id}/${var.name}/rolecast"
  runtime_config = {
    secretVersions = { for k, id in local.secret_ids : k => "projects/${var.project_id}/secrets/${id}/versions/${var.secret_versions[k]}" }
  }
}
resource "google_project_service" "required" {
  for_each           = local.services
  service            = each.value
  disable_on_destroy = false
}
data "google_project" "current" {
  project_id = var.project_id
}
data "google_compute_image" "cos" {
  family     = "cos-stable"
  project    = "cos-cloud"
  depends_on = [google_project_service.required]
}
resource "google_artifact_registry_repository" "app" {
  repository_id = var.name
  location      = var.region
  format        = "DOCKER"
  docker_config { immutable_tags = true }
  depends_on = [google_project_service.required]
}
resource "google_compute_network" "app" {
  name                    = var.name
  auto_create_subnetworks = false
  depends_on              = [google_project_service.required]
}
resource "google_compute_subnetwork" "app" {
  name                     = var.name
  region                   = var.region
  network                  = google_compute_network.app.id
  ip_cidr_range            = "10.90.0.0/24"
  private_ip_google_access = true
}
resource "google_compute_firewall" "iap" {
  name                    = "${var.name}-iap-only"
  network                 = google_compute_network.app.name
  direction               = "INGRESS"
  source_ranges           = ["35.235.240.0/20"]
  target_service_accounts = [google_service_account.runtime.email]
  allow {
    protocol = "tcp"
    ports    = ["22", "8080"]
  }
}
resource "google_compute_disk" "data" {
  name = "${var.name}-data"
  zone = var.zone
  type = "pd-balanced"
  size = var.data_disk_gb
  lifecycle { prevent_destroy = true }
  depends_on = [google_project_service.required]
}
resource "google_storage_bucket" "backups" {
  name                        = "${var.project_id}-${var.name}-backups"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  lifecycle_rule {
    condition { age = var.backup_retention_days }
    action { type = "Delete" }
  }
  lifecycle { prevent_destroy = true }
  depends_on = [google_project_service.required]
}
resource "google_secret_manager_secret" "runtime" {
  for_each  = local.secret_ids
  secret_id = each.value
  replication {
    auto {}
  }
  lifecycle { prevent_destroy = true }
  depends_on = [google_project_service.required]
}
resource "google_compute_instance" "app" {
  name                = var.name
  zone                = var.zone
  machine_type        = var.machine_type
  deletion_protection = true
  boot_disk {
    initialize_params {
      image = data.google_compute_image.cos.self_link
      size  = 20
      type  = "pd-balanced"
    }
  }
  attached_disk {
    source      = google_compute_disk.data.id
    device_name = "rolecast-data"
    mode        = "READ_WRITE"
  }
  network_interface {
    subnetwork = google_compute_subnetwork.app.id
    access_config {}
  }
  service_account {
    email  = google_service_account.runtime.email
    scopes = ["cloud-platform"]
  }
  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
  metadata = {
    enable-oslogin           = "TRUE"
    block-project-ssh-keys   = "TRUE"
    disable-legacy-endpoints = "TRUE"
    startup-script           = local.startup_script
  }
  depends_on = [google_compute_firewall.iap, google_artifact_registry_repository_iam_member.runtime, google_secret_manager_secret_iam_member.runtime, google_storage_bucket_iam_member.backup_writer]
}
