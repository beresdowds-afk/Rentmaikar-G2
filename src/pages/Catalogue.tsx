import Seo from "@/components/seo/Seo";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Search, Filter, MapPin, Calendar, Info, Loader2, AlertTriangle, ShieldAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useRegion } from "@/contexts/RegionContext";
import { useCategoryYearSpecs } from "@/hooks/useCategoryYearSpecs";
import {
  usePublicVehicles,
  useCategoryPrices,
  type CatalogueAvailability,
  type PublicVehicleRow,
} from "@/hooks/usePublicVehicles";
import {
  isVehicleInRange,
  getVehicleDistance,
  getNigeriaParentCity,
  usaLocationCoordinates,
  USA_DEFAULT_RADIUS_MILES,
} from "@/lib/geo-utils";
import BookingRequestDialog from "@/components/catalogue/BookingRequestDialog";
import categoryBudget from "@/assets/category-budget.jpg";
import categoryStandard from "@/assets/category-standard.jpg";
import categoryPremium from "@/assets/category-premium.jpg";

interface CatalogueVehicle {
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
}

const categoryInfo: Record<
  string,
  { title: string; years: string; minPrice: number; maxPrice: number; minPriceNGN: number; maxPriceNGN: number; color: string }
> = {
  budget: { title: "Budget Friendly", years: "2015 - 2016", minPrice: 200, maxPrice: 250, minPriceNGN: 48000, maxPriceNGN: 60000, color: "category-budget" },
  standard: { title: "Standard Selection", years: "2017 - 2020", minPrice: 251, maxPrice: 300, minPriceNGN: 61000, maxPriceNGN: 73000, color: "category-standard" },
  premium: { title: "Premium Fleet", years: "2021 - 2025", minPrice: 301, maxPrice: 350, minPriceNGN: 74000, maxPriceNGN: 93000, color: "category-premium" },
};

const categoryImages: Record<string, string> = {
  budget: categoryBudget,
  standard: categoryStandard,
  premium: categoryPremium,
};

const getDriverHomeLocation = (country: string) => {
  if (country === "Nigeria") return { location: "Lagos", coordinates: null };
  return { location: "Washington DC", coordinates: { lat: 38.9072, lng: -77.0369 } };
};

const isNigeriaLocation = (location: string) =>
  Boolean(getNigeriaParentCity(location)) || /lagos|abuja|port harcourt|ibadan|kano|benin|enugu|nigeria/i.test(location);

const RADIUS_OPTIONS = [5, 10, 25, 50, 100];
const ANY_DISTANCE = 100000;

