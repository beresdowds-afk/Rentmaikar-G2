import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeftRight,
  Calendar,
  MapPin,
  Palette,
  ShieldCheck,
  Check,
  X,
  Car,
  Fuel,
  TrendingDown,
  Navigation,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CompareVehicle {
  id: string;
  make: string;
  model: string;
  year: number | null;
  color: string;
  status: string;
  location: string;
  image: string;
  price: number;
  distance: number;
  isNearby: boolean;
  nearestCity?: string;
  category?: string;
}

interface VehicleComparisonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleA: CompareVehicle | null;
  vehicleB: CompareVehicle | null;
  allVehicles: CompareVehicle[];
  currencySymbol: string;
  country: string;
  onSelectVehicleA: (vehicle: CompareVehicle | null) => void;
  onSelectVehicleB: (vehicle: CompareVehicle | null) => void;
  onRequestBook: (vehicle: CompareVehicle) => void;
  onClear: () => void;
}

const getTierLabel = (year: number | null) => {
  if (!year) return { label: "Standard Selection", badge: "standard" };
  if (year <= 2016) return { label: "Budget Friendly", badge: "budget" };
  if (year <= 2020) return { label: "Standard Selection", badge: "standard" };
  return { label: "Premium Fleet", badge: "premium" };
};

const getRideshareEligibility = (year: number | null) => {
  if (!year) return "UberX, Lyft, Bolt Standard";
  if (year >= 2021) return "Uber Comfort, UberX, Lyft Extra, Bolt Premium";
  if (year >= 2017) return "UberX, Lyft, Bolt Standard & Airport";
  return "UberX, Bolt Standard, Lyft (City limits)";
};

