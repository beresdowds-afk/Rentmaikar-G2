import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookOpen, Search, X } from "lucide-react";

type Category =
  | "Platform"
  | "Roles"
  | "Payments"
  | "IoT & Vehicles"
  | "Compliance & Legal"
  | "Communications"
  | "Regions"
  | "Operations"
  | "Technical";

interface GlossaryEntry {
  term: string;
  acronym?: string;
  category: Category;
  definition: string;
  aka?: string[];
  region?: "USA" | "Nigeria" | (string & {}) | "Both";
}

const ENTRIES: GlossaryEntry[] = [
  // Platform
  { term: "Rentmaikar", category: "Platform", definition: "The rideshare vehicle rental platform connecting drivers with owners across the USA and Nigeria, with an admin mediator model." },
  { term: "Admin Mediator Model", category: "Platform", definition: "Every driver/owner interaction is mediated by Rentmaikar admins. Direct contact between driver and owner is strictly prohibited." },
  { term: "Region Isolation", category: "Platform", definition: "Content, currency, providers, and copy are strictly separated per region (USA vs Nigeria). Every page consumes RegionContext." },
  { term: "Rent-to-Own", acronym: "RTO", category: "Platform", definition: "Program allowing drivers to progressively acquire ownership of a vehicle through rental payments. Default policy: vehicle recovery only." },
  { term: "Rideshare", category: "Platform", definition: "Uber, Lyft, Bolt and similar driver-for-hire platforms. Rentmaikar drivers must have active rideshare accounts." },

  // Roles
  { term: "Driver", category: "Roles", definition: "End user who rents a vehicle to drive for rideshare platforms." },
  { term: "Owner", category: "Roles", definition: "Vehicle owner who lists a car on Rentmaikar and earns 60% of rental revenue." },
  { term: "Admin", category: "Roles", definition: "Full-privilege Rentmaikar operator. Mediates all driver/owner interactions and receives 20% platform share." },
  { term: "Admin Assistant", category: "Roles", definition: "Delegated support operator with a scoped subset of admin capabilities." },
  { term: "Legal Support", category: "Roles", definition: "Support role focused on agreements, disputes, and compliance workflows." },
  { term: "IoT Support", category: "Roles", definition: "Support role handling telemetry, MQTT credentials, immobilization, and hardware issues." },
  { term: "Vehicle Support", category: "Roles", definition: "Support role managing vehicle inspections, incidents, recalls, and roadside assistance." },
  { term: "Referee", category: "Roles", definition: "Third-party reference required during driver registration who attests to the driver's character." },

  // Payments
  { term: "Platform Fee", category: "Payments", definition: "40% total fee on driver payments, split 20% to admin (platform) and 20% to owner operations." },
  { term: "Owner Payout", category: "Payments", definition: "60% share paid to vehicle owners, disbursed on Fridays via bank transfer." },
  { term: "Daily Frequency", category: "Payments", definition: "Payment cadence with a mandatory 10% surcharge. Required after any default event." },
  { term: "Weekly Frequency", category: "Payments", definition: "Standard payment cadence with no surcharge. Loses eligibility on default." },
  { term: "Security Deposit", category: "Payments", definition: "Mandatory refundable deposit collected at registration to cover damages, fines, or defaults." },
  { term: "Late Fee", category: "Payments", definition: "Automatic 10% fine applied when scheduled payments miss the due window." },
  { term: "Lockdown", category: "Payments", definition: "Automated vehicle immobilization triggered 24h after a daily default or 36h after a weekly default." },
  { term: "PSP", acronym: "PSP", category: "Payments", definition: "Payment Service Provider. USA uses PayPal; Nigeria uses Paystack. Providers are strictly region-locked." },
  { term: "Paystack", category: "Payments", region: "Nigeria", definition: "Primary Nigeria payment gateway for cards, bank transfers, and USSD." },
  { term: "PayPal", category: "Payments", region: "USA", definition: "Primary USA payment gateway for card and PayPal-balance payments." },
  { term: "Opay", category: "Payments", region: "Nigeria", definition: "Alternative Nigerian payment rail supported for select flows." },
  { term: "Pre-Due Reminder", category: "Payments", definition: "Notifications sent every 12 hours starting 72h before a payment is due to reduce defaults." },

  // IoT & Vehicles
  { term: "IoT", acronym: "IoT", category: "IoT & Vehicles", definition: "Internet of Things. Rentmaikar installs telemetry hardware in each vehicle for GPS, ignition, speed, and immobilization control." },
  { term: "MQTT", acronym: "MQTT", category: "IoT & Vehicles", definition: "Lightweight messaging protocol used to communicate with vehicle IoT devices. Topics: rentmaikar/vehicle/{id}/telemetry (30s) and command (50m)." },
  { term: "EMQX", category: "IoT & Vehicles", definition: "The managed MQTT broker used by Rentmaikar for vehicle telemetry." },
  { term: "Hologram", category: "IoT & Vehicles", definition: "Cellular SIM provider for IoT device connectivity." },
  { term: "Traccar", category: "IoT & Vehicles", definition: "Open-source GPS tracking platform integrated as one of the telemetry backends." },
  { term: "Immobilization", category: "IoT & Vehicles", definition: "Remote command that disables vehicle ignition. Only issued when speed=0 AND ignition=OFF for safety." },
  { term: "Telemetry", category: "IoT & Vehicles", definition: "Real-time vehicle data stream: GPS location, speed, ignition state, battery, and geofence status." },
  { term: "Geofence", category: "IoT & Vehicles", definition: "Virtual boundary around a location. USA drivers get a 25-mile catalogue radius; Nigeria uses home-city bounds." },
  { term: "Recall", category: "IoT & Vehicles", definition: "Automated request for the driver to return a vehicle, typically triggered by IoT failure or compliance issue." },
  { term: "Weekly Inspection", category: "IoT & Vehicles", definition: "Owner-reviewed report with 10 specific vehicle photos on a 30-day cycle synced with rental agreements." },
  { term: "Vehicle Categories", category: "IoT & Vehicles", definition: "Three pricing tiers based on manufacture year, with region-specific ceilings." },

  // Compliance & Legal
  { term: "Legal Agreement", category: "Compliance & Legal", definition: "Custom PDF rental contract generated via html2canvas and auto-renewed every 30 days by cron." },
  { term: "Auto-Renewal", category: "Compliance & Legal", definition: "Compulsory 30-day rolling agreement renewal handled by the process-agreement-renewals cron." },
  { term: "NIN", acronym: "NIN", category: "Compliance & Legal", region: "Nigeria", definition: "National Identification Number. Required for Nigerian driver verification." },
  { term: "BVN", acronym: "BVN", category: "Compliance & Legal", region: "Nigeria", definition: "Bank Verification Number. Required Nigerian financial identity check." },
  { term: "VIN", acronym: "VIN", category: "Compliance & Legal", region: "USA", definition: "Vehicle Identification Number. Required for USA vehicle registration/verification." },
  { term: "Persona", category: "Compliance & Legal", region: "USA", definition: "Third-party KYC provider used for USA driver identity verification." },
  { term: "2FA", acronym: "2FA", category: "Compliance & Legal", definition: "Two-Factor Authentication. Mandatory for Admin and Owner accounts." },
  { term: "RLS", acronym: "RLS", category: "Compliance & Legal", definition: "Row-Level Security. Postgres feature enforcing per-user data access; enabled on every public table." },
  { term: "Dispute Resolution", category: "Compliance & Legal", definition: "Rentmaikar-mediated process prioritizing mediation over litigation for all conflicts." },
  { term: "Attestation", category: "Compliance & Legal", definition: "Referee response confirming or denying a driver's registration reference." },

  // Communications
  { term: "Twilio", category: "Communications", region: "USA", definition: "USA provider for voice, SMS, and WhatsApp." },
  { term: "Termii", category: "Communications", region: "Nigeria", definition: "Nigeria provider for voice, SMS, and WhatsApp." },
  { term: "Resend", category: "Communications", definition: "Transactional email delivery provider. Mandatory channel for every notification." },
  { term: "Whatchimp", category: "Communications", definition: "WhatsApp automation/flow provider integrated via webhook." },
  { term: "ManyChat", category: "Communications", definition: "Messaging automation provider integrated via webhook for guided flows." },
  { term: "Unified Inbox", category: "Communications", definition: "Admin view combining Twilio, Termii, and Resend threads with regional forwarding." },
  { term: "IVR", acronym: "IVR", category: "Communications", definition: "Interactive Voice Response. Automated phone menus for payments, expiry, and shutdown flows." },
  { term: "VoIP", acronym: "VoIP", category: "Communications", definition: "Voice-over-IP calling. Implemented with @twilio/voice-sdk WebRTC." },
  { term: "AMD", acronym: "AMD", category: "Communications", definition: "Answering Machine Detection. Determines if a live person or voicemail answers a call." },
  { term: "Call Ladder", category: "Communications", definition: "Escalation order: Call → SMS → WhatsApp → Email until acknowledgement." },
  { term: "Messaging Consent", category: "Communications", definition: "User opt-in flag stored in localStorage as rentmaikar_message_consent." },
  { term: "Notification Windows", category: "Communications", definition: "USA 9am–9pm ET; Nigeria 8am–8pm WAT. Outside these hours, only email is sent." },
  { term: "TTS", acronym: "TTS", category: "Communications", definition: "Text-to-Speech. Voices: Wilson for USA, Kunle for Nigeria (via ElevenLabs)." },

  // Regions
  { term: "USA Region", category: "Regions", region: "USA", definition: "United States operations. Currency USD, VIN-based verification, PayPal/Twilio stack, imperial units." },
  { term: "Nigeria Region", category: "Regions", region: "Nigeria", definition: "Nigeria operations. Currency NGN, NIN/BVN verification, Paystack/Termii stack." },
  { term: "RegionContext", category: "Regions", definition: "React context (src/contexts/RegionContext.tsx) that must drive every page's copy, currency, and provider selection." },
  { term: "Region Auto-Build", category: "Regions", definition: "Edge-function tooling that scaffolds new regions with content, providers, and defaults." },

  // Operations
  { term: "Daily Todo", category: "Operations", definition: "Cron-generated task list surfaced to admins at 6:00 AM each day." },
  { term: "Task Portal", category: "Operations", definition: "Admin work queue aggregating support tasks across CRM, ERP, and Support portals." },
  { term: "Handover Protocol", category: "Operations", definition: "Post-signing procedure that shares vehicle pickup details with the driver." },
  { term: "Incident Report", category: "Operations", definition: "Driver-filed report about accidents or issues, required within 1 hour of occurrence." },
  { term: "Roadside Support", category: "Operations", region: "USA", definition: "Optional $12/month USA subscription providing emergency roadside services." },
  { term: "Owner Withdrawal", category: "Operations", definition: "Self-service payout request isolated to a specific vehicle's revenue." },

  // Technical
  { term: "Edge Function", category: "Technical", definition: "Deno-based serverless function running on Supabase for backend logic, webhooks, and cron tasks." },
  { term: "pg_cron", category: "Technical", definition: "Postgres extension used to schedule background jobs (debits, tasks, reminders, renewals)." },
  { term: "Lovable Cloud", category: "Technical", definition: "Managed backend powering Rentmaikar (database, auth, storage, edge functions)." },
  { term: "PWA", acronym: "PWA", category: "Technical", definition: "Progressive Web App. Rentmaikar self-installs via vite-plugin-pwa." },
  { term: "Webhook", category: "Technical", definition: "Provider callback (Twilio, Termii, Resend, Persona, etc.) that updates delivery/status data." },
  { term: "StatusCallback / notify_url", category: "Technical", definition: "Per-message callback URLs appended to outbound sends so providers report delivery status." },
  { term: "API Key", category: "Technical", definition: "Hashed public credential with the rmk_live_ prefix issued for third-party integrations." },
];

