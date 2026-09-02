import { Calendar, MapPin, Car } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PublicVehicleRow } from "@/hooks/usePublicVehicles";

/**
 * Renders a listing exactly as an anonymous visitor sees it, using only the
 * RLS-safe fields exposed by `public_vehicle_listings`.
 */
const PublicListingPreview = ({
  vehicle,
  price,
  currencySymbol,
  fallbackImage,
}: {
  vehicle: PublicVehicleRow;
  price?: number;
  currencySymbol: string;
  fallbackImage: string;
}) => {
  const location = vehicle.pickup_city || vehicle.pickup_location || "Unknown";
  const image = vehicle.photo_urls?.[0] || fallbackImage;

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl overflow-hidden shadow-card border border-border max-w-sm">
        <div className="relative h-48 overflow-hidden">
          <img src={image} alt={`${vehicle.make ?? "Vehicle"} ${vehicle.model ?? ""}`} className="w-full h-full object-cover" />
          <div className="absolute top-3 right-3 bg-card/90 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-medium">
            {vehicle.status === "available" ? "Available" : "Rented"}
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Calendar className="w-3 h-3" />
            {vehicle.year ?? "—"}
            <span className="mx-1">•</span>
            {vehicle.color ?? "—"}
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            {vehicle.make} {vehicle.model}
          </h3>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
            <MapPin className="w-3 h-3" />
            {location}
          </div>
          {typeof price === "number" && (
            <div className="mt-4 pt-4 border-t border-border flex items-baseline gap-1">
              <span className="text-lg font-bold text-accent">{currencySymbol}</span>
              <span className="text-xl font-bold text-foreground">{price.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">/week</span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border p-4 text-sm space-y-2">
        <p className="font-medium flex items-center gap-2">
          <Car className="h-4 w-4 text-primary" /> Fields visible to anonymous visitors
        </p>
        <div className="flex flex-wrap gap-2">
          {["make", "model", "year", "color", "status", "pickup city", "pickup location", "photos"].map((f) => (
            <Badge key={f} variant="secondary" className="capitalize">
              {f}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Plate, VIN, owner and telemetry data are never exposed on the public catalogue.
        </p>
      </div>
    </div>
  );
};

export default PublicListingPreview;
