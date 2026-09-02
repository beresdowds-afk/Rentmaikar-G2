import { DollarSign } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";
import { cn } from "@/lib/utils";

interface CurrencyIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  currencyCode?: "USD" | "NGN" | (string & {});
}

const NairaIcon = ({ className }: { className?: string }) => (
  <span className={cn("font-semibold", className)} aria-hidden>₦</span>
);

export const CurrencyIcon = ({ currencyCode, className, ...props }: CurrencyIconProps) => {
  const { currency } = useRegion();
  const code = currencyCode || currency;
  const icon = code === "NGN" ? <NairaIcon className={className} /> : <DollarSign className={className} />;
  return (
    <span className={cn("inline-flex items-center", className)} {...props}>
      {icon}
    </span>
  );
};

export default CurrencyIcon;