const CATEGORIES: Category[] = [
  "Platform",
  "Roles",
  "Payments",
  "IoT & Vehicles",
  "Compliance & Legal",
  "Communications",
  "Regions",
  "Operations",
  "Technical",
];

export default function PlatformGlossary() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | "All">("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ENTRIES.filter((e) => {
      if (activeCategory !== "All" && e.category !== activeCategory) return false;
      if (!q) return true;
      return (
        e.term.toLowerCase().includes(q) ||
        e.acronym?.toLowerCase().includes(q) ||
        e.definition.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    }).sort((a, b) => a.term.localeCompare(b.term));
  }, [query, activeCategory]);

  const grouped = useMemo(() => {
    const map = new Map<Category, GlossaryEntry[]>();
    filtered.forEach((e) => {
      const arr = map.get(e.category) ?? [];
      arr.push(e);
      map.set(e.category, arr);
    });
    return map;
  }, [filtered]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">Platform Glossary</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Reference for terms, acronyms, and provider names used across Rentmaikar.
          Use it to onboard fast and speak the same language across CRM, ERP, and Support.
        </p>
      </header>

      <Card className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms, acronyms, or definitions…"
            className="pl-9 pr-9"
            aria-label="Search glossary"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeCategory === "All" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveCategory("All")}
          >
            All ({ENTRIES.length})
          </Button>
          {CATEGORIES.map((c) => {
            const count = ENTRIES.filter((e) => e.category === c).length;
            return (
              <Button
                key={c}
                size="sm"
                variant={activeCategory === c ? "default" : "outline"}
                onClick={() => setActiveCategory(c)}
              >
                {c} ({count})
              </Button>
            );
          })}
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No entries match “{query}”.
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([category, entries]) => (
            <section key={category} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {entries.map((e) => (
                  <Card key={e.term} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{e.term}</h3>
                        {e.acronym && e.acronym !== e.term && (
                          <span className="text-xs text-muted-foreground">({e.acronym})</span>
                        )}
                      </div>
                      {e.region && (
                        <Badge variant="secondary" className="text-[10px]">
                          {e.region === "USA" ? "🇺🇸 USA" : e.region === "Nigeria" ? "🇳🇬 NG" : "Both"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {e.definition}
                    </p>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
