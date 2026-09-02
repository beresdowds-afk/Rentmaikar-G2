import { TrendingUp, Wallet, ShieldCheck, Radar } from "lucide-react";
import { usePricingHints } from "@/hooks/usePricingHints";

/**
 * Region-aware public pricing hint. Numbers come from
 * `vehicle_category_prices` (super Admin dashboard). If pricing is not
 * configured for the active region we render trust badges only — never
 * a broken/placeholder amount.
 */
const PricingHintBanner = () => {
  const { driverFrom, ownerUpTo, isLoading } = usePricingHints();

  if (isLoading) return null;

  return (
    <section className="bg-muted/40 border-y border-border">
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          {driverFrom && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Drivers</p>
                <p className="font-semibold text-foreground">Rent from {driverFrom}/week</p>
              </div>
            </div>
          )}
          {ownerUpTo && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Owners</p>
                <p className="font-semibold text-foreground">Earn up to {ownerUpTo}/week</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Radar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Always on</p>
              <p className="font-semibold text-foreground">24-hour vehicle tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Trust</p>
              <p className="font-semibold text-foreground">Verified drivers, owners & vehicles</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PricingHintBanner;
