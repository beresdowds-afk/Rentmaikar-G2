import { Country } from "@/contexts/RegionContext";

export interface HeroContent {
  badge: string;
  headline: string;
  highlightedWord: string;
  description: string;
  primaryCta: string;
  secondaryCta: string;
  whatsappCta: string;
  smsCta: string;
}

export interface CategoryContent {
  sectionBadge: string;
  sectionTitle: string;
  sectionDescription: string;
  budget: {
    title: string;
    description: string;
    priceLabel: string;
    minPriceLabel: string;
  };
  standard: {
    title: string;
    description: string;
    priceLabel: string;
    minPriceLabel: string;
  };
  premium: {
    title: string;
    description: string;
    priceLabel: string;
    minPriceLabel: string;
  };
  viewCta: string;
}

export interface HowItWorksContent {
  sectionBadge: string;
  sectionTitle: string;
  sectionDescription: string;
  steps: {
    title: string;
    description: string;
  }[];
}

export type FeatureIconKey =
  | "verification"
  | "rideshare-approval"
  | "flexible-terms"
  | "tracking"
  | "support"
  | "payments"
  | "insurance"
  | "roadside";

export interface FeaturesContent {
  sectionBadge: string;
  sectionTitle: string;
  sectionDescription: string;
  features: {
    title: string;
    description: string;
    icon: FeatureIconKey;
  }[];
}

export interface CTAContent {
  driver: {
    title: string;
    description: string;
    cta: string;
  };
  owner: {
    title: string;
    description: string;
    cta: string;
  };
}

export interface TestimonialContent {
  sectionTitle: string;
  testimonials: {
    name: string;
    location: string;
    platform: string;
    quote: string;
    earning?: string;
  }[];
}

// ============================================
// USA CONTENT - Direct, Efficiency-Focused
// ============================================

const usaHeroContent: HeroContent = {
  badge: "USA 🇺🇸 Rideshare Rentals",
  headline: "Earn From Your Car.",
  highlightedWord: "Maximize Your Earnings",
  description: "Turn your vehicle into a profit machine. List with trusted drivers, collect weekly payments, and build passive income—while we handle the rest.",
  primaryCta: "Drivers, Find Your Car",
  secondaryCta: "Owners, Earn From Your Car",
  whatsappCta: "Chat with Us",
  smsCta: "Text Us",
};

const usaCategoryContent: CategoryContent = {
  sectionBadge: "Vehicle Tiers",
  sectionTitle: "Choose Your Path to Higher Earnings",
  sectionDescription: "Select the vehicle tier that matches your goals. Every car is rideshare-ready and designed to help you succeed.",
  budget: {
    title: "The Smart Start",
    description: "Get started without big upfront costs. Reliable, fuel-efficient cars that let you keep more of your weekly earnings.",
    priceLabel: "$250",
    minPriceLabel: "$200",
  },
  standard: {
    title: "The Earnings Optimizer",
    description: "Boost your ratings and unlock better ride requests. Modern comforts and reliability that passengers love.",
    priceLabel: "$300",
    minPriceLabel: "$251",
  },
  premium: {
    title: "The Top Earner",
    description: "Command higher rates with Uber Comfort and Lyft Lux. Drive the latest models to attract premium rides and maximize your income.",
    priceLabel: "$350",
    minPriceLabel: "$301",
  },
  viewCta: "See Cars",
};

const usaHowItWorksContent: HowItWorksContent = {
  sectionBadge: "Quick Start",
  sectionTitle: "Get on the Road in Days, Not Weeks",
  sectionDescription: "Our streamlined process eliminates the barriers between you and your next paycheck.",
  steps: [
    {
      title: "Sign Up in Minutes",
      description: "Quick driver verification with your rideshare approval and valid ID.",
    },
    {
      title: "Match with Your Perfect Car",
      description: "Browse our curated selection and find the vehicle that fits your earning goals.",
    },
    {
      title: "Approve Your Easy Weekly Plan",
      description: "Secure weekly payments via PayPal. Transparent pricing, no hidden fees.",
    },
    {
      title: "Pick Up & Start Earning",
      description: "Get your keys and hit the road. Start accepting rides immediately.",
    },
  ],
};

