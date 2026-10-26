# Backend Execution Retirement Plan

This is a proposed, evidence-based follow-up phase only. No production deployment, webhook change, job deletion, Edge Function deletion, secret deletion, or rotation is authorized or performed by this code change. Repository files cannot establish which functions, URLs, cron jobs, or secret bindings are live.

## Candidate Edge paths

| Candidate | Repository evidence | Required migration/verification before retirement |
|---|---|---|
| `elevenlabs-tts`, `elevenlabs-tts-stream` | Browser callers now use BackendBridge, but `backend/src/routes/functions.ts` still proxies them to Supabase; Edge implementations call ElevenLabs and buffered TTS writes `elevenlabs_test_logs` / storage | Implement and test a Cloud Run ElevenLabs provider service; preserve auth, streaming/buffering, model/voice settings, logs/storage contract and cancellation; verify the Cloud Run env secret before Edge removal |
| `iot-scheduled-sync`, `hologram-sync`, `traccar-admin`, `sarekon-admin` schedule chain | Edge schedule reads `iot_sync_schedule` / `iot_sync_state` and dispatches provider-specific operations; backend `iot-scheduled-sync` currently runs the auto-provision pipeline instead | Match per-provider interval/disabled/error/success state using existing services; test provider failure and duplicate behavior; compare deployed `pg_cron` jobs and Cloud Run schedules before disabling Edge |
| Incident and telemetry notification chain | IoT accident, emergency dispatch, telemetry health, SMS commands and notification functions call each other over Edge URLs | Implement backend orchestration using existing IoT and communications services; prove authorization, escalation, opt-out, retry and idempotency; test end-to-end before updating producers |
| Payment/IVR notification chains | Several debit, payout, default, return, expiry, shutdown and event Edge functions directly call `send-sms-notification`; Edge functions contain financial workflow logic | Migrate only notification dispatch first; verify notification failures cannot mutate payment, payout, refund or ledger state; preserve regional provider and consent behavior; no financial Edge function retirement until separate idempotency/ownership review |
| `auto-submit-for-review`, referee and Persona inquiry functions | Submission dynamically calls `notify-referees`, `verify-referees`, and `persona-create-inquiry`; Cloud Run has no complete submission/referee/inquiry-creation service | Implement caller verification, region-specific documents, state transitions, downstream outcome persistence and safe retries; maintain human approval. Do not retire before those acceptance tests pass |
| `sent-inbound`, `sent-status`, `twilio-webhook`, `termii-webhook`, `sms-commands`, `whatsapp-commands` | Backend SENT relay and provider Edge functions still handle inbound/status and dynamically dispatch commands | Implement durable backend event processors/allowlist; verify signatures and provider parsing; demonstrate duplicate delivery is idempotent and privileged actions are impossible; then migrate provider webhook URLs in an approved deployment |
| `dispatch-event-notifications`, `retry-event-notifications`, notification targets | Existing SQL migrations define scheduled Edge calls and Edge event fan-out; backend has no complete event queue/retry replacement | Confirm live job definitions and durable queue contract; migrate cadence, dead-letter/retry and deduplication; only remove old schedule after observability confirms no duplicate/lost events |
| `recording-status-callback`, `voip-status-callback` | Cloud Run voice handlers exist, while Edge handlers and provider callback URLs remain in repository | Configure and validate callback URL, signatures, recording ownership and replay controls against Cloud Run; inspect provider dashboard before retiring Edge endpoints |
| `get-psp-config`, `get-paypal-config` | Frontend uses intercepted calls, but backend presently forwards to Edge and has no local read-only status handler | Implement admin-gated status-only routes that reveal no credential values and migrate UI; keep status unavailable rather than leaking settings |
| Other functions in migrations, docs, scripts, and `_shared` | Search results include `booking-email-trigger`, `send-booking-reminders`, `gps-worker-watchdog`, `mqtt-ingestion-worker`, `persona-reconcile`, `process-email-queue`, and other Supabase URLs | Classify each caller and compare to deployed job/callback configuration; do not infer inactivity from absent frontend references |

## Cutover checklist

- [ ] Approve a per-function migration list; retain Supabase Auth, Postgres/RLS, Storage, and explicitly retained Supabase-native operations.
- [ ] Verify Cloud Run revision, health, IAM, runtime service account, required environment variables/secrets, database access, and provider credentials in the target environment.
- [ ] Exercise function-specific authorization, ownership, idempotency, provider-failure, retry, audit and observability tests against staging.
- [ ] Inventory the actual deployed Edge Function list and compare it against frontend/backend/migration callers.
- [ ] Inventory deployed `pg_cron` jobs, `pg_net` requests, webhooks, TwiML callback URLs, and any CI/script schedulers; do not treat SQL source alone as proof of active state.
- [ ] Change one approved caller/schedule/webhook at a time and observe duplicate/lost events, financial effects, retry state and regional provider behavior.
- [ ] Obtain deployment verification and explicit approval before disabling Edge deployments or removing old schedules, callback URLs or secrets.
- [ ] Keep rollback paths until idempotent cutover and provider callback behavior have been verified.

## No-live-infrastructure assertion

The repository's `.github/workflows/deploy.yml` describes a deployment workflow, but this task did not invoke it. No production resources or secrets were queried or changed. The deploy workflow lists only a subset of backend secrets; runtime configuration and current Cloud Run/Edge deployment state must be verified by an authorized operator in the approved deployment phase.
