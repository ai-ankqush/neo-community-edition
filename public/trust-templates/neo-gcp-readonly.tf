# Neo AI Control - read-only GCP service account.
# Creates a service account with viewer + logging.viewer and a key Neo signs
# short-lived tokens with. No third party holds the key.
#
#   terraform init && terraform apply -var project_id=YOUR_PROJECT
#   terraform output -raw neo_sa_private_key   # paste into Neo
#   terraform output neo_sa_email              # paste into Neo

terraform {
  required_providers {
    google = { source = "hashicorp/google" }
  }
}

variable "project_id" {
  type        = string
  description = "GCP project running your AI workloads."
}

provider "google" {
  project = var.project_id
}

resource "google_service_account" "neo_readonly" {
  account_id   = "neo-readonly"
  display_name = "Neo AI Control (read-only)"
}

resource "google_project_iam_member" "viewer" {
  project = var.project_id
  role    = "roles/viewer"
  member  = "serviceAccount:${google_service_account.neo_readonly.email}"
}

resource "google_project_iam_member" "logging_viewer" {
  project = var.project_id
  role    = "roles/logging.viewer"
  member  = "serviceAccount:${google_service_account.neo_readonly.email}"
}

resource "google_service_account_key" "neo_key" {
  service_account_id = google_service_account.neo_readonly.name
}

output "neo_sa_email" {
  value = google_service_account.neo_readonly.email
}

output "neo_sa_private_key" {
  value     = base64decode(google_service_account_key.neo_key.private_key)
  sensitive = true
}
