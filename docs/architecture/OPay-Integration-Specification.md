# OPay Checkout & Cashier API Specification (Authentic Documentation)

This document provides the authentic architectural and technical specification for integrating **OPay (Payment Service Provider)** into the RentMaikar platform for Nigerian operations, alongside **PayPal** as the primary Global/US PSP and **Paystack**.

---

## 1. Official OPay API Overview

OPay provides a merchant payment interface (**OPay Cashier API**) supporting hosted Express Checkout, bank cards, direct bank transfers, USSD, and OPay Wallet QR payments.

* **Primary Documentation Portal**: `https://documentation.opaycheckout.com/`
* **Merchant Dashboard**: `https://merchant.opaycheckout.com/` (or `https://merchant.opayweb.com/`)
* **Standard Currency**: `NGN` (Nigerian Naira)

---

## 2. API Environments & Base URLs

| Environment | Base URL | Purpose |
| :--- | :--- | :--- |
| **Sandbox / Staging** | `https://sandboxapi.opaycheckout.com` | Sandbox testing with test cards and simulated transfers |
| **Alternative Sandbox** | `https://testapi.opaycheckout.com` | Legacy international test gateway |
| **Production / Live** | `https://liveapi.opaycheckout.com` | Live transactions in production |
| **Alternative Live** | `https://api.opaycheckout.com` | Production international cashier gateway |

---

## 3. Authentication & Security Headers

OPay uses dual-factor header authentication for Cashier operations:

1. **`MerchantId`**: Your unique alphanumeric OPay Merchant ID (e.g. `256621000000000`).
2. **`Authorization`**: Bearer token containing your **Merchant Public Key** for client-initiated and cashier checkout creation:
   ```http
   Authorization: Bearer OPAY_PUB_KEY_live_...
   MerchantId: 256621000000000
   Content-Type: application/json
   ```
3. **`HMAC-SHA512 Signature`**: For server-to-server status queries and webhook signature verification, requests and notifications are signed using your **Merchant Private/Secret Key**.

---

## 4. Cashier Create Payment Endpoint

### `POST /api/v1/international/cashier/create`

Initializes an order and returns an authorized `cashierUrl`. The customer is redirected to this secure hosted page to complete payment.

#### Request Headers:
```http
POST /api/v1/international/cashier/create HTTP/1.1
Host: liveapi.opaycheckout.com
Content-Type: application/json
MerchantId: 256621000000000
Authorization: Bearer OPAYPR_XXXXXXXXXXXXX
```

#### Request Body (JSON):
```json
{
  "country": "NG",
  "reference": "RENTMAIKAR-RENTAL-7b2c9d81-1725712000",
  "amount": "6500000",
  "currency": "NGN",
  "returnUrl": "https://rentmaikar.com/driver/wallet?payment_status=success",
  "callbackUrl": "https://api.rentmaikar.com/webhooks/opay",
  "cancelUrl": "https://rentmaikar.com/driver/wallet?payment_status=cancelled",
  "userPhone": "+2348012345678",
  "userEmail": "driver@rentmaikar.com",
  "productName": "Weekly Vehicle Rental",
  "productDesc": "Vehicle weekly placement deposit and rental payment",
  "payMethod": "BankCard,BankTransfer,OpayWallet,USSD",
  "expireAt": 1800
}
```

*Note: In the OPay international cashier API, `amount` is specified in kobo (minor currency unit: 100 kobo = 1 NGN). For example, ₦65,000 is represented as `"6500000"`.*

#### Success Response:
```json
{
  "code": "00000",
  "message": "SUCCESS",
  "data": {
    "reference": "RENTMAIKAR-RENTAL-7b2c9d81-1725712000",
    "orderNo": "OPAY2026090712392212345",
    "amount": "6500000",
    "currency": "NGN",
    "status": "INITIAL",
    "cashierUrl": "https://cashier.opaycheckout.com/pay/index.html?token=OPAY_CASHIER_TOKEN_123456"
  }
}
```