const Catalogue = () => {
  const { category = "budget" } = useParams<{ category: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { country, currencySymbol } = useRegion();
  const radiusParam = Number(searchParams.get("radius"));
  const [radiusMiles, setRadiusMiles] = useState<number>(
    Number.isFinite(radiusParam) && radiusParam > 0 ? radiusParam : USA_DEFAULT_RADIUS_MILES,
  );

  // Keep the shareable ?radius= parameter in sync with the control.
  const changeRadius = (value: number) => {
    setRadiusMiles(value);
    const next = new URLSearchParams(searchParams);
    next.set("radius", String(value));
    setSearchParams(next, { replace: true });
  };

  const [bookingVehicle, setBookingVehicle] = useState<CatalogueVehicle | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("nearby");
  const [availability, setAvailability] = useState<CatalogueAvailability>("available");
  const [minPriceInput, setMinPriceInput] = useState("");
  const [maxPriceInput, setMaxPriceInput] = useState("");
  const [sortBy, setSortBy] = useState("price-low");
  const [makeFilter, setMakeFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");

  // Debounce the search box so each keystroke doesn't hit the database.
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const driverHome = getDriverHomeLocation(country);
  const baseInfo = categoryInfo[category] || categoryInfo.budget;
  const { getForCategory, formatRange, visible: yearSpecsVisible } = useCategoryYearSpecs(country);
  const dynamicSpec = getForCategory(category);
  const info = {
    ...baseInfo,
    years: yearSpecsVisible && dynamicSpec ? formatRange(dynamicSpec) : baseInfo.years,
  };

  const region: "USA" | "NIGERIA" = country === "Nigeria" ? "NIGERIA" : "USA";
  const { data: categoryPrices } = useCategoryPrices(region);
  const categoryPrice = useMemo(() => {
    const row = (categoryPrices ?? []).find((p: any) => p.category === category);
    if (row) return Number(row.price);
    return country === "Nigeria" ? baseInfo.minPriceNGN : baseInfo.minPrice;
  }, [categoryPrices, category, country, baseInfo]);

  const {
    vehicles: rows,
    total,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    error,
  } = usePublicVehicles({
    search: searchQuery,
    minYear: dynamicSpec?.min_year,
    maxYear: dynamicSpec?.max_year,
    availability,
  });

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const vehicles: CatalogueVehicle[] = useMemo(() => {
    return (rows as PublicVehicleRow[])
      // Only owner-submitted vehicles with real uploaded photos are listed publicly.
      .filter((row) => Boolean(row.photo_urls?.[0]?.trim()))
      .map((row) => {
        const location = row.pickup_city || row.pickup_location || "Unknown";
        return { row, location };
      })
      .filter(({ location }) => (country === "Nigeria" ? isNigeriaLocation(location) : !isNigeriaLocation(location)))

      .map(({ row, location }) => {
        const coordinates = usaLocationCoordinates[location] ?? null;
        const distance = getVehicleDistance(location, coordinates, driverHome.location, driverHome.coordinates, country);
        const isNearby = isVehicleInRange(
          location,
          coordinates,
          driverHome.location,
          driverHome.coordinates,
          country,
          radiusMiles,
        );
        return {
          id: row.id,
          make: row.make ?? "Unknown",
          model: row.model ?? "",
          year: row.year,
          color: row.color ?? "—",
          status: row.status ?? "available",
          location,
          image: row.photo_urls![0],
          price: categoryPrice,
          distance,
          isNearby,
          nearestCity: country === "Nigeria" ? getNigeriaParentCity(location) || location : location,
        };
      });
  }, [rows, country, driverHome, radiusMiles, category, categoryPrice]);

  const nearbyCount = useMemo(() => vehicles.filter((v) => v.isNearby).length, [vehicles]);

  const minPrice = minPriceInput ? Number(minPriceInput) : undefined;
  const maxPrice = maxPriceInput ? Number(maxPriceInput) : undefined;

  const makeOptions = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.make).filter(Boolean))).sort(),
    [vehicles],
  );
  const modelOptions = useMemo(
    () =>
      Array.from(
        new Set(
          vehicles
            .filter((v) => makeFilter === "all" || v.make === makeFilter)
            .map((v) => v.model)
            .filter(Boolean),
        ),
      ).sort(),
    [vehicles, makeFilter],
  );
  const cityOptions = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.location).filter(Boolean))).sort(),
    [vehicles],
  );

  const filteredVehicles = useMemo(() => {
    return vehicles
      .filter((v) => {
        if (locationFilter === "nearby" && !v.isNearby) return false;
        if (makeFilter !== "all" && v.make !== makeFilter) return false;
        if (modelFilter !== "all" && v.model !== modelFilter) return false;
        if (cityFilter !== "all" && v.location !== cityFilter) return false;
        if (typeof minPrice === "number" && !Number.isNaN(minPrice) && v.price < minPrice) return false;
        if (typeof maxPrice === "number" && !Number.isNaN(maxPrice) && v.price > maxPrice) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.isNearby !== b.isNearby) return a.isNearby ? -1 : 1;
        if (sortBy === "price-low" && a.price !== b.price) return a.price - b.price;
        if (sortBy === "price-high" && a.price !== b.price) return b.price - a.price;
        if (sortBy === "newest") return (b.year ?? 0) - (a.year ?? 0);
        return a.distance - b.distance;
      });
  }, [vehicles, locationFilter, minPrice, maxPrice, sortBy, makeFilter, modelFilter, cityFilter]);

  const clearFilters = () => {
    setSearchInput("");
    setSearchQuery("");
    setLocationFilter("all");
    setAvailability("all");
    setMinPriceInput("");
    setMaxPriceInput("");
    setMakeFilter("all");
    setModelFilter("all");
    setCityFilter("all");
  };

  const categoryLabel = (category || "vehicles").replace(/-/g, " ");
  const catalogueTitle = `${categoryLabel.charAt(0).toUpperCase()}${categoryLabel.slice(1)} Vehicles — Rentmaikar Catalogue`;
  // Unknown categories fall back to the budget listing, so they must not
  // self-canonicalise — point them at the real page and keep them out of the index.
  const isKnownCategory = Boolean(categoryInfo[category]);
  const canonicalCategory = isKnownCategory ? category : "budget";

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={catalogueTitle.slice(0, 60)}
        description={`Browse ${categoryLabel} rideshare-ready vehicles available to rent on Rentmaikar, with pricing, location and availability for the USA and Nigeria.`}
        path={`/catalogue/${canonicalCategory}`}
        noindex={!isKnownCategory}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: catalogueTitle,
          url: `https://rentmaikar.com/catalogue/${canonicalCategory}`,
        }}
      />

      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Link to="/" className="hover:text-foreground">Home</Link>
              <span>/</span>
              <span className="text-foreground capitalize">{category} Cars</span>
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">{info.title}</h1>
                <p className="text-muted-foreground mt-1">
                  {info.years} • {currencySymbol}
                  {country === "Nigeria" ? info.minPriceNGN.toLocaleString() : info.minPrice} - {currencySymbol}
                  {country === "Nigeria" ? info.maxPriceNGN.toLocaleString() : info.maxPrice}/week
                </p>
              </div>

              <div className="flex gap-2">
                <Link to="/catalogue/budget">
                  <Button variant={category === "budget" ? "default" : "outline"} size="sm">Budget</Button>
                </Link>
                <Link to="/catalogue/standard">
                  <Button variant={category === "standard" ? "default" : "outline"} size="sm">Standard</Button>
                </Link>
                <Link to="/catalogue/premium">
                  <Button variant={category === "premium" ? "default" : "outline"} size="sm">Premium</Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Location Info Alert */}
          <Alert className="mb-6 border-accent/30 bg-accent/5">
            <Info className="h-4 w-4 text-accent" />
            <AlertDescription className="text-sm">
              {country === "Nigeria" ? (
                <>Showing vehicles in <strong>{driverHome.location}</strong> (your home city)</>
              ) : (
                <>Showing vehicles within <strong>{radiusMiles} miles</strong> of <strong>{driverHome.location}</strong></>
              )}
            </AlertDescription>
          </Alert>

          {/* Filters */}
          <div className="bg-card rounded-xl p-4 mb-8 shadow-sm border border-border">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="Search by make or model..."
                  className="pl-10"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>

              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-full md:w-52">
                  <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Nearby Vehicles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nearby">
                    {country === "Nigeria"
                      ? "My City Only"
                      : radiusMiles >= ANY_DISTANCE
                        ? "Any distance"
                        : `Within ${radiusMiles} Miles`}
                  </SelectItem>
                  <SelectItem value="all">All {country === "Nigeria" ? "Nigeria" : "DMV Area"}</SelectItem>
                </SelectContent>
              </Select>

              {country !== "Nigeria" && (
                <Select value={String(radiusMiles)} onValueChange={(v) => changeRadius(Number(v))}>
                  <SelectTrigger className="w-full md:w-44" aria-label="Search radius">
                    <SelectValue placeholder="Radius" />
                  </SelectTrigger>
                  <SelectContent>
                    {RADIUS_OPTIONS.map((r) => (
                      <SelectItem key={r} value={String(r)}>
                        Within {r} miles
                      </SelectItem>
                    ))}
                    <SelectItem value={String(ANY_DISTANCE)}>Any distance</SelectItem>
                  </SelectContent>
                </Select>
              )}

              <Select value={availability} onValueChange={(v) => setAvailability(v as CatalogueAvailability)}>
                <SelectTrigger className="w-full md:w-44">
                  <SelectValue placeholder="Availability" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available now</SelectItem>
                  <SelectItem value="rented">Currently rented</SelectItem>
                  <SelectItem value="all">Any availability</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full md:w-48">
                  <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="price-low">Price: Low to High</SelectItem>
                  <SelectItem value="price-high">Price: High to Low</SelectItem>
                  <SelectItem value="newest">Newest Year</SelectItem>
                  <SelectItem value="distance">Closest First</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Price range ({currencySymbol}/week)</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Min"
                  className="w-28"
                  value={minPriceInput}
                  onChange={(e) => setMinPriceInput(e.target.value)}
                  aria-label="Minimum weekly price"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Max"
                  className="w-28"
                  value={maxPriceInput}
                  onChange={(e) => setMaxPriceInput(e.target.value)}
                  aria-label="Maximum weekly price"
                />
              </div>
              <Select
                value={makeFilter}
                onValueChange={(v) => {
                  setMakeFilter(v);
                  setModelFilter("all");
                }}
              >
                <SelectTrigger className="w-full sm:w-40" aria-label="Filter by make">
                  <SelectValue placeholder="Make" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All makes</SelectItem>
                  {makeOptions.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={modelFilter} onValueChange={setModelFilter}>
                <SelectTrigger className="w-full sm:w-40" aria-label="Filter by model">
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All models</SelectItem>
                  {modelOptions.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="w-full sm:w-44" aria-label="Filter by pickup location">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {cityOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="ghost" size="sm" onClick={clearFilters} className="sm:ml-auto">
                Reset filters
              </Button>
            </div>
          </div>

          {/* Results count */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-muted-foreground">
              {isLoading ? "Loading vehicles…" : `${filteredVehicles.length} of ${total} vehicles`}
              {!isLoading && country !== "Nigeria" && (
                <span className="ml-2 text-xs">
                  ({nearbyCount} within {radiusMiles >= ANY_DISTANCE ? "any distance" : `${radiusMiles} mi`})
                </span>
              )}
              {!isLoading && country === "Nigeria" && nearbyCount > 0 && (
                <span className="ml-2 text-xs">({nearbyCount} in your city)</span>
              )}
            </span>
          </div>

          {/* Error state */}
          {error && (
            <Alert variant="destructive" className="mb-8">
              {error.kind === "permission" ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <AlertTitle>
                {error.kind === "permission"
                  ? "Vehicle listings are not publicly visible"
                  : error.kind === "network"
                    ? "Could not load vehicles"
                    : "Something went wrong"}
              </AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{error.message}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Loading skeletons */}
          {isLoading && !error && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-card rounded-xl overflow-hidden border border-border">
                  <Skeleton className="h-48 w-full" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Vehicle Grid */}
          {!isLoading && !error && filteredVehicles.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredVehicles.map((vehicle, index) => {
                  const showSeparator =
                    locationFilter === "all" && !vehicle.isNearby && (index === 0 || filteredVehicles[index - 1]?.isNearby);

                  return (
                    <React.Fragment key={vehicle.id}>
                      {showSeparator && (
                        <div className="col-span-full py-4">
                          <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-sm font-medium text-muted-foreground px-3 py-1 bg-muted rounded-full">
                              Vehicles from Nearby Cities
                            </span>
                            <div className="h-px flex-1 bg-border" />
                          </div>
                        </div>
                      )}
                      <div
                        className={`bg-card rounded-xl overflow-hidden shadow-card card-hover border ${
                          vehicle.isNearby ? "border-border" : "border-muted"
                        }`}
                      >
                        <div className="relative h-48 overflow-hidden">
                          <img
                            src={vehicle.image}
                            alt={`${vehicle.make} ${vehicle.model}`}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-3 right-3 bg-card/90 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-medium">
                            {vehicle.status === "available" ? "Available" : "Rented"}
                          </div>
                          <div
                            className={`absolute top-3 left-3 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1 text-xs ${
                              sortBy === "distance"
                                ? "bg-accent/90 text-accent-foreground font-medium"
                                : "bg-muted/90 text-muted-foreground"
                            }`}
                          >
                            <MapPin className="w-3 h-3" />
                            <span>
                              {country === "Nigeria"
                                ? vehicle.nearestCity
                                : Number.isFinite(vehicle.distance)
                                  ? `${vehicle.distance.toFixed(1)} mi away`
                                  : "Distance unknown"}
                            </span>
                          </div>
                        </div>

                        <div className="p-4">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                            <Calendar className="w-3 h-3" />
                            {vehicle.year ?? "—"}
                            <span className="mx-1">•</span>
                            {vehicle.color}
                          </div>

                          <h3 className="text-lg font-semibold text-foreground">
                            {vehicle.make} {vehicle.model}
                          </h3>

                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <MapPin className="w-3 h-3" />
                            {vehicle.location}
                          </div>

                          <div className="mt-4 pt-4 border-t border-border space-y-3">
                            <div className="flex items-center gap-1">
                              <span className="text-lg font-bold text-accent">{currencySymbol}</span>
                              <span className="text-xl font-bold text-foreground">
                                {vehicle.price.toLocaleString()}
                              </span>
                              <span className="text-sm text-muted-foreground">/week</span>
                            </div>

                            <div className="flex gap-2">
                              <Link to={`/vehicle/${vehicle.id}`} className="flex-1">
                                <Button size="sm" variant="outline" className="w-full">View details</Button>
                              </Link>
                              <Button size="sm" variant="hero" className="flex-1" onClick={() => setBookingVehicle(vehicle)}>
                                Request to book
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Infinite scroll sentinel + manual fallback */}
              <div ref={sentinelRef} className="h-px w-full" />
              <div className="flex justify-center mt-8">
                {isFetchingNextPage && (
                  <span className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading more vehicles…
                  </span>
                )}
                {!isFetchingNextPage && hasNextPage && (
                  <Button variant="outline" onClick={() => fetchNextPage()}>Load more vehicles</Button>
                )}
                {!hasNextPage && total > 0 && (
                  <span className="text-sm text-muted-foreground">You have reached the end of the catalogue.</span>
                )}
              </div>
            </>
          )}

          {/* Empty states */}
          {!isLoading && !error && filteredVehicles.length === 0 && (
            <div className="text-center py-16 max-w-xl mx-auto">
              {total === 0 ? (
                <>
                  <p className="text-muted-foreground text-lg">No vehicles are published for public viewing yet.</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Only vehicles an owner has listed as available or active appear here. If you expect to see vehicles,
                    they may still be pending approval or restricted to signed-in staff.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-lg">No vehicles match your current filters.</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {country === "Nigeria"
                      ? `Try viewing all vehicles in Nigeria instead of just ${driverHome.location}, or widen your price range.`
                      : "Try expanding your search to the entire DMV area, or widen your price range."}
                  </p>
                </>
              )}
              <Button variant="outline" className="mt-4" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </main>
      <Footer />

      <BookingRequestDialog
        open={Boolean(bookingVehicle)}
        onOpenChange={(open) => !open && setBookingVehicle(null)}
        price={bookingVehicle?.price}
        vehicle={
          bookingVehicle
            ? {
                id: bookingVehicle.id,
                make: bookingVehicle.make,
                model: bookingVehicle.model,
                year: bookingVehicle.year,
                location: bookingVehicle.location,
              }
            : null
        }
      />
    </div>
  );
};

export default Catalogue;
