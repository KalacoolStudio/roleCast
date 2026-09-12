variable "https_gateway_enabled" {
  type        = bool
  default     = false
  description = "Add a Google-hosted HTTPS gateway to the existing private VM."
}
variable "https_gateway_access" {
  type        = string
  default     = "restricted"
  description = "restricted: operator IAM invocation; iap: approved Google users; anonymous: public browser access and model usage."
  validation {
    condition     = contains(["restricted", "iap", "anonymous"], var.https_gateway_access)
    error_message = "Select restricted, iap, or anonymous gateway access."
  }
}
variable "https_gateway_min_instances" {
  type        = number
  default     = 0
  description = "Use 1 to reduce cold starts at additional idle-instance cost."
  validation {
    condition     = contains([0, 1], var.https_gateway_min_instances)
    error_message = "Select zero or one minimum gateway instances."
  }
}

locals {
  gateway_image = trimspace(file("${path.module}/gateway-image.txt"))
}
resource "google_project_service" "cloud_run" {
  count              = var.https_gateway_enabled ? 1 : 0
  service            = "run.googleapis.com"
  disable_on_destroy = false
}
resource "google_service_account" "gateway" {
  count        = var.https_gateway_enabled ? 1 : 0
  account_id   = "${var.name}-gateway"
  display_name = "Role Cast HTTPS gateway (no model or data permissions)"
  depends_on   = [google_project_service.required]
}
resource "google_compute_subnetwork" "gateway" {
  count                    = var.https_gateway_enabled ? 1 : 0
  name                     = "${var.name}-gateway"
  region                   = var.region
  network                  = google_compute_network.app.id
  ip_cidr_range            = "10.90.1.0/26"
  private_ip_google_access = true
}
resource "google_compute_firewall" "gateway" {
  count                   = var.https_gateway_enabled ? 1 : 0
  name                    = "${var.name}-gateway-to-app"
  network                 = google_compute_network.app.name
  direction               = "INGRESS"
  source_ranges           = [google_compute_subnetwork.gateway[0].ip_cidr_range]
  target_service_accounts = [google_service_account.runtime.email]
  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }
}
resource "google_cloud_run_v2_service" "gateway" {
  count                = var.https_gateway_enabled ? 1 : 0
  name                 = "${var.name}-gateway"
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_ALL"
  deletion_protection  = true
  iap_enabled          = var.https_gateway_access == "iap"
  invoker_iam_disabled = var.https_gateway_access == "anonymous"
  template {
    service_account                  = google_service_account.gateway[0].email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    timeout                          = "3600s"
    max_instance_request_concurrency = 80
    scaling {
      min_instance_count = var.https_gateway_min_instances
      max_instance_count = 2
    }
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.app.name
        subnetwork = google_compute_subnetwork.gateway[0].name
      }
    }
    containers {
      image   = local.gateway_image
      command = ["/bin/sh"]
      args    = ["-ec", "printf '%s' \"$ROLECAST_NGINX_CONFIG\" > /tmp/rolecast-nginx.conf; exec nginx -c /tmp/rolecast-nginx.conf -g 'daemon off;'"]
      ports { container_port = 8080 }
      env {
        name = "ROLECAST_NGINX_CONFIG"
        value = templatefile("${path.module}/gateway.conf.tftpl", {
          upstream = "${google_compute_instance.app.network_interface[0].network_ip}:8080"
        })
      }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      startup_probe {
        http_get {
          path = "/__gateway/ready"
          port = 8080
        }
        period_seconds    = 5
        timeout_seconds   = 3
        failure_threshold = 48
      }
    }
  }
  depends_on = [google_project_service.cloud_run, google_compute_firewall.gateway]
}
resource "google_cloud_run_v2_service_iam_member" "gateway_operators" {
  for_each = var.https_gateway_enabled ? var.administrators : toset([])
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.gateway[0].name
  role     = "roles/run.invoker"
  member   = each.value
}
resource "google_cloud_run_v2_service_iam_member" "gateway_iap" {
  count    = var.https_gateway_enabled && var.https_gateway_access == "iap" ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.gateway[0].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-iap.iam.gserviceaccount.com"
}
resource "google_iap_web_cloud_run_service_iam_member" "gateway_users" {
  for_each               = var.https_gateway_enabled && var.https_gateway_access == "iap" ? var.application_users : toset([])
  project                = var.project_id
  location               = var.region
  cloud_run_service_name = google_cloud_run_v2_service.gateway[0].name
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = each.value
}
output "application_https_url" {
  description = "Stable browser URL; access depends on https_gateway_access."
  value       = var.https_gateway_enabled ? google_cloud_run_v2_service.gateway[0].uri : null
}
output "application_https_access" {
  value = var.https_gateway_enabled ? var.https_gateway_access : "disabled"
}
