# Rentmaikar Call Infrastructure Architecture - Reference

```mermaid
graph LR
    A[Incoming Call] --> B{Region Detection}
    
    B -->|USA +1| C[Twilio Elastic SIP Trunking]
    B -->|Nigeria +234| D[Termii Voice API]
    
    C --> E[Twilio Studio Flow]
    D --> F[Termii Call Router]
    
    E --> G{Call Router}
    F --> G
    
    G --> H[USA IVR]
    G --> I[Nigeria IVR]
    
    H --> J[Edge Functions]
    I --> J
    
    J --> K[Rentmaikar DB]
    J --> L[CRM System]
    J --> M[Payment Gateway]
    
    J --> N[Call Recording]
    N --> O[S3 Storage]
    O --> P[Transcription Service]
    P --> Q[Analytics]
    
    J --> R[SMS/WhatsApp]
    R --> S1[Twilio Messaging — USA]
    R --> S2[Termii Messaging — Nigeria]
    S1 --> T[User Phone]
    S2 --> T
```

## Provider Stack

| Component | USA | Nigeria |
|---|---|---|
| **Voice Calls** | Twilio Voice API | Termii Voice API |
| **SMS** | Twilio SMS | Termii SMS |
| **WhatsApp** | Twilio WhatsApp | Termii WhatsApp |
| **OTP** | Twilio Verify | Termii Token |
| **Payments** | PayPal | Paystack |
