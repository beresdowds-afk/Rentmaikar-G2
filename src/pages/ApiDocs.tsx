import { useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Copy, Check, Code, Shield, Zap, Database, Bell, CreditCard, Car, AlertTriangle, Globe, Key } from "lucide-react";
import { toast } from "sonner";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
  auth: boolean;
  category: string;
  requestBody?: string;
  responseBody?: string;
  headers?: { name: string; value: string; required: boolean }[];
}

const endpoints: Endpoint[] = [
  // Authentication & Notifications
  {
    method: "POST",
    path: "/functions/v1/send-sms-notification",
    description: "Send SMS or WhatsApp notifications to users",
    auth: true,
    category: "notifications",
    requestBody: `{
  "recipientPhone": "+1234567890",
  "notificationType": "payment_reminder",
  "channel": "sms",
  "amount": 150.00,
  "currency": "USD",
  "dueDate": "2024-01-15"
}`,
    responseBody: `{
  "success": true,
  "messageId": "SM1234567890"
}`,
    headers: [
      { name: "Authorization", value: "Bearer <service_role_key>", required: true },
      { name: "Content-Type", value: "application/json", required: true }
    ]
  },
  {
    method: "POST",
    path: "/functions/v1/send-incident-notification",
    description: "Send incident alerts to admins, owners, and drivers",
    auth: true,
    category: "notifications",
    requestBody: `{
  "incidentId": "uuid",
  "incidentType": "accident",
  "severity": "high",
  "vehicleId": "uuid",
  "driverId": "uuid",
  "title": "Vehicle Collision Detected",
  "description": "Impact detected at 3.5G force",
  "location": "123 Main St, Lagos"
}`,
    responseBody: `{
  "success": true,
  "emailsSent": 2,
  "smsSent": 1
}`
  },
  {
    method: "POST",
    path: "/functions/v1/send-approval-notification",
    description: "Notify users when their account is approved",
    auth: true,
    category: "notifications",
    requestBody: `{
  "email": "user@example.com",
  "name": "John Doe",
  "userType": "driver",
  "region": "USA"
}`,
    responseBody: `{
  "success": true,
  "emailId": "email_123"
}`
  },
  {
    method: "POST",
    path: "/functions/v1/send-price-notification",
    description: "Send price negotiation updates via email",
    auth: true,
    category: "notifications",
    requestBody: `{
  "email": "owner@example.com",
  "notificationType": "new_offer",
  "userType": "owner",
  "vehicleName": "Toyota Camry 2022",
  "proposedPrice": 250.00,
  "currentPrice": 300.00,
  "currency": "USD"
}`,
    responseBody: `{
  "success": true,
  "emailId": "email_456"
}`
  },
  // IoT & Vehicle Tracking
  {
    method: "POST",
    path: "/functions/v1/iot-accident-detection",
    description: "Process IoT sensor data for accident detection",
    auth: true,
    category: "iot",
    requestBody: `{
  "vehicleId": "uuid",
  "deviceId": "DEV-001",
  "triggerType": "collision",
  "decelerationG": 4.5,
  "speedAtImpact": 45.5,
  "location": {
    "lat": 6.5244,
    "lng": 3.3792
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "batteryLevel": 85,
  "signalStrength": -65
}`,
    responseBody: `{
  "success": true,
  "incidentId": "uuid",
  "severity": "high",
  "notificationsSent": true
}`
  },
  // Phone Verification
  {
    method: "POST",
    path: "/functions/v1/verify-phone",
    description: "Send or verify phone verification codes",
    auth: true,
    category: "auth",
    requestBody: `{
  "action": "send_code",
  "phone": "+1234567890",
  "channel": "sms"
}`,
    responseBody: `{
  "success": true,
  "expiresIn": 600
}`
  },
  // Orders & Payments
  {
    method: "POST",
    path: "/functions/v1/send-order-notification",
    description: "Notify admin of new IoT device orders",
    auth: true,
    category: "orders",
    requestBody: `{
  "orderId": "uuid",
  "ownerEmail": "owner@example.com",
  "ownerPhone": "+1234567890",
  "devicePrice": 25000,
  "currency": "NGN",
  "shippingAddress": "123 Lagos Street",
  "paymentMethod": "bank_transfer"
}`,
    responseBody: `{
  "success": true,
  "emailId": "email_789"
}`
  },
  {
    method: "POST",
    path: "/functions/v1/send-shipping-notification",
    description: "Notify users when their IoT device ships",
    auth: true,
    category: "orders",
    requestBody: `{
  "email": "owner@example.com",
  "phone": "+1234567890",
  "trackingNumber": "TRK123456789",
  "shippingAddress": "123 Lagos Street"
}`,
    responseBody: `{
  "success": true,
  "emailSent": true,
  "smsSent": true
}`
  },
  {
    method: "POST",
    path: "/functions/v1/process-payment-defaults",
    description: "Process and escalate payment defaults (scheduled)",
    auth: true,
    category: "payments",
    requestBody: `{}`,
    responseBody: `{
  "success": true,
  "processed": 5,
  "notificationsSent": 3,
  "accountsLocked": 1
}`
  },
  // Communication - Region-Aware Routing
  {
    method: "POST",
    path: "/functions/v1/send-inbox-reply",
    description: "Send region-routed SMS/WhatsApp reply via Twilio (US) or Termii (NG)",
    auth: true,
    category: "communication",
    requestBody: `{
  "conversationId": "uuid",
  "messageContent": "Your vehicle is ready for pickup.",
  "channel": "sms",
  "recipientPhone": "+2348012345678"
}`,
    responseBody: `{
  "success": true,
  "messageSid": "msg_abc123",
  "status": "sent",
  "provider": "termii"
}`,
    headers: [
      { name: "Authorization", value: "Bearer <service_role_key>", required: true },
      { name: "Content-Type", value: "application/json", required: true }
    ]
  },
  {
    method: "POST",
    path: "/functions/v1/send-sms-notification",
    description: "Region-aware SMS notification — routes to Twilio (US +1) or Termii (NG +234) automatically",
    auth: true,
    category: "communication",
    requestBody: `{
  "recipientPhone": "+2348012345678",
  "notificationType": "payment_reminder",
  "channel": "sms",
  "amount": 50000,
  "currency": "NGN",
  "dueDate": "2026-02-20"
}`,
    responseBody: `{
  "success": true,
  "messageId": "msg_termii_456",
  "provider": "termii",
  "region": "NG"
}`,
    headers: [
      { name: "Authorization", value: "Bearer <service_role_key>", required: true },
      { name: "Content-Type", value: "application/json", required: true }
    ]
  },
  {
    method: "POST",
    path: "/api/webhook/termii/inbound",
    description: "Termii inbound webhook — receives incoming SMS from Nigerian numbers, forwards to operational line",
    auth: false,
    category: "communication",
    requestBody: `{
  "sms": {
    "from": "+2348012345678",
    "to": "RENTMAIKAR",
    "message": "I need roadside assistance",
    "type": "plain",
    "channel": "generic"
  }
}`,
    responseBody: `{
  "success": true,
  "conversationId": "uuid",
  "forwarded": true,
  "forwardedTo": "+234XXXXXXXXXX"
}`
  },
  {
    method: "POST",
    path: "/api/webhook/twilio/inbound",
    description: "Twilio inbound webhook — receives incoming SMS from US numbers, forwards to operational line",
    auth: false,
    category: "communication",
    requestBody: `{
  "From": "+12025551234",
  "To": "+18005551234",
  "Body": "When is my next payment due?",
  "MessageSid": "SM1234567890"
}`,
    responseBody: `{
  "success": true,
  "conversationId": "uuid",
  "forwarded": true,
  "forwardedTo": "+1XXXXXXXXXX"
}`
  }
];

