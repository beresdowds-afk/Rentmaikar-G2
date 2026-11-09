# Document lifecycle operations

Private identity and vehicle documents, rideshare evidence, inspection photos, and damage evidence are uploaded through the Cloud Run file service. Vehicle listing photos remain public listing assets and are not verification evidence.

## Malware scanner

Configure `DOCUMENT_SCANNER_URL` and `DOCUMENT_SCANNER_TOKEN` as Cloud Run secrets/environment settings. The URL must use HTTPS. The backend posts the raw file bytes with a bearer token and `x-document-name`, `x-document-mime-type`, and `x-document-sha256` headers. The scanner must return JSON with `verdict` set to `clean` or `infected`, and may include a `scanner` identifier and `details`.

If either setting is absent, the scanner times out, returns a non-success status, or returns an invalid verdict, the file remains quarantined. No signed URL is issued, and the admin lifecycle page shows the failure. A clean verdict is recorded against both the evidence reconciliation row and, for KYC documents, the authoritative `user_documents` row before the document can enter review. An infected result is rejected. Scanner credentials remain server-side.

Schedule the Cloud Run `POST /api/functions/process-document-lifecycle` endpoint with the `x-cron-secret` header set from the server-side `CRON_SECRET`. This worker retries quarantined scans and processes retention-expired files. It does not expose a caller-controlled document or user identifier.

## Retention and legal holds

The migration creates disabled, category-specific rules for `identification`, `vehicle`, `inspection`, `damage`, and `rideshare`. No retention deadline or automatic archival is activated by default. An administrator must configure a positive `retention_days` value and a non-empty `legal_basis` before enabling a category. Policy changes are audited and apply to existing records in that category as well as future uploads.

Create an active `document_legal_holds` row for each affected document or evidence reconciliation record to preserve it for a dispute, legal hold, or regulatory obligation. Only administrators can create or release holds. The lifecycle worker checks holds both when selecting candidates and immediately before archival. Archival removes the storage object but retains document metadata, evidence hashes, review history, and lifecycle audit events.

Previously verified KYC documents, approved rideshare submissions, and completed inspection reports with photos but no verifiable malware scan are quarantined by migration and returned to pending review. Prior review metadata and photo paths are preserved in lifecycle audit events; affected files must be uploaded through the scanner and reviewed again before approval or access.

Replacing a rideshare or inspection image clears the current approval and submission state. The prior review decision is copied into the lifecycle audit trail, and the replacement remains unavailable until its scan completes.
