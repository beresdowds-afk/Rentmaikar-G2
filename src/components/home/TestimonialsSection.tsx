import { useRegion } from "@/contexts/RegionContext";
import { useUserType } from "@/contexts/UserTypeContext";
import { getTestimonialContent } from "@/lib/localized-content";
import { Quote, Star } from "lucide-react";

const TestimonialsSection = () => {
  const { country } = useRegion();
  const { userType } = useUserType();
  const content = getTestimonialContent(country);

  // Only show driver testimonials for drivers (or when no type selected)
  // Owners see a different value proposition
  if (userType === "owner") {
    return null;
  }

  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-2 rounded-full bg-accent/10 text-accent text-sm font-medium mb-4">
            Driver Stories
          </span>
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            {content.sectionTitle}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Real stories from drivers in our community who are growing their income.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {content.testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="relative bg-card rounded-xl p-6 shadow-card hover:shadow-card-hover transition-shadow border border-border"
            >
              {/* Quote Icon */}
              <div className="absolute -top-3 left-6">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                  <Quote className="w-4 h-4 text-accent-foreground" />
                </div>
              </div>

              {/* Stars */}
              <div className="flex gap-1 mb-4 mt-2">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-accent text-accent" />
                ))}
              </div>

              {/* Quote */}
              <p className="text-foreground mb-6 leading-relaxed">
                "{testimonial.quote}"
              </p>

              {/* Earning Badge */}
              {testimonial.earning && (
                <div className="inline-block px-3 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-sm font-semibold mb-4">
                  {testimonial.earning}
                </div>
              )}

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t border-border">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-semibold">
                    {testimonial.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-foreground">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {testimonial.platform} • {testimonial.location}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
