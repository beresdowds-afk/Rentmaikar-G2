import React from "react";
import { ArrowLeftRight, X, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompareVehicle } from "./VehicleComparisonModal";

interface VehicleCompareFloatingDockProps {
  vehicleA: CompareVehicle | null;
  vehicleB: CompareVehicle | null;
  currencySymbol: string;
  onRemoveA: () => void;
  onRemoveB: () => void;
  onOpenModal: () => void;
  onClear: () => void;
}

export const VehicleCompareFloatingDock: React.FC<VehicleCompareFloatingDockProps> = ({
  vehicleA,
  vehicleB,
  currencySymbol,
  onRemoveA,
  onRemoveB,
  onOpenModal,
  onClear,
}) => {
  if (!vehicleA && !vehicleB) return null;

  const count = (vehicleA ? 1 : 0) + (vehicleB ? 1 : 0);

  return (
    <aside
      aria-label="Vehicle comparison dock"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[95%] sm:w-auto max-w-2xl bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl p-2.5 sm:px-4 sm:py-3 animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary/15 text-primary">
              <Scale className="w-4 h-4" />
            </span>
            <span className="text-xs font-semibold text-foreground whitespace-nowrap">
              Compare ({count}/2)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Chip A */}
            {vehicleA ? (
              <div className="flex items-center gap-1.5 bg-muted/80 hover:bg-muted border border-border rounded-lg pl-1.5 pr-1 py-1 text-xs">
                <img
                  src={vehicleA.image}
                  alt=""
                  className="w-5 h-5 rounded object-cover"
                />
                <span className="font-medium text-foreground max-w-[90px] sm:max-w-[120px] truncate">
                  {vehicleA.make} {vehicleA.model}
                </span>
                <button
                  type="button"
                  onClick={onRemoveA}
                  className="p-0.5 rounded-full hover:bg-background text-muted-foreground hover:text-foreground"
                  aria-label="Remove vehicle 1 from comparison"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="border border-dashed border-border rounded-lg px-2 py-1 text-[11px] text-muted-foreground hidden sm:block">
                + Select 1st vehicle
              </div>
            )}

            <ArrowLeftRight className="w-3 h-3 text-muted-foreground shrink-0" />

            {/* Chip B */}
            {vehicleB ? (
              <div className="flex items-center gap-1.5 bg-muted/80 hover:bg-muted border border-border rounded-lg pl-1.5 pr-1 py-1 text-xs">
                <img
                  src={vehicleB.image}
                  alt=""
                  className="w-5 h-5 rounded object-cover"
                />
                <span className="font-medium text-foreground max-w-[90px] sm:max-w-[120px] truncate">
                  {vehicleB.make} {vehicleB.model}
                </span>
                <button
                  type="button"
                  onClick={onRemoveB}
                  className="p-0.5 rounded-full hover:bg-background text-muted-foreground hover:text-foreground"
                  aria-label="Remove vehicle 2 from comparison"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="border border-dashed border-border rounded-lg px-2.5 py-1 text-[11px] text-muted-foreground">
                + Select 2nd vehicle
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClear}
            className="h-8 text-xs text-muted-foreground hover:text-destructive px-2"
          >
            Clear
          </Button>
          <Button
            size="sm"
            variant={count === 2 ? "hero" : "default"}
            onClick={onOpenModal}
            className="h-8 text-xs font-semibold gap-1.5 shadow-sm"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>{count === 2 ? "Compare Side-by-Side" : "View Comparison"}</span>
          </Button>
        </div>
      </div>
    </aside>
  );
};
