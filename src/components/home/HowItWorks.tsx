import { UserPlus, Search, CreditCard, Car } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";
import { getHowItWorksContent } from "@/lib/localized-content";

const icons = [UserPlus, Search, CreditCard, Car];

const HowItWorks = () => {
  const { country } = useRegion();
  const content = getHowItWorksContent(country);

  return (
    <section className="py-20 bg-muted/50">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            {content.sectionBadge}
          </span>
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            {content.sectionTitle}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {content.sectionDescription}
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {content.steps.map((step, index) => {
            const Icon = icons[index];
            return (
              <div
                key={step.title}
                className="relative text-center group"
              >
                {/* Connector Line */}
                {index < content.steps.length - 1 && (
                  <div className="hidden lg:block absolute top-12 left-[60%] w-[80%] h-0.5 bg-border" />
                )}
                
                {/* Step Number */}
                <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full bg-card shadow-card group-hover:shadow-card-hover transition-shadow mb-6">
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </div>
                  <Icon className="w-10 h-10 text-primary" />
                </div>

                <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                  {step.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