const usaFeaturesContent: FeaturesContent = {
  sectionBadge: "Your Competitive Edge",
  sectionTitle: "Everything You Need to Succeed",
  sectionDescription: "We've eliminated the friction so you can focus on what matters: maximizing your earnings.",
  features: [
    {
      icon: "rideshare-approval",
      title: "Bring or Get Your Rideshare Approval",
      description: "Already approved by Uber, Lyft or a delivery app? Plug in and drive. New to rideshare? Our team helps you get approved during onboarding.",
    },
    {
      icon: "verification",
      title: "Verified Drivers, Owners & Vehicles",
      description: "Government-ID checks, background screening for drivers, title and inspection checks for every vehicle — before anything hits the road.",
    },
    {
      icon: "flexible-terms",
      title: "Flexible Weekly Terms",
      description: "No long-term contracts. Drivers pay weekly; owners set the weekly rate. Upgrade, switch, or pause when life changes.",
    },
    {
      icon: "tracking",
      title: "24-Hour Vehicle Tracking & Monitoring",
      description: "Every rental vehicle is tracked around the clock — location, speed, ignition, geofence alerts and remote lockdown on defaults.",
    },
    {
      icon: "support",
      title: "24/7 Support via WhatsApp, Phone & Email",
      description: "Real people, real fast. No direct owner-to-driver contact — every issue is mediated by Rentmaikar Support.",
    },
    {
      icon: "payments",
      title: "Secure PayPal Weekly Billing",
      description: "Automated weekly debits through PayPal. Transparent split, receipts on every payment.",
    },
    {
      icon: "insurance",
      title: "Rideshare-Grade Insurance Included",
      description: "Comprehensive coverage covering third-party liability, collision and theft during rideshare use. Full policy shared before you sign.",
    },
    {
      icon: "roadside",
      title: "Optional Roadside Support",
      description: "Add 24/7 roadside assistance for a low monthly fee — jump-starts, towing, flat tires, lockouts.",
    },
  ],
};

const usaCTAContent: CTAContent = {
  driver: {
    title: "Drivers, Ready to Maximize Your Earnings?",
    description: "Join thousands of drivers who've unlocked their earning potential. Fast approval, flexible terms, and support when you need it.",
    cta: "Drivers, Find Your Car Now",
  },
  owner: {
    title: "Owners, Turn Your Vehicle into Income",
    description: "List your car and earn passive income. We handle driver screening, weekly payments, and all support.",
    cta: "Owners, Start Earning",
  },
};

const usaTestimonialContent: TestimonialContent = {
  sectionTitle: "What Drivers Are Saying",
  testimonials: [
    {
      name: "Marcus D.",
      location: "Washington DC",
      platform: "Uber/Lyft Driver",
      quote: "Thanks to this platform, I went from a used sedan to a premium SUV and increased my weekly earnings by 40%.",
      earning: "+40% weekly",
    },
    {
      name: "Sarah L.",
      location: "Virginia",
      platform: "Lyft Driver",
      quote: "The weekly rental lets me drive when I want, and their support team actually fixes issues fast.",
    },
    {
      name: "James R.",
      location: "Maryland",
      platform: "Uber Driver",
      quote: "Easy sign-up, clear pricing, and a car that passengers love. Best decision I made for my rideshare business.",
    },
  ],
};

// ============================================
// NIGERIA CONTENT - Community, Trust-Focused
// ============================================

const nigeriaHeroContent: HeroContent = {
  badge: "Nigeria 🇳🇬 Ride-Hailing Rentals",
  headline: "Register Your Vehicle.",
  highlightedWord: "Grow Your Income",
  description: "Join a trusted network of vehicle owners. Connect with verified drivers and start earning passive income from Bolt, Uber, and InDrive rentals today.",
  primaryCta: "Drivers, Find Your Car",
  secondaryCta: "Owners, Earn From Your Car",
  whatsappCta: "Chat on WhatsApp",
  smsCta: "Send SMS",
};

const nigeriaCategoryContent: CategoryContent = {
  sectionBadge: "Vehicle Categories",
  sectionTitle: "Choose Your Path to Success",
  sectionDescription: "Select wisely, earn more. Every car is verified and ready for ride-hailing platforms.",
  budget: {
    title: "The Smart Start",
    description: "Perfect for wise starters. Keep your costs low and your profits high with these reliable, fuel-saving champions.",
    priceLabel: "₦60,000",
    minPriceLabel: "₦48,000",
  },
  standard: {
    title: "The Profit Builder",
    description: "Boost your ratings and attract better rides. Modern comfort that passengers appreciate and reward with tips.",
    priceLabel: "₦73,000",
    minPriceLabel: "₦61,000",
  },
  premium: {
    title: "The Top Earner",
    description: "Command premium fares and VIP rides. Drive the latest models that passengers request by name.",
    priceLabel: "₦93,000",
    minPriceLabel: "₦74,000",
  },
  viewCta: "View Cars",
};

const nigeriaHowItWorksContent: HowItWorksContent = {
  sectionBadge: "Your Roadmap",
  sectionTitle: "Simple, Fast & Secure",
  sectionDescription: "We keep it clear and straightforward. Here is exactly how a driver goes from sign-up to earning.",
  steps: [
    {
      title: "Sign Up & Get Verified",
      description: "Register with your valid ID (NIN/BVN) and driver's licence. We verify your identity, driving record and referees.",
    },
    {
      title: "Bring or Get Your Ride-Hailing Approval",
      description: "Already approved on Bolt, Uber or InDrive? Great. New to it? Our onboarding team helps you get approved.",
    },
    {
      title: "Pick Your Car & Pay Deposit",
      description: "Browse verified cars in Lagos, Abuja or Port Harcourt. Sign the weekly rental agreement and pay the refundable security deposit.",
    },
    {
      title: "Pick Up & Start Earning",
      description: "Collect the keys, complete the handover inspection and hit the road. Weekly rent is auto-debited via Paystack.",
    },
  ],
};