export const VehicleComparisonModal: React.FC<VehicleComparisonModalProps> = ({
  open,
  onOpenChange,
  vehicleA,
  vehicleB,
  allVehicles,
  currencySymbol,
  country,
  onSelectVehicleA,
  onSelectVehicleB,
  onRequestBook,
  onClear,
}) => {
  const [highlightDifferences, setHighlightDifferences] = useState(false);

  const handleSwap = () => {
    const temp = vehicleA;
    onSelectVehicleA(vehicleB);
    onSelectVehicleB(temp);
  };

  const priceDiff =
    vehicleA && vehicleB && vehicleA.price !== vehicleB.price
      ? Math.abs(vehicleA.price - vehicleB.price)
      : 0;

  const yearDiff =
    vehicleA?.year && vehicleB?.year && vehicleA.year !== vehicleB.year
      ? Math.abs(vehicleA.year - vehicleB.year)
      : 0;

  const tierA = vehicleA ? getTierLabel(vehicleA.year) : null;
  const tierB = vehicleB ? getTierLabel(vehicleB.year) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-border bg-card/60 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <ArrowLeftRight className="w-5 h-5" />
                </span>
                <DialogTitle className="text-xl font-bold tracking-tight">
                  Vehicle Comparison
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground mt-1">
                Evaluate specifications, rental economics, and rideshare features side-by-side.
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {vehicleA && vehicleB && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSwap}
                    className="h-8 text-xs gap-1.5"
                    title="Swap left and right vehicles"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Swap</span>
                  </Button>
                  <Button
                    variant={highlightDifferences ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setHighlightDifferences(!highlightDifferences)}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Fuel className="w-3.5 h-3.5" />
                    <span>{highlightDifferences ? "Highlighting Diff" : "Highlight Diff"}</span>
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="h-8 text-xs text-muted-foreground hover:text-destructive"
              >
                Reset
              </Button>
            </div>
          </div>
        </div>

        {/* Comparison Content Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Side-by-side vehicle cards & selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {/* Vehicle A Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vehicle 1
                </span>
                <Select
                  value={vehicleA?.id || ""}
                  onValueChange={(id) => {
                    const found = allVehicles.find((v) => v.id === id) || null;
                    onSelectVehicleA(found);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs w-[180px]">
                    <SelectValue placeholder="Select vehicle..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {allVehicles.map((v) => (
                      <SelectItem
                        key={`select-a-${v.id}`}
                        value={v.id}
                        disabled={v.id === vehicleB?.id}
                        className="text-xs"
                      >
                        {v.year} {v.make} {v.model} ({currencySymbol}{v.price})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {vehicleA ? (
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm flex flex-col">
                  <div className="relative h-44 sm:h-52 overflow-hidden bg-muted/40">
                    <img
                      src={vehicleA.image}
                      alt={`${vehicleA.make} ${vehicleA.model}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2.5 right-2.5">
                      <Badge
                        variant={vehicleA.status === "available" ? "default" : "secondary"}
                        className="text-[11px] font-medium backdrop-blur-md"
                      >
                        {vehicleA.status === "available" ? "Available now" : "Rented"}
                      </Badge>
                    </div>
                    {tierA && (
                      <div className="absolute top-2.5 left-2.5">
                        <Badge variant="outline" className="bg-card/90 text-[11px] backdrop-blur-md">
                          {tierA.label}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{vehicleA.year ?? "Year unspecified"}</span>
                        <span>•</span>
                        <span className="capitalize">{vehicleA.color}</span>
                      </div>
                      <h3 className="text-lg font-bold text-foreground">
                        {vehicleA.make} {vehicleA.model}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{vehicleA.location}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-border flex items-baseline justify-between">
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-bold text-primary">{currencySymbol}</span>
                          <span className="text-2xl font-extrabold text-foreground tracking-tight">
                            {vehicleA.price.toLocaleString()}
                          </span>
                          <span className="text-xs text-muted-foreground">/week</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          ~{currencySymbol}
                          {Math.round(vehicleA.price / 7).toLocaleString()}/day est.
                        </span>
                      </div>

                      {vehicleB && vehicleA.price < vehicleB.price && (
                        <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[11px] gap-1">
                          <TrendingDown className="w-3 h-3" />
                          Save {currencySymbol}
                          {priceDiff.toLocaleString()}/wk
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Link to={`/vehicle/${vehicleA.id}`} target="_blank" className="w-full">
                        <Button variant="outline" size="sm" className="w-full text-xs gap-1">
                          Details <ExternalLink className="w-3 h-3" />
                        </Button>
                      </Link>
                      <Button
                        variant="hero"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => onRequestBook(vehicleA)}
                      >
                        Book This Car
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border-2 border-dashed border-border/80 bg-muted/20 p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
                  <Car className="w-10 h-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm font-medium text-foreground">No vehicle selected</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Choose a vehicle from the dropdown above or select one from the catalogue cards.
                  </p>
                </div>
              )}
            </div>

            {/* Vehicle B Column */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vehicle 2
                </span>
                <Select
                  value={vehicleB?.id || ""}
                  onValueChange={(id) => {
                    const found = allVehicles.find((v) => v.id === id) || null;
                    onSelectVehicleB(found);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs w-[180px]">
                    <SelectValue placeholder="Select vehicle..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {allVehicles.map((v) => (
                      <SelectItem
                        key={`select-b-${v.id}`}
                        value={v.id}
                        disabled={v.id === vehicleA?.id}
                        className="text-xs"
                      >
                        {v.year} {v.make} {v.model} ({currencySymbol}{v.price})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {vehicleB ? (
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm flex flex-col">
                  <div className="relative h-44 sm:h-52 overflow-hidden bg-muted/40">
                    <img
                      src={vehicleB.image}
                      alt={`${vehicleB.make} ${vehicleB.model}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2.5 right-2.5">
                      <Badge
                        variant={vehicleB.status === "available" ? "default" : "secondary"}
                        className="text-[11px] font-medium backdrop-blur-md"
                      >
                        {vehicleB.status === "available" ? "Available now" : "Rented"}
                      </Badge>
                    </div>
                    {tierB && (
                      <div className="absolute top-2.5 left-2.5">
                        <Badge variant="outline" className="bg-card/90 text-[11px] backdrop-blur-md">
                          {tierB.label}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{vehicleB.year ?? "Year unspecified"}</span>
                        <span>•</span>
                        <span className="capitalize">{vehicleB.color}</span>
                      </div>
                      <h3 className="text-lg font-bold text-foreground">
                        {vehicleB.make} {vehicleB.model}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{vehicleB.location}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-border flex items-baseline justify-between">
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-bold text-primary">{currencySymbol}</span>
                          <span className="text-2xl font-extrabold text-foreground tracking-tight">
                            {vehicleB.price.toLocaleString()}
                          </span>
                          <span className="text-xs text-muted-foreground">/week</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          ~{currencySymbol}
                          {Math.round(vehicleB.price / 7).toLocaleString()}/day est.
                        </span>
                      </div>

                      {vehicleA && vehicleB.price < vehicleA.price && (
                        <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[11px] gap-1">
                          <TrendingDown className="w-3 h-3" />
                          Save {currencySymbol}
                          {priceDiff.toLocaleString()}/wk
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Link to={`/vehicle/${vehicleB.id}`} target="_blank" className="w-full">
                        <Button variant="outline" size="sm" className="w-full text-xs gap-1">
                          Details <ExternalLink className="w-3 h-3" />
                        </Button>
                      </Link>
                      <Button
                        variant="hero"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => onRequestBook(vehicleB)}
                      >
                        Book This Car
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border-2 border-dashed border-border/80 bg-muted/20 p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
                  <Car className="w-10 h-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm font-medium text-foreground">Select second vehicle</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Choose a second vehicle from the dropdown above to complete the side-by-side comparison.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Feature-by-Feature Detailed Comparison Table */}
          {vehicleA && vehicleB && (
            <div className="border border-border rounded-xl overflow-hidden bg-card text-xs">
              <div className="bg-muted/40 px-4 py-2.5 font-semibold text-foreground border-b border-border flex items-center justify-between">
                <span>Detailed Feature Specifications</span>
                {priceDiff > 0 && (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    Rate variance: {currencySymbol}
                    {priceDiff.toLocaleString()}/week
                  </span>
                )}
              </div>

              <div className="divide-y divide-border">
                {/* Weekly Rental Rate */}
                <div
                  className={`grid grid-cols-3 p-3 items-center ${
                    highlightDifferences && vehicleA.price !== vehicleB.price
                      ? "bg-amber-500/5 dark:bg-amber-500/10 font-medium"
                      : ""
                  }`}
                >
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    Weekly Rate
                  </span>
                  <div className="font-semibold text-foreground">
                    {currencySymbol}
                    {vehicleA.price.toLocaleString()}
                    {vehicleA.price < vehicleB.price && (
                      <span className="ml-1.5 text-[10px] text-emerald-600 font-bold">
                        (Lower rate)
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-foreground">
                    {currencySymbol}
                    {vehicleB.price.toLocaleString()}
                    {vehicleB.price < vehicleA.price && (
                      <span className="ml-1.5 text-[10px] text-emerald-600 font-bold">
                        (Lower rate)
                      </span>
                    )}
                  </div>
                </div>

                {/* Estimated Daily Rate */}
                <div className="grid grid-cols-3 p-3 items-center">
                  <span className="text-muted-foreground">Est. Daily Rate</span>
                  <span>
                    ~{currencySymbol}
                    {Math.round(vehicleA.price / 7).toLocaleString()}
                  </span>
                  <span>
                    ~{currencySymbol}
                    {Math.round(vehicleB.price / 7).toLocaleString()}
                  </span>
                </div>

                {/* Year of Manufacture */}
                <div
                  className={`grid grid-cols-3 p-3 items-center ${
                    highlightDifferences && vehicleA.year !== vehicleB.year
                      ? "bg-amber-500/5 dark:bg-amber-500/10 font-medium"
                      : ""
                  }`}
                >
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" /> Year
                  </span>
                  <div>
                    {vehicleA.year ?? "—"}
                    {vehicleA.year && vehicleB.year && vehicleA.year > vehicleB.year && (
                      <span className="ml-1 text-[10px] text-primary font-medium">(Newer)</span>
                    )}
                  </div>
                  <div>
                    {vehicleB.year ?? "—"}
                    {vehicleA.year && vehicleB.year && vehicleB.year > vehicleA.year && (
                      <span className="ml-1 text-[10px] text-primary font-medium">(Newer)</span>
                    )}
                  </div>
                </div>

                {/* Fleet Category Tier */}
                <div className="grid grid-cols-3 p-3 items-center">
                  <span className="text-muted-foreground">Category Tier</span>
                  <span className="capitalize">{tierA?.label}</span>
                  <span className="capitalize">{tierB?.label}</span>
                </div>

                {/* Exterior Colour */}
                <div
                  className={`grid grid-cols-3 p-3 items-center ${
                    highlightDifferences && vehicleA.color !== vehicleB.color
                      ? "bg-amber-500/5 dark:bg-amber-500/10 font-medium"
                      : ""
                  }`}
                >
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-muted-foreground" /> Colour
                  </span>
                  <span className="capitalize">{vehicleA.color}</span>
                  <span className="capitalize">{vehicleB.color}</span>
                </div>

                {/* Pickup City / Location */}
                <div
                  className={`grid grid-cols-3 p-3 items-center ${
                    highlightDifferences && vehicleA.location !== vehicleB.location
                      ? "bg-amber-500/5 dark:bg-amber-500/10 font-medium"
                      : ""
                  }`}
                >
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> Pickup Area
                  </span>
                  <span className="truncate">{vehicleA.location}</span>
                  <span className="truncate">{vehicleB.location}</span>
                </div>

                {/* Distance / Proximity */}
                <div className="grid grid-cols-3 p-3 items-center">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-muted-foreground" /> Proximity
                  </span>
                  <span>
                    {country === "Nigeria"
                      ? vehicleA.nearestCity || vehicleA.location
                      : Number.isFinite(vehicleA.distance)
                        ? `${vehicleA.distance.toFixed(1)} miles away`
                        : "Distance unknown"}
                  </span>
                  <span>
                    {country === "Nigeria"
                      ? vehicleB.nearestCity || vehicleB.location
                      : Number.isFinite(vehicleB.distance)
                        ? `${vehicleB.distance.toFixed(1)} miles away`
                        : "Distance unknown"}
                  </span>
                </div>

                {/* Rideshare Eligibility */}
                <div className="grid grid-cols-3 p-3 items-center">
                  <span className="text-muted-foreground">Rideshare Tiers</span>
                  <span className="text-[11px] leading-snug">{getRideshareEligibility(vehicleA.year)}</span>
                  <span className="text-[11px] leading-snug">{getRideshareEligibility(vehicleB.year)}</span>
                </div>

                {/* 100-Point Inspection */}
                <div className="grid grid-cols-3 p-3 items-center">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Platform Inspection
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <Check className="w-3.5 h-3.5" /> 100-Point Certified
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <Check className="w-3.5 h-3.5" /> 100-Point Certified
                  </span>
                </div>

                {/* IoT Telemetry & Tracking */}
                <div className="grid grid-cols-3 p-3 items-center">
                  <span className="text-muted-foreground">Fleet Telemetry</span>
                  <span className="flex items-center gap-1 text-foreground">
                    <Check className="w-3.5 h-3.5 text-primary" /> Active GPS & Security
                  </span>
                  <span className="flex items-center gap-1 text-foreground">
                    <Check className="w-3.5 h-3.5 text-primary" /> Active GPS & Security
                  </span>
                </div>

                {/* Routine Maintenance */}
                <div className="grid grid-cols-3 p-3 items-center">
                  <span className="text-muted-foreground">Routine Maintenance</span>
                  <span className="flex items-center gap-1 text-foreground">
                    <Check className="w-3.5 h-3.5 text-primary" /> Included in Agreement
                  </span>
                  <span className="flex items-center gap-1 text-foreground">
                    <Check className="w-3.5 h-3.5 text-primary" /> Included in Agreement
                  </span>
                </div>

                {/* Direct Action Row */}
                <div className="grid grid-cols-3 p-3 items-center bg-muted/20">
                  <span className="font-medium text-foreground">Action</span>
                  <div>
                    <Button
                      size="sm"
                      variant="hero"
                      className="text-xs h-8"
                      onClick={() => onRequestBook(vehicleA)}
                    >
                      Book {vehicleA.make}
                    </Button>
                  </div>
                  <div>
                    <Button
                      size="sm"
                      variant="hero"
                      className="text-xs h-8"
                      onClick={() => onRequestBook(vehicleB)}
                    >
                      Book {vehicleB.make}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>All vehicles are verified, insured, and rideshare-ready before handover.</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs h-8">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
