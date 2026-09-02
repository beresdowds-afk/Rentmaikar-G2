#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# RentMaikar Google Cloud Run Deployment Script (europe-west1: Belgium)
# ==============================================================================

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || echo "")}"
REGION="europe-west1"
SERVICE_NAME="rentmaikar"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: Google Cloud Project ID is required."
  echo "Usage: ./scripts/deploy-cloud-run-europe-west1.sh <YOUR_GCP_PROJECT_ID>"
  exit 1
fi

echo "==> Configuring Google Cloud settings..."
echo "  Project ID: ${PROJECT_ID}"
echo "  Region:     ${REGION} (Belgium)"
echo "  Service:    ${SERVICE_NAME}"
echo "  Image:      ${IMAGE_NAME}"

# Ensure Cloud Run and Artifact Registry / Container Registry APIs are enabled
echo "==> Enabling required GCP APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com containerregistry.googleapis.com --project "${PROJECT_ID}"

# Build and submit container image via Cloud Build
echo "==> Building container image via Google Cloud Build..."
gcloud builds submit --tag "${IMAGE_NAME}" --project "${PROJECT_ID}" .

# Deploy container image to Cloud Run in europe-west1
echo "==> Deploying container image to Cloud Run in ${REGION}..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_NAME}" \
  --platform managed \
  --region "${REGION}" \
  --port 80 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --project "${PROJECT_ID}"

echo "==> Successfully deployed ${SERVICE_NAME} to Cloud Run in ${REGION}!"
gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --project "${PROJECT_ID}" --format="value(status.url)"
