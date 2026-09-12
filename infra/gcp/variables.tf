variable "project_id" {
  type        = string
  description = "Existing billed Google Cloud project; this module never creates or changes project billing."
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Supply a valid GCP project ID."
  }
}
variable "region" {
  type    = string
  default = "asia-east1"
  validation {
    condition     = can(regex("^[a-z]+-[a-z]+[0-9]+$", var.region))
    error_message = "Supply a valid GCP region."
  }
}
variable "zone" {
  type    = string
  default = "asia-east1-b"
  validation {
    condition     = can(regex("^[a-z]+-[a-z]+[0-9]+-[a-z]$", var.zone)) && startswith(var.zone, "${var.region}-")
    error_message = "The zone must belong to the configured region."
  }
}
variable "name" {
  type    = string
  default = "rolecast"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{3,18}[a-z0-9]$", var.name))
    error_message = "Use a 5-20 character lowercase resource prefix."
  }
}
variable "github_repository" {
  type    = string
  default = "KalacoolStudio/roleCast"
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Use owner/repository."
  }
}
variable "github_repository_id" {
  type        = string
  description = "Stable numeric GitHub repository ID, obtained from gh api repos/OWNER/REPO."
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.github_repository_id))
    error_message = "Use the numeric repository ID."
  }
}
variable "github_owner_id" {
  type        = string
  description = "Stable numeric GitHub repository owner ID."
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.github_owner_id))
    error_message = "Use the numeric owner ID."
  }
}
variable "application_users" {
  type        = set(string)
  description = "Explicit user:email or group:email members allowed to use the shared app via IAP."
  validation {
    condition     = length(var.application_users) > 0 && alltrue([for p in var.application_users : can(regex("^(user|group):[^ @]+@[^ @]+$", p))])
    error_message = "Specify at least one explicit user:email or group:email; public principals are not allowed."
  }
}
variable "administrators" {
  type        = set(string)
  default     = []
  description = "Trusted operators with IAP SSH, OS Admin Login, and backup reading permissions."
  validation {
    condition     = alltrue([for p in var.administrators : can(regex("^(user|group):[^ @]+@[^ @]+$", p))])
    error_message = "Use explicit user:email or group:email members."
  }
}
variable "machine_type" {
  type    = string
  default = "e2-small"
}
variable "data_disk_gb" {
  type    = number
  default = 10
  validation {
    condition     = var.data_disk_gb >= 10 && floor(var.data_disk_gb) == var.data_disk_gb
    error_message = "Use an integer disk size of at least 10 GB."
  }
}
variable "initialize_data_disk" {
  type        = bool
  default     = false
  description = "Set true only for first bootstrap of the newly provisioned blank disk, then apply false. Existing filesystems are never reformatted."
}
variable "backup_retention_days" {
  type    = number
  default = 30
  validation {
    condition     = var.backup_retention_days >= 1 && floor(var.backup_retention_days) == var.backup_retention_days
    error_message = "Retention must be a positive whole number of days."
  }
}
variable "secret_versions" {
  type        = object({ LLM_API_KEY = string, LLM_BASE_URL = string, LLM_MODEL = string })
  default     = { LLM_API_KEY = "1", LLM_BASE_URL = "1", LLM_MODEL = "1" }
  description = "Numeric Secret Manager versions only, never secret values or the mutable latest alias."
  validation {
    condition     = alltrue([for v in values(var.secret_versions) : can(regex("^[1-9][0-9]*$", v))])
    error_message = "Pin each secret to a numeric version."
  }
}