const categories = [
  { id: "all", label: "All Endpoints", icon: Code },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "iot", label: "IoT & Tracking", icon: Car },
  { id: "auth", label: "Authentication", icon: Shield },
  { id: "orders", label: "Orders", icon: Database },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "communication", label: "Communication", icon: Globe }
];

const methodColors: Record<string, string> = {
  GET: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
  PATCH: "bg-purple-500/20 text-purple-400 border-purple-500/30"
};

const CodeBlock = ({ code, language = "json" }: { code: string; language?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-muted/50 border rounded-lg p-4 overflow-x-auto text-sm font-mono">
        <code className="text-foreground/80">{code}</code>
      </pre>
      <Button
        size="sm"
        variant="ghost"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
};

const EndpointCard = ({ endpoint }: { endpoint: Endpoint }) => {
  return (
    <AccordionItem value={endpoint.path} className="border rounded-lg mb-3 overflow-hidden">
      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
        <div className="flex items-center gap-3 text-left">
          <Badge className={`${methodColors[endpoint.method]} font-mono text-xs px-2 py-0.5`}>
            {endpoint.method}
          </Badge>
          <code className="text-sm font-medium">{endpoint.path}</code>
          {endpoint.auth && (
            <Shield className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <p className="text-muted-foreground mb-4">{endpoint.description}</p>
        
        {endpoint.headers && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold mb-2">Headers</h4>
            <div className="space-y-1">
              {endpoint.headers.map((header) => (
                <div key={header.name} className="flex items-center gap-2 text-sm">
                  <code className="bg-muted px-2 py-0.5 rounded">{header.name}</code>
                  <span className="text-muted-foreground">{header.value}</span>
                  {header.required && (
                    <Badge variant="outline" className="text-xs">Required</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {endpoint.requestBody && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold mb-2">Request Body</h4>
            <CodeBlock code={endpoint.requestBody} />
          </div>
        )}

        {endpoint.responseBody && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Response</h4>
            <CodeBlock code={endpoint.responseBody} />
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
};

const AuthenticationSection = () => {
  const authHeaders = [
    { name: "Authorization", value: "Bearer rmk_live_...", required: true, note: "Preferred. API key issued from Admin → ERP → API Keys." },
    { name: "X-API-Key", value: "rmk_live_...", required: false, note: "Alternative to Authorization header." },
    { name: "Content-Type", value: "application/json", required: true, note: "Required on POST / PUT / PATCH." },
    { name: "Idempotency-Key", value: "<uuid>", required: false, note: "Recommended for POST /payments and /rentals to safely retry." },
    { name: "X-Rentmaikar-Region", value: "US | NG", required: false, note: "Overrides region auto-detection for regional routing." },
  ];

  const rateLimits = [
    { method: "GET", path: "/v1/vehicles", limit: "120 / min", burst: "30", scope: "read + vehicles" },
    { method: "POST", path: "/v1/vehicles", limit: "30 / min", burst: "10", scope: "write + vehicles" },
    { method: "GET", path: "/v1/rentals", limit: "120 / min", burst: "30", scope: "read" },
    { method: "POST", path: "/v1/rentals", limit: "30 / min", burst: "5", scope: "write" },
    { method: "GET", path: "/v1/payments", limit: "60 / min", burst: "15", scope: "read + payments" },
    { method: "POST", path: "/v1/payments/charge", limit: "20 / min", burst: "3", scope: "write + payments" },
    { method: "GET", path: "/v1/users/{id}", limit: "60 / min", burst: "10", scope: "read + users" },
    { method: "POST", path: "/v1/notifications/send", limit: "30 / min", burst: "5", scope: "write" },
    { method: "POST", path: "/v1/keys/{id}/rotate", limit: "5 / min", burst: "1", scope: "admin" },
  ];

  const scopes = [
    { scope: "read", desc: "Read any resource returned by GET endpoints." },
    { scope: "write", desc: "Create and update resources via POST / PATCH." },
    { scope: "delete", desc: "Delete resources via DELETE." },
    { scope: "vehicles", desc: "Access /v1/vehicles endpoints." },
    { scope: "users", desc: "Access /v1/users endpoints." },
    { scope: "payments", desc: "Access /v1/payments endpoints." },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> API Authentication
          </CardTitle>
          <CardDescription>
            All Rentmaikar API requests must be authenticated with an API key. Keys are issued and rotated
            from <strong>Admin → ERP → API Keys</strong>. Keys carry granular scopes and per-endpoint rate limits.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Required &amp; Recommended Headers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Header</th>
                  <th className="py-2 pr-4">Value</th>
                  <th className="py-2 pr-4">Required</th>
                  <th className="py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {authHeaders.map(h => (
                  <tr key={h.name} className="border-b last:border-0">
                    <td className="py-2 pr-4"><code className="bg-muted px-2 py-0.5 rounded">{h.name}</code></td>
                    <td className="py-2 pr-4"><code className="text-xs">{h.value}</code></td>
                    <td className="py-2 pr-4">
                      {h.required ? <Badge>Required</Badge> : <Badge variant="outline">Optional</Badge>}
                    </td>
                    <td className="py-2 text-muted-foreground">{h.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Authentication Flows</CardTitle>
          <CardDescription>Copy-paste examples for the most common calls.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="js">JavaScript</TabsTrigger>
              <TabsTrigger value="py">Python</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="space-y-3">
              <p className="text-sm text-muted-foreground">Authenticated request:</p>
              <CodeBlock code={`curl https://staging.rentmaikar.com/v1/vehicles \\
  -H "Authorization: Bearer rmk_live_your_key_here" \\
  -H "Content-Type: application/json"`} />
              <p className="text-sm text-muted-foreground">Rotate an API key (admin scope required):</p>
              <CodeBlock code={`curl -X POST https://staging.rentmaikar.com/v1/keys/KEY_ID/rotate \\
  -H "Authorization: Bearer rmk_live_admin_key"`} />
            </TabsContent>
            <TabsContent value="js" className="space-y-3">
              <CodeBlock code={`const res = await fetch("https://staging.rentmaikar.com/v1/rentals", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.RENTMAIKAR_API_KEY}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({ vehicle_id: "veh_123", days: 7 }),
});

if (res.status === 401) throw new Error("Invalid or revoked API key");
if (res.status === 403) throw new Error("Key missing required scope");
if (res.status === 429) {
  const retry = res.headers.get("Retry-After");
  console.warn(\`Rate limited. Retry after \${retry}s\`);
}
const data = await res.json();`} />
            </TabsContent>
            <TabsContent value="py" className="space-y-3">
              <CodeBlock code={`import os, uuid, requests

r = requests.post(
  "https://staging.rentmaikar.com/v1/payments/charge",
  headers={
    "Authorization": f"Bearer {os.environ['RENTMAIKAR_API_KEY']}",
    "Content-Type": "application/json",
    "Idempotency-Key": str(uuid.uuid4()),
  },
  json={"rental_id": "rnt_123", "amount": 15000, "currency": "NGN"},
  timeout=10,
)

if r.status_code == 429:
  print("Rate limited, retry after:", r.headers.get("Retry-After"))
r.raise_for_status()
print(r.json())`} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" /> Rate Limits per Endpoint
          </CardTitle>
          <CardDescription>
            Every response includes <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>,
            and <code>X-RateLimit-Reset</code>. Exceeding a limit returns HTTP <code>429</code> with a
            <code> Retry-After</code> header (seconds).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4">Path</th>
                  <th className="py-2 pr-4">Sustained Limit</th>
                  <th className="py-2 pr-4">Burst</th>
                  <th className="py-2">Required Scopes</th>
                </tr>
              </thead>
              <tbody>
                {rateLimits.map(r => (
                  <tr key={`${r.method}-${r.path}`} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      <Badge className={`${methodColors[r.method as keyof typeof methodColors]} font-mono text-xs`}>{r.method}</Badge>
                    </td>
                    <td className="py-2 pr-4"><code>{r.path}</code></td>
                    <td className="py-2 pr-4">{r.limit}</td>
                    <td className="py-2 pr-4">{r.burst}</td>
                    <td className="py-2 text-muted-foreground">{r.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">API Key Scopes</CardTitle>
          <CardDescription>Assign only the scopes the integration needs.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            {scopes.map(s => (
              <div key={s.scope} className="flex items-start gap-2 rounded-lg border p-3">
                <Key className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <code className="text-sm font-semibold">{s.scope}</code>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Error Response Schema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock code={`{
  "error": {
    "code": "insufficient_scope",
    "message": "This API key does not have the 'payments' scope.",
    "request_id": "req_01HABC..."
  }
}`} />
          <div className="grid gap-2 text-sm">
            <div><Badge variant="outline">401</Badge> <code>invalid_key</code> — key missing, revoked, or expired.</div>
            <div><Badge variant="outline">403</Badge> <code>insufficient_scope</code> — key lacks the required scope.</div>
            <div><Badge variant="outline">429</Badge> <code>rate_limited</code> — retry after the <code>Retry-After</code> value.</div>
            <div><Badge variant="outline">5xx</Badge> <code>upstream_error</code> — transient; retry with exponential backoff.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};


const ApiDocs = () => {
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filteredEndpoints = selectedCategory === "all" 
    ? endpoints 
    : endpoints.filter(e => e.category === selectedCategory);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <Badge className="mb-4" variant="secondary">
            <Code className="h-3 w-3 mr-1" />
            Developer Documentation
          </Badge>
          <h1 className="text-4xl font-bold mb-4">Rentmaikar API Reference</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Integrate with Rentmaikar's platform using our REST API endpoints. 
            Build powerful integrations for vehicle management, notifications, and payments.
          </p>
        </div>

        {/* Quick Start Cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-12">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-primary" />
                Authentication
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                All API requests require authentication using your service role key.
              </p>
              <CodeBlock code={`Authorization: Bearer <service_role_key>`} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-primary" />
                Base URL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                All endpoints are relative to the Supabase functions URL.
              </p>
              <CodeBlock code={`https://<project-id>.supabase.co`} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-primary" />
                Rate Limits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                API requests are rate-limited to ensure fair usage.
              </p>
              <div className="text-sm">
                <span className="font-mono bg-muted px-2 py-0.5 rounded">1000 req/min</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* API Reference */}
        <Tabs defaultValue="authentication" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="authentication">Authentication</TabsTrigger>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="sdks">SDKs & Tools</TabsTrigger>
          </TabsList>

          <TabsContent value="authentication" className="space-y-6">
            <AuthenticationSection />
          </TabsContent>


          <TabsContent value="endpoints" className="space-y-6">
            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <Button
                    key={cat.id}
                    variant={selectedCategory === cat.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(cat.id)}
                    className="gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {cat.label}
                  </Button>
                );
              })}
            </div>

            {/* Endpoints List */}
            <ScrollArea className="h-[600px] pr-4">
              <Accordion type="single" collapsible className="space-y-2">
                {filteredEndpoints.map((endpoint) => (
                  <EndpointCard key={endpoint.path} endpoint={endpoint} />
                ))}
              </Accordion>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-6">
            {/* Communication Secrets Reference */}
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-primary" />
                  Communication Provider Secrets
                </CardTitle>
                <CardDescription>
                  Required secrets for region-aware SMS/Voice routing. Configure these in Lovable Cloud → Secrets.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-sm mb-2">🇺🇸 Twilio (USA — +1)</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-0.5 rounded">TWILIO_ACCOUNT_SID</code>
                      <span className="text-muted-foreground">— Account SID from Twilio Console</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-0.5 rounded">TWILIO_AUTH_TOKEN</code>
                      <span className="text-muted-foreground">— Auth Token from Twilio Console</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-0.5 rounded">TWILIO_PHONE_NUMBER</code>
                      <span className="text-muted-foreground">— Platform phone number for US SMS/Voice</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-2">🇳🇬 Termii (Nigeria — +234)</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-0.5 rounded">TERMII_API_KEY</code>
                      <span className="text-muted-foreground">— API key from <a href="https://accounts.termii.com" target="_blank" rel="noopener noreferrer" className="underline text-primary">Termii Dashboard</a> → Settings → API Keys</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-0.5 rounded">TERMII_SENDER_ID</code>
                      <span className="text-muted-foreground">— Registered Sender ID (e.g. "RENTMAIKAR") from Termii → Sender IDs</span>
                    </div>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <h4 className="font-semibold text-sm mb-2">Provider Registry</h4>
                  <p className="text-sm text-muted-foreground">
                    Region routing is configured via the <code className="bg-muted px-1 py-0.5 rounded">communication_providers</code> table. 
                    Admins can update forwarding numbers, sender IDs, and toggle providers on/off from the Communication Settings panel.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Webhook Events</CardTitle>
                <CardDescription>
                  Subscribe to real-time events from the Rentmaikar platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  {[
                    { event: "incident.created", description: "Fired when a new incident is reported" },
                    { event: "incident.resolved", description: "Fired when an incident is marked as resolved" },
                    { event: "payment.default", description: "Fired when a payment default is detected" },
                    { event: "device.activated", description: "Fired when an IoT device comes online" },
                    { event: "vehicle.command", description: "Fired when a remote command is sent to a vehicle" },
                    { event: "user.approved", description: "Fired when a user account is approved" }
                  ].map((webhook) => (
                    <div key={webhook.event} className="flex items-start justify-between p-3 border rounded-lg">
                      <div>
                        <code className="text-sm font-medium">{webhook.event}</code>
                        <p className="text-sm text-muted-foreground mt-1">{webhook.description}</p>
                      </div>
                      <Badge variant="outline">Coming Soon</Badge>
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  <h4 className="font-semibold mb-3">Webhook Payload Example</h4>
                  <CodeBlock code={`{
  "event": "incident.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "id": "uuid",
    "type": "accident",
    "severity": "high",
    "vehicleId": "uuid",
    "driverId": "uuid"
  },
  "signature": "sha256=..."
}`} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sdks" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>JavaScript/TypeScript SDK</CardTitle>
                  <CardDescription>
                    Official SDK for web and Node.js applications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CodeBlock code={`npm install @rentmaikar/sdk

import { RentmaikarClient } from '@rentmaikar/sdk';

const client = new RentmaikarClient({
  apiKey: process.env.RENTMAIKAR_API_KEY
});

// Send notification
await client.notifications.send({
  type: 'sms',
  to: '+1234567890',
  message: 'Your vehicle is ready'
});`} />
                  <Badge variant="outline" className="mt-4">Coming Soon</Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Python SDK</CardTitle>
                  <CardDescription>
                    Official SDK for Python applications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CodeBlock code={`pip install rentmaikar

from rentmaikar import Client

client = Client(api_key=os.environ['RENTMAIKAR_API_KEY'])

# Track vehicle
vehicle = client.vehicles.get('vehicle-id')
print(vehicle.location)`} />
                  <Badge variant="outline" className="mt-4">Coming Soon</Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>MQTT Integration</CardTitle>
                  <CardDescription>
                    Real-time vehicle tracking via MQTT protocol
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CodeBlock code={`// MQTT Topics
vehicles/{vehicleId}/location
vehicles/{vehicleId}/status
vehicles/{vehicleId}/sensors
vehicles/{vehicleId}/commands

// Subscribe to location updates
mqttClient.subscribe('vehicles/+/location');
mqttClient.on('message', (topic, payload) => {
  const data = JSON.parse(payload);
  console.log(data.lat, data.lng);
});`} />
                  <Badge className="mt-4 bg-green-500/20 text-green-400">Available</Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Postman Collection</CardTitle>
                  <CardDescription>
                    Ready-to-use API collection for testing
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Download our Postman collection to quickly test all API endpoints 
                    with pre-configured requests and examples.
                  </p>
                  <Button variant="outline" className="w-full" disabled>
                    Download Collection
                  </Button>
                  <Badge variant="outline">Coming Soon</Badge>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Support Section */}
        <Card className="mt-12">
          <CardContent className="flex flex-col md:flex-row items-center justify-between p-6 gap-4">
            <div>
              <h3 className="font-semibold text-lg">Need Help?</h3>
              <p className="text-muted-foreground">
                Contact our developer support team for integration assistance.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline">View Changelog</Button>
              <Button>Contact Support</Button>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default ApiDocs;
