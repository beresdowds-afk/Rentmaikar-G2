import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Palette, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import Seo from "@/components/seo/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useRegion } from "@/contexts/RegionContext";
import { usePublicVehicle, useCategoryPrices } from "@/hooks/usePublicVehicles";
import BookingRequestDialog from "@/components/catalogue/BookingRequestDialog";
import VehicleSubmissionHistorySection from "@/components/vehicles/VehicleSubmissionHistorySection";


const categoryForYear = (year?: number | null): "budget" | "standard" | "premium" => {
  if (!year) return "standard";
  if (year <= 2016) return "budget";
  if (year <= 2020) return "standard";
  return "premium";
};


const VehicleDetails = () => {
  const { id } = useParams<{ id: string }>();
  const { country, currencySymbol } = useRegion();
  const region: "USA" | "NIGERIA" = country === "Nigeria" ? "NIGERIA" : "USA";
  const { data: vehicle, isLoading, error } = usePublicVehicle(id);
  const { data: categoryPrices } = useCategoryPrices(region);
  const [activePhoto, setActivePhoto] = useState(0);
  const [bookingOpen, setBookingOpen] = useState(false);

  const category = categoryForYear(vehicle?.year);
  const price = useMemo(() => {
    const row = (categoryPrices ?? []).find((p: any) => p.category === category);
    return row ? Number(row.price) : undefined;
  }, [categoryPrices, category]);

  // Public listings always carry owner-submitted photos; no placeholder stand-ins.
  const photos = (vehicle?.photo_urls ?? []).filter((p) => Boolean(p?.trim()));

  const location = vehicle?.pickup_city || vehicle?.pickup_location || "Pickup location shared after approval";
  const title = vehicle ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() : "Vehicle";

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={`${title} — Rentmaikar`.slice(0, 60)}
        description={`${title} available to rent on Rentmaikar${
          vehicle ? ` in ${location}` : ""
        }. View photos, specs and pickup details, then request to book.`}
        path={`/vehicle/${id ?? ""}`}
        jsonLd={
          vehicle
            ? {
                "@context": "https://schema.org",
                "@type": "Vehicle",
                name: title,
                vehicleModelDate: vehicle.year ?? undefined,
                color: vehicle.color ?? undefined,
                brand: vehicle.make ?? undefined,
                model: vehicle.model ?? undefined,
                url: `https://rentmaikar.com/vehicle/${vehicle.id}`,
              }
            : undefined
        }
      />
      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <Link
            to="/catalogue/standard"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6"
          >
            <ArrowLeft className="h-4 w-4" /> Back to catalogue
          </Link>

          {isLoading && (
            <div className="grid md:grid-cols-2 gap-8">
              <Skeleton className="h-80 w-full rounded-xl" />
              <div className="space-y-4">
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          )}

          {!isLoading && error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Could not load this vehicle</AlertTitle>
              <AlertDescription>Please check your connection and try again.</AlertDescription>
            </Alert>
          )}

          {!isLoading && !error && !vehicle && (
            <div className="text-center py-16">
              <h1 className="text-2xl font-display font-bold">This vehicle is not publicly listed</h1>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                It may have been unpublished, rented out, or is still awaiting approval. Browse the catalogue for
                vehicles that are available right now.
              </p>
              <Link to="/catalogue/standard">
                <Button className="mt-6">Browse the catalogue</Button>
              </Link>
            </div>
          )}

          {vehicle && (
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                {photos.length > 0 ? (
                  <div className="rounded-xl overflow-hidden border border-border bg-card">
                    <img
                      src={photos[activePhoto] ?? photos[0]}
                      alt={`${title} photo ${activePhoto + 1}`}
                      className="w-full h-80 object-cover"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 h-80 flex items-center justify-center text-sm text-muted-foreground text-center px-6">
                    Photos pending owner submission — this listing is not shown publicly until verified photos are added.
                  </div>
                )}

                {photos.length > 1 && (
                  <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                    {photos.map((p, i) => (
                      <button
                        key={p + i}
                        onClick={() => setActivePhoto(i)}
                        className={`h-16 w-24 shrink-0 rounded-lg overflow-hidden border-2 transition ${
                          i === activePhoto ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
                        }`}
                        aria-label={`View photo ${i + 1}`}
                      >
                        <img src={p} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="capitalize">
                      {category}
                    </Badge>
                    <Badge variant={vehicle.status === "available" ? "default" : "secondary"}>
                      {vehicle.status === "available" ? "Available now" : "Currently rented"}
                    </Badge>
                  </div>
                  <h1 className="text-3xl font-display font-bold text-foreground">{title}</h1>
                  {typeof price === "number" && (
                    <p className="mt-2 text-xl">
                      <span className="font-bold text-accent">{currencySymbol}</span>
                      <span className="font-bold">{price.toLocaleString()}</span>
                      <span className="text-muted-foreground text-base"> /week</span>
                    </p>
                  )}
                </div>

                <Card>
                  <CardContent className="pt-6 grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>Year: {vehicle.year ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Palette className="h-4 w-4 text-muted-foreground" />
                      <span className="capitalize">Colour: {vehicle.color ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 col-span-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>Pickup: {location}</span>
                    </div>
                    <div className="flex items-center gap-2 col-span-2 text-muted-foreground">
                      <ShieldCheck className="h-4 w-4" />
                      <span>Rideshare-ready, inspected and tracked by Rentmaikar.</span>
                    </div>
                  </CardContent>
                </Card>

                <Button size="lg" className="w-full" onClick={() => setBookingOpen(true)}>
                  Request to book
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Requests are reviewed by our team, who reply with a curated offer. No payment is taken now.
                </p>
              </div>
            </div>
          )}

          {id && <VehicleSubmissionHistorySection vehicleId={id} />}
        </div>

      </main>
      <Footer />

      <BookingRequestDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        price={price}
        vehicle={
          vehicle
            ? {
                id: vehicle.id,
                make: vehicle.make ?? "Vehicle",
                model: vehicle.model ?? "",
                year: vehicle.year,
                location: vehicle.pickup_city ?? vehicle.pickup_location ?? undefined,
              }
            : null
        }
      />
    </div>
  );
};

export default VehicleDetails;
