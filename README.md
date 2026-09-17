# RentMaikar

RentMaikar is a complete peer-to-peer vehicle rental and fleet management platform serving Nigeria and the United States. It connects verified drivers with vehicle owners, featuring automated booking workflows, regional payment gateways (Paystack, OPay, PayPal), real-time telematics via Hologram Cellular IoT, and integrated document verification.

## Features

- **Multi-Region Support**: Tailored currencies, tax calculations, and payment methods for Nigeria (NGN - Paystack/OPay) and the USA (USD - PayPal).
- **Fleet & Vehicle Management**: Vehicle listing, verification status, pricing tiers, and maintenance scheduling.
- **Identity & Compliance**: Automated identity and driver verification with Persona and referee attestation.
- **Cellular Telematics**: Real-time GPS location and OBD tracking powered by Hologram SIM/eSIM integration.
- **Driver & Owner Portals**: Role-based access control (RBAC), dashboards, dispute resolution, and payment reconciliation.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Lucide Icons, Recharts, Leaflet.
- **Mobile**: Capacitor (iOS & Android).
- **Backend & Database**: Express gateway server with Supabase (PostgreSQL, Row-Level Security, Edge Functions).
- **Payments**: Paystack, OPay, PayPal.
- **Communications**: Twilio (SMS & Voice), Termii, Resend.

## Development Setup

### Prerequisites

- Node.js 20+
- npm

### Installation

```sh
git clone <repository-url>
cd <repository-directory>
npm install
```

### Running Locally

```sh
npm run dev
```

The application runs on `http://localhost:3000`.

### Building for Production

```sh
npm run build
npm run start
```
