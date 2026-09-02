import { Building, Wallet, Shield, TrendingUp, Clock, Headphones } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";
import { useUserType } from "@/contexts/UserTypeContext";

interface OwnerBenefit {
  icon: React.ElementType;
  title: string;
  description: string;
}

const ownerBenefitsUSA: OwnerBenefit[] = [
  {
    icon: Wallet,
    title: "Weekly Passive Income",
    description: "Earn consistent weekly payouts via PayPal. We handle driver payments and remit your share every Friday.",
  },
  {
    icon: Shield,
    title: "Verified Drivers Only",
    description: "All drivers are pre-screened, licensed, and approved by rideshare platforms. Your car is in safe hands.",
  },
  {
    icon: TrendingUp,
    title: "Real-Time Tracking",
    description: "Monitor your vehicle 24/7 with GPS tracking. Know exactly where your asset is at all times.",
  },
  {
    icon: Clock,
    title: "Flexible Terms",
    description: "Set your own weekly rate and availability. Pause or resume listings whenever you need.",
  },
  {
    icon: Building,
    title: "Full Management",
    description: "We manage driver relationships, payment collection, and support. You just collect earnings.",
  },
  {
    icon: Headphones,
    title: "Dedicated Owner Support",
    description: "Priority support line for vehicle owners. Get answers fast when you need them.",
  },
];

const ownerBenefitsNigeria: OwnerBenefit[] = [
  {
    icon: Wallet,
    title: "Steady Weekly Income",
    description: "Receive consistent weekly payouts via Paystack. We collect from drivers and remit your share every Friday.",
  },
  {
    icon: Shield,
    title: "Verified Drivers Only",
    description: "All drivers are verified, licensed, and platform-approved. Your vehicle stays protected.",
  },
  {
    icon: TrendingUp,
    title: "Real-Time Tracking",
    description: "Track your vehicle across Lagos, Abuja, or Port Harcourt. Know where your car is always.",
  },
  {
    icon: Clock,
    title: "Flexible Terms",
    description: "Set your weekly rate. Pause or resume listings anytime. You're in control.",
  },
  {
    icon: Building,
    title: "Full Management",
    description: "We handle driver vetting, payment collection, and all support. You just collect earnings.",
  },
  {
    icon: Headphones,
    title: "Dedicated Owner Support",
    description: "WhatsApp priority support for vehicle owners. Quick responses when you need help.",
  },
];

const OwnerBenefitsSection = () => {
  const { country } = useRegion();
  const { userType } = useUserType();

  // Only show for owners (or when no type selected)
  if (userType === "driver") {
    return null;
  }

  const benefits = country === "Nigeria" ? ownerBenefitsNigeria : ownerBenefitsUSA;
  const title = country === "Nigeria" 
    ? "Let Your Car Work for You" 
    : "Turn Your Vehicle into Income";
  const subtitle = country === "Nigeria"
    ? "Join trusted vehicle owners earning steady income from the ride-hailing boom."
    : "Join hundreds of vehicle owners earning passive income from the rideshare economy.";

  return (
    <section className="py-20 bg-primary text-primary-foreground">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-2 rounded-full bg-accent/20 text-accent text-sm font-medium mb-4">
            For Vehicle Owners
          </span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            {title}
          </h2>
          <p className="text-primary-foreground/70 max-w-2xl mx-auto">
            {subtitle}
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <div
                key={index}
                className="p-6 rounded-xl bg-primary-foreground/5 border border-primary-foreground/10 hover:bg-primary-foreground/10 transition-colors group"
              >
                <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center mb-4 group-hover:bg-accent/30 transition-colors">
                  <Icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-lg font-display font-semibold mb-2">
                  {benefit.title}
                </h3>
                <p className="text-primary-foreground/70 text-sm">
                  {benefit.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default OwnerBenefitsSection;
