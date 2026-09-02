import { useRegion } from "@/contexts/RegionContext";
import { getFeaturesContent } from "@/lib/localized-content";
import { getFeatureIcon } from "@/lib/feature-icons";

const FeaturesSection = () => {
  const { country } = useRegion();
  const content = getFeaturesContent(country);

  return (
    <section className="py-20 bg-primary text-primary-foreground">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-2 rounded-full bg-accent/20 text-accent text-sm font-medium mb-4">
            {content.sectionBadge}
          </span>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
            {content.sectionTitle}
          </h2>
          <p className="text-primary-foreground/70 max-w-2xl mx-auto">
            {content.sectionDescription}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {content.features.map((feature) => {
            const Icon = getFeatureIcon(feature.icon);
            return (
              <div
                key={feature.title}
                className="p-6 rounded-xl bg-primary-foreground/5 border border-primary-foreground/10 hover:bg-primary-foreground/10 transition-colors group"
              >
                <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center mb-4 group-hover:bg-accent/30 transition-colors">
                  <Icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="text-lg font-display font-semibold mb-2">
                  {feature.title}
                </h3>
                <p className="text-primary-foreground/70 text-sm">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
