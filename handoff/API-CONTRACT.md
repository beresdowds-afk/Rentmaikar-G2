# RentMaikar API Contract & Gateway Specification

## 1. Architectural Principles

1. **Frontend-to-Backend Protocol**: All communication from the client React application to the backend API Gateway takes place over HTTPS with strict TLS 1.3 encryption.
2. **Bearer Token Authentication**: The frontend attaches the current Supabase session JWT in the `Authorization: Bearer <token>` header for authenticated routes.
3. **Secret Isolation**: Client-side applications (`rentmaikar.com`) only hold public publishable keys (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`). All service role keys, Twilio auth tokens, CPaaS secrets, and payment provider keys reside exclusively on the server.

---

## 2. Domain & Origin Policy

- **Frontend Origin**: `https://rentmaikar.com` (and `https://www.rentmaikar.com`)
- **Backend Origin**: `https://staging.rentmaikar.com` (port 5000 in Docker)
- **CORS Allowed Methods**: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`
- **Allowed Headers**: `Content-Type`, `Authorization`, `X-Requested-With`, `X-Region-Code`

---

## 3. Endpoints

### 3.1 Health & Readiness (`/api/health`)

- **Method**: `GET`
- **Auth**: Public
- **Response (200 OK)**:
```json
{
  "status": "healthy",
  "service": "rentmaikar-backend-gateway",
  "version": "1.0.0",
  "timestamp": "2026-09-03T14:40:00.000Z",
  "uptime": 1245.3,
  "environment": "production"
}
```

### 3.2 Canonical Domains (`/api/domains`)

- **Method**: `GET`
- **Auth**: Public
- **Response (200 OK)**:
```json
{
  "status": "ok",
  "domains": {
    "frontendDomain": "rentmaikar.com",
    "frontendOrigin": "https://rentmaikar.com",
    "backendDomain": "staging.rentmaikar.com",
    "backendUrl": "https://staging.rentmaikar.com",
    "incomingMailDomain": "backend.rentmaikar.com",
    "outgoingMailDomain": "notify.rentmaikar.com"
  }
}
```

### 3.3 CPaaS Message Dispatch (`/api/cpaas/send`)

- **Method**: `POST`
- **Auth**: `Authorization: Bearer <jwt>` (Admin, Assistant, or System caller)
- **Request Body**:
```json
{
  "channel": "sms" | "whatsapp",
  "recipient": "+16085489220",
  "message": "Your verification code is 492019",
  "region": "USA" | "Nigeria",
  "metadata": {
    "userId": "uuid",
    "purpose": "2fa_verification"
  }
}
```
- **Response (200 OK)**:
```json
{
  "success": true,
  "messageId": "msg_cpaas_89412051",
  "status": "queued",
  "provider": "sent.dm"
}
```

### 3.4 Inbound Webhooks (`/api/webhooks/sent`, `/api/webhooks/twilio`)

- **Method**: `POST`
- **Signature Verification**: Validated against `SENT_WEBHOOK_SECRET` or `TWILIO_AUTH_TOKEN`
- **Payload**: Raw JSON or URL-encoded form data

---

## 4. Standard Error Response

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired authorization token",
  "statusCode": 401,
  "timestamp": "2026-09-03T14:40:00.000Z"
}
```