---

## 5. Cashier Payment Status Query Endpoint

### `POST /api/v1/international/cashier/status`

Allows merchants to actively query the real-time status of a transaction if webhooks are delayed.

#### Request Headers:
```http
POST /api/v1/international/cashier/status HTTP/1.1
Host: liveapi.opaycheckout.com
Content-Type: application/json
MerchantId: 256621000000000
Authorization: Bearer <HMAC-SHA512 or Merchant_Key>
```

#### Request Body:
```json
{
  "reference": "RENTMAIKAR-RENTAL-7b2c9d81-1725712000",
  "country": "NG"
}
```

#### Status Response:
```json
{
  "code": "00000",
  "message": "SUCCESS",
  "data": {
    "reference": "RENTMAIKAR-RENTAL-7b2c9d81-1725712000",
    "orderNo": "OPAY2026090712392212345",
    "amount": "6500000",
    "currency": "NGN",
    "status": "SUCCESSFUL",
    "fee": "97500",
    "token": "tok_123456",
    "payMethod": "BankCard",
    "channel": "OPAY_APP",
    "paidAt": "2026-09-07T12:42:15Z"
  }
}
```

Possible transaction statuses:
- `INITIAL`: Order created, awaiting customer action.
- `PENDING`: Payment in progress (e.g. awaiting bank transfer confirmation).
- `SUCCESSFUL`: Payment completed successfully.
- `FAILED`: Payment failed or rejected by bank.
- `TIMEOUT`: Transaction timed out before completion.
- `CLOSED`: Cancelled by merchant or user.

---

## 6. Webhook Notification & HMAC-SHA512 Verification

When a driver completes payment via OPay, OPay triggers an HTTP `POST` request to the configured `callbackUrl`.

### Webhook Headers:
```http
POST /webhooks/opay HTTP/1.1
Host: api.rentmaikar.com
Content-Type: application/json
X-Opay-Tranid: 2026090712392212345
merchantId: 256621000000000
```

### Webhook Payload:
```json
{
  "reference": "RENTMAIKAR-RENTAL-7b2c9d81-1725712000",
  "orderNo": "OPAY2026090712392212345",
  "amount": "6500000",
  "currency": "NGN",
  "status": "SUCCESSFUL",
  "token": "tok_visa_card_1234",
  "sha512": "4a73b9e4a8c88f4e2b0c1e0a... [computed signature]"
}
```

### Authentic Verification Algorithm:
1. Extract the `sha512` field from the webhook payload.
2. Remove `sha512` from the payload dictionary.
3. Sort all remaining JSON keys alphabetically (ASCII order).
4. Serialize to string formatted as `key1=value1&key2=value2...` or canonical JSON.
5. Compute HMAC-SHA512 using your **OPay Secret Key**.
6. Compare with constant-time equality check against the incoming `sha512`.
7. Return HTTP `200 OK` with body `{"code": "00000", "message": "SUCCESS"}`.

---

## 7. RentMaikar Multi-PSP Strategy Matrix

| PSP | Scope | Supported Currencies | Primary Features |
| :--- | :--- | :--- | :--- |
| **PayPal** | **Global / USA** | USD, EUR, GBP | Credit/Debit Cards, PayPal Wallet, Venmo, Pay in 4, US Bank Transfers |
| **OPay** | **Nigeria (Primary)** | NGN | OPay Wallet, Bank Transfers, POS Cards, USSD, Instant Settlement |
| **Paystack** | **Nigeria & Africa** | NGN, GHS, KES, ZAR | Cards, Bank Account Direct Debit, USSD, Apple Pay |
| **Flutterwave** | **Pan-African & Global** | NGN, USD, KES, RWF | Cards, Mobile Money, Barter, Virtual Accounts |
| **Stripe** | **Global** | USD, EUR, GBP | Cards, SEPA, ACH Direct Debit, Apple Pay, Google Pay |
