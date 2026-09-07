import { Link } from "react-router-dom";
import { TrendingUp, Wallet, ShieldCheck, Radar, ArrowRight } from "lucide-react";
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
            <Link
              to="/catalogue/standard"
              className="flex items-center gap-3 p-2 -m-2 rounded-lg hover:bg-card/80 transition-all group cursor-pointer"
              title="Browse vehicles available to rent"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center shrink-0 transition-colors">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs uppercase tracking-wide flex items-center gap-1 font-medium">
                  Drivers
                  <ArrowRight className="w-3 h-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="font-semibold text-foreground truncate">Rent from {driverFrom}/week</p>
              </div>
            </Link>
          )}
          {ownerUpTo && (
            <Link
              to="/owner/register"
              className="flex items-center gap-3 p-2 -m-2 rounded-lg hover:bg-card/80 transition-all group cursor-pointer"
              title="List your vehicle and earn weekly income"
            >
              <div className="w-10 h-10 rounded-lg bg-accent/10 group-hover:bg-accent/20 flex items-center justify-center shrink-0 transition-colors">
                <TrendingUp className="w-5 h-5 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs uppercase tracking-wide flex items-center gap-1 font-medium">
                  Owners
                  <ArrowRight className="w-3 h-3 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="font-semibold text-foreground truncate">Earn up to {ownerUpTo}/week</p>
              </div>
            </Link>
          )}
          <div className="flex items-center gap-3 p-2 -m-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Radar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide font-medium">Always on</p>
              <p className="font-semibold text-foreground">24-hour vehicle tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-2 -m-2">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide font-medium">Trust</p>
              <p className="font-semibold text-foreground">Verified drivers, owners & vehicles</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PricingHintBanner;
