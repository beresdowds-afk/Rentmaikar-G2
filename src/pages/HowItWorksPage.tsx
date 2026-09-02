import Seo from "@/components/seo/Seo";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  UserPlus,
  BadgeCheck,
  Car,
  CreditCard,
  Building,
  Search,
  FileSignature,
  KeyRound,
  Wallet,
  ShieldCheck,
  Radar,
  Clock,
  User,
  ArrowRight,
} from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PricingHintBanner from "@/components/home/PricingHintBanner";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRegion } from "@/contexts/RegionContext";

type Step = {
  icon: typeof UserPlus;
  title: string;
  description: string;
  requires: string[];
};

const HowItWorksPage = () => {
  const { country } = useRegion();
  const isNigeria = country === "Nigeria";
  const [tab, setTab] = useState<"driver" | "owner">("driver");

  const idDoc = isNigeria ? "NIN or BVN" : "Government-issued ID (Driver License, Passport, State ID)";
  const rideshare = isNigeria ? "Bolt, Uber or InDrive" : "Uber, Lyft or a delivery app";
  const paymentRail = isNigeria ? "Paystack" : "PayPal";
  const inspectionDoc = isNigeria ? "Roadworthiness certificate" : "State vehicle inspection certificate";
  const vehicleId = isNigeria ? "License plate" : "VIN (Vehicle Identification Number)";

  const driverSteps: Step[] = useMemo(
    () => [
      {
        icon: UserPlus,
        title: "1. Sign Up & Submit Documents",
        description:
          "Create your account and upload the documents we need to verify your identity and driving record.",
        requires: [
          idDoc,
          "Valid driver's licence (front & back)",
          "A recent selfie for liveness check",
          "Three referees (name, phone, address)",
        ],
      },
      {
        icon: BadgeCheck,
        title: "2. Get Verified",
        description:
          "Our team runs ID, licence, driving-history and referee checks. You'll get status updates by email and SMS.",
        requires: [
          "Working phone & email for verification calls",
          `${rideshare} approval OR request onboarding help`,
          "Consent to background & driving-record check",
        ],
      },
      {
        icon: Car,
        title: "3. Pick Your Car & Sign the Weekly Rental Agreement",
        description:
          "Browse verified cars in your city, agree the weekly rate with the owner (or admin-negotiated price) and sign the rental agreement online.",
        requires: [
          "Refundable security deposit",
          "First week's rent",
          "Electronic signature on the rental agreement",
        ],
      },
      {
        icon: KeyRound,
        title: "4. Pick Up & Start Earning",
        description:
          "Meet at the pickup location, complete the joint handover inspection and hit the road. Weekly rent is auto-debited going forward.",
        requires: [
          "Handover photo checklist (10 photos)",
          `Weekly rent auto-debit via ${paymentRail}`,
          "24-hour vehicle tracking active throughout rental",
        ],
      },
    ],
    [idDoc, rideshare, paymentRail],
  );

  const ownerSteps: Step[] = useMemo(
    () => [
      {
        icon: Building,
        title: "1. Register Yourself & Your Vehicle",
        description:
          "Create an owner account and list your vehicle with clear photos, condition and your desired weekly rate.",
        requires: [
          idDoc,
          "Vehicle registration / title in your name",
          `${vehicleId}, make, model, year, colour`,
          "5–8 clear vehicle photos (exterior & interior)",
        ],
      },
      {
        icon: ShieldCheck,
        title: "2. Owner & Vehicle Verification",
        description:
          "We verify your identity, ownership documents and vehicle condition before your car is listed to drivers.",
        requires: [
          "Insurance certificate (rideshare-eligible)",
          inspectionDoc,
          "Vehicle inspection appointment (in-person or photo-based)",
        ],
      },
      {
        icon: Radar,
        title: "3. Install IoT Tracker & Go Live",
        description:
          "Rentmaikar-approved IoT tracker enables 24-hour monitoring, geofence alerts and remote lockdown on default. Your listing goes live once installed.",
        requires: [
          "IoT device fitment (purchased from us or approved supplier)",
          "Payout account set up (bank / PayPal)",
          "Accepted platform terms & 40% platform fee split",
        ],
      },
      {
        icon: Wallet,
        title: "4. Get Matched, Earn Weekly & Get Paid",
        description:
          "Verified drivers request your car, admin mediates pricing and handover, and your earnings are paid out every Friday.",
        requires: [
          "Friday weekly payouts to your registered account",
          "Automatic weekly earnings statement",
          "Full incident, inspection & tracking history in your dashboard",
        ],
      },
    ],
    [idDoc, vehicleId, inspectionDoc],
  );

  const verificationFAQ = [
    {
      q: "What does 'Verified Driver' actually include?",
      a: `Identity check (${idDoc}), government-issued driver's licence review, driving history check, three referee attestations, phone & email verification, and — where required — a background check. Drivers must also confirm ${rideshare} approval or accept Rentmaikar's rideshare-onboarding assistance before pickup.`,
    },
    {
      q: "What does 'Verified Owner' actually include?",
      a: `Identity check (${idDoc}), proof of vehicle ownership matching the ID, phone & email verification, payout account verification, and acceptance of the platform's mediator-only communication policy. Owners never contact drivers directly — Rentmaikar mediates every interaction.`,
    },
    {
      q: "What does 'Verified Vehicle' actually include?",
      a: `${vehicleId} match against ownership documents, valid insurance (rideshare-eligible), ${inspectionDoc}, a photo condition report (10-photo checklist), and a Rentmaikar-approved IoT tracker fitted before the vehicle can be rented.`,
    },
    {
      q: "How long does verification take?",
      a: "Driver verification typically completes within 24–72 hours once all documents and referees respond. Vehicle & owner verification typically completes within 3–5 business days, depending on inspection scheduling in your city.",
    },
    {
      q: "Do I need my own Uber / Bolt / Lyft account?",
      a: `You can either bring your own approved ${rideshare} account (fastest path) or ask Rentmaikar to help you get approved during onboarding. Either way, you must be approved on at least one supported ride-hailing platform before pickup.`,
    },
    {
      q: "What happens if verification fails?",
      a: "You'll receive a specific reason by email and SMS with clear next steps — for example, a document re-upload, an additional referee, or a rescheduled vehicle inspection. Rejected applications can be re-submitted at no cost.",
    },
    {
      q: "Is my data safe?",
      a: "Documents are stored in an encrypted private bucket with strict access rules. Only assigned verification staff and you can view them. See our Privacy Policy for the full details.",
    },
  ];

  const activeSteps = tab === "driver" ? driverSteps : ownerSteps;
  const ctaLink = tab === "driver" ? "/driver/register" : "/owner/register";
  const ctaLabel = tab === "driver" ? "Start Driver Registration" : "Register Your Vehicle";

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="How Rentmaikar Works — Rent or List in 4 Steps"
        description="See how Rentmaikar works for drivers and vehicle owners: sign up, get verified, sign the agreement and start driving or earning — all mediated by Rentmaikar."
        path="/how-it-works"
      />
      <Header />
      <PricingHintBanner />
      <main className="pt-8 pb-16">
        <div className="container mx-auto px-4 max-w-5xl">
          {/* Header */}
          <div className="text-center mb-10">
            <span className="inline-block px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              How Rentmaikar Works
            </span>
            <h1 className="text-3xl md:text-5xl font-display font-bold text-foreground mb-4">
              From sign-up to earning — in 4 clear steps
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              No hidden steps, no direct owner-to-driver contact, no off-platform payments.
              Rentmaikar mediates every part of the journey — for {country === "Nigeria" ? "Nigeria" : "the USA"}.
            </p>
          </div>

          {/* Driver / Owner tabs */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as "driver" | "owner")} className="mb-10">
            <TabsList className="grid grid-cols-2 max-w-md mx-auto">
              <TabsTrigger value="driver" className="gap-2">
                <User className="w-4 h-4" />
                For Drivers
              </TabsTrigger>
              <TabsTrigger value="owner" className="gap-2">
                <Building className="w-4 h-4" />
                For Owners
              </TabsTrigger>
            </TabsList>

            {(["driver", "owner"] as const).map((key) => (
              <TabsContent key={key} value={key} className="mt-8">
                <ol className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(key === "driver" ? driverSteps : ownerSteps).map((step) => {
                    const Icon = step.icon;
                    return (
                      <li
                        key={step.title}
                        className="relative p-6 rounded-2xl bg-card border border-border shadow-sm"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Icon className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <h2 className="text-lg font-display font-semibold text-foreground mb-2">
                              {step.title}
                            </h2>
                            <p className="text-sm text-muted-foreground mb-3">
                              {step.description}
                            </p>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">
                                What this step requires
                              </p>
                              <ul className="space-y-1.5">
                                {step.requires.map((r) => (
                                  <li key={r} className="text-sm text-foreground flex gap-2">
                                    <span className="text-primary">•</span>
                                    <span>{r}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </TabsContent>
            ))}
          </Tabs>

          {/* Primary CTA */}
          <div className="text-center mb-16">
            <Link to={ctaLink}>
              <Button size="lg" className="gap-2">
                {ctaLabel}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {/* Verification FAQ */}
          <section aria-labelledby="verification-faq-heading" className="mb-8">
            <div className="text-center mb-8">
              <span className="inline-block px-4 py-2 rounded-full bg-accent/10 text-accent text-sm font-medium mb-3">
                <ShieldCheck className="inline w-3.5 h-3.5 mr-1" />
                Verification FAQ
              </span>
              <h2
                id="verification-faq-heading"
                className="text-2xl md:text-3xl font-display font-bold text-foreground mb-3"
              >
                What "Verified" actually means
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-sm">
                We use "Verified" a lot. Here is exactly what it covers, what you need to provide,
                and how long each step usually takes.
              </p>
            </div>

            <div className="max-w-3xl mx-auto">
              <Accordion type="single" collapsible className="space-y-2">
                {verificationFAQ.map((item, idx) => (
                  <AccordionItem
                    key={item.q}
                    value={`v-${idx}`}
                    className="rounded-xl border border-border bg-card px-4"
                  >
                    <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            <div className="flex flex-wrap justify-center gap-6 text-xs text-muted-foreground mt-8">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Drivers: 24–72 hrs
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Owners & vehicles: 3–5 business days
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Radar className="w-3.5 h-3.5" />
                24-hour tracking on every active rental
              </span>
            </div>

            <p className="text-center text-sm text-muted-foreground mt-8">
              Still weighing your options?{" "}
              <Link
                to="/guides/renting-vs-owning-for-rideshare"
                className="text-primary underline underline-offset-4"
              >
                Read our guide: renting vs. owning a car for rideshare
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default HowItWorksPage;