const nigeriaFeaturesContent: FeaturesContent = {
  sectionBadge: "Why Drivers & Owners Trust Us",
  sectionTitle: "Built for Your Success",
  sectionDescription: "Every feature is designed for the Nigerian rideshare driver and vehicle owner — with clear rules and no direct wahala.",
  features: [
    {
      icon: "rideshare-approval",
      title: "Bring or Get Your Ride-Hailing Approval",
      description: "Already driving on Bolt, Uber or InDrive? Plug in and go. New to it? Our team helps you get approved during onboarding.",
    },
    {
      icon: "verification",
      title: "Verified Drivers, Owners & Vehicles",
      description: "NIN/BVN ID checks, driver's licence review, referee attestations and vehicle inspection — verified before anyone hits the road.",
    },
    {
      icon: "flexible-terms",
      title: "Flexible Weekly Terms",
      description: "Weekly rentals with the freedom to upgrade or switch anytime. Owners set the weekly rate; drivers pick the car.",
    },
    {
      icon: "tracking",
      title: "24-Hour Vehicle Tracking & Monitoring",
      description: "Every rental vehicle is tracked around the clock — location, speed, geofence alerts and remote lockdown on default.",
    },
    {
      icon: "support",
      title: "24/7 WhatsApp & Phone Support",
      description: "Rentmaikar mediates every issue between driver and owner. No direct owner-to-driver contact, no off-platform payments.",
    },
    {
      icon: "payments",
      title: "Secure Paystack Weekly Billing",
      description: "Automated weekly debits through Paystack. Transparent split and receipts on every payment.",
    },
    {
      icon: "insurance",
      title: "Ride-Hailing Insurance Included",
      description: "Comprehensive coverage during ride-hailing use — third-party liability, collision and theft. Full policy shared before you sign.",
    },
  ],
};

const nigeriaCTAContent: CTAContent = {
  driver: {
    title: "Drivers, Ready to Join the Community?",
    description: "Join thousands of Nigerian drivers growing their income with verified vehicles. Clear rules, fair pricing, real support.",
    cta: "Drivers, Register Now",
  },
  owner: {
    title: "Owners, Let Your Car Work for You",
    description: "Register your vehicle and earn steady weekly income. We handle driver verification, secure payments and full support.",
    cta: "Owners, Register Your Vehicle",
  },
};

const nigeriaTestimonialContent: TestimonialContent = {
  sectionTitle: "What Our Drivers Say",
  testimonials: [
    {
      name: "Emeka O.",
      location: "Lagos",
      platform: "Bolt/Uber Driver",
      quote: "I started with their 'Smart Start' car and upgraded in 6 months. This platform changed my game! My weekly profit increased by ₦35,000.",
      earning: "+₦35,000 weekly",
    },
    {
      name: "Adebayo K.",
      location: "Abuja",
      platform: "InDrive Driver",
      quote: "The verification process gave me confidence. I know my vehicle owner is legitimate, and the support team responds fast.",
    },
    {
      name: "Chidi N.",
      location: "Port Harcourt",
      platform: "Bolt Driver",
      quote: "No more fuel-guzzling cars eating my profit. The fuel-efficient option they matched me with was perfect for PH traffic.",
    },
  ],
};

// ============================================
// CONTENT GETTER FUNCTIONS
// ============================================

export const getHeroContent = (country: Country): HeroContent => {
  return country === "Nigeria" ? nigeriaHeroContent : usaHeroContent;
};

export const getCategoryContent = (country: Country): CategoryContent => {
  return country === "Nigeria" ? nigeriaCategoryContent : usaCategoryContent;
};

export const getHowItWorksContent = (country: Country): HowItWorksContent => {
  return country === "Nigeria" ? nigeriaHowItWorksContent : usaHowItWorksContent;
};

export const getFeaturesContent = (country: Country): FeaturesContent => {
  return country === "Nigeria" ? nigeriaFeaturesContent : usaFeaturesContent;
};

export const getCTAContent = (country: Country): CTAContent => {
  return country === "Nigeria" ? nigeriaCTAContent : usaCTAContent;
};

export const getTestimonialContent = (country: Country): TestimonialContent => {
  return country === "Nigeria" ? nigeriaTestimonialContent : usaTestimonialContent;
};

// Price formatting helper
export const formatPrice = (baseUSD: number, country: Country): string => {
  if (country === "Nigeria") {
    // Approximate NGN conversion (1 USD ≈ 750 NGN for display purposes)
    const ngnAmount = baseUSD * 750;
    return `₦${ngnAmount.toLocaleString()}`;
  }
  return `$${baseUSD}`;
};
