/**
 * RentMaikar Car Rental JSON-LD Structured Data Generator
 * 
 * Generates Google Rich Results and Schema.org compliant structured markup
 * specifically optimized for Car Rental Services and individual vehicle listings.
 */

import { PublicVehicleRow } from "@/hooks/usePublicVehicles";

export interface BuildVehicleJsonLdOptions {
  vehicle: PublicVehicleRow;
  category: "budget" | "standard" | "premium";
  price?: number;
  currencySymbol: string;
  region: "USA" | "NIGERIA";
  location: string;
}

export function buildVehicleRentalJsonLd(options: BuildVehicleJsonLdOptions) {
  const { vehicle, category, price, region, location } = options;
  const currencyCode = region === "NIGERIA" ? "NGN" : "USD";
  const title = `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.trim() || "Rideshare Rental Vehicle";
  const vehicleUrl = `https://rentmaikar.com/vehicle/${vehicle.id}`;

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 45);
  const validUntilStr = validUntil.toISOString().split("T")[0];

  const photos = (vehicle.photo_urls || []).filter((p) => typeof p === "string" && p.startsWith("http"));
  const defaultImage = "https://rentmaikar.com/rentmaikar-logo.jpg";
  const images = photos.length > 0 ? photos : [defaultImage];

  const effectivePrice =
    typeof price === "number" && price > 0
      ? price
      : category === "budget"
        ? (region === "NIGERIA" ? 120000 : 210)
        : category === "premium"
          ? (region === "NIGERIA" ? 220000 : 360)
          : (region === "NIGERIA" ? 160000 : 280);

  return {
    "@context": "https://schema.org",
    "@graph": [
      // 1. Car Rental Service Provider Entity
      {
        "@type": "AutoRental",
        "@id": "https://rentmaikar.com/#autorental",
        "name": "RentMaikar Rideshare Car Rental",
        "alternateName": "RentMaikar",
        "url": "https://rentmaikar.com",
        "logo": "https://rentmaikar.com/rentmaikar-logo.jpg",
        "image": "https://rentmaikar.com/rentmaikar-logo.jpg",
        "description": "Flexible weekly car rentals for rideshare and private drivers with insurance, routine maintenance, and 24/7 telemetry support.",
        "telephone": "+1-800-RENT-MAIKAR",
        "priceRange": "$$",
        "currenciesAccepted": "USD, NGN",
        "paymentAccepted": "Debit Card, Credit Card, Bank Transfer, PayPal",
        "areaServed": [
          {
            "@type": "Country",
            "name": "United States",
          },
          {
            "@type": "Country",
            "name": "Nigeria",
          },
        ],
      },

      // 2. Individual Vehicle & Rental Product Entity
      {
        "@type": ["Car", "Product"],
        "@id": `${vehicleUrl}#vehicle`,
        "name": title,
        "description": `${title} (${category.toUpperCase()} tier) available for weekly rideshare and private rental on RentMaikar in ${location}. Inspected, tracked, and rideshare-ready.`,
        "url": vehicleUrl,
        "image": images,
        "brand": vehicle.make
          ? {
              "@type": "Brand",
              "name": vehicle.make,
            }
          : undefined,
        "model": vehicle.model || undefined,
        "vehicleModelDate": vehicle.year ? String(vehicle.year) : undefined,
        "color": vehicle.color || undefined,
        "vehicleConfiguration": `${category.charAt(0).toUpperCase() + category.slice(1)} Category Rental`,
        "itemCondition": "https://schema.org/UsedCondition",
        "offers": {
          "@type": "Offer",
          "@id": `${vehicleUrl}#rental-offer`,
          "url": vehicleUrl,
          "price": effectivePrice,
          "priceCurrency": currencyCode,
          "priceValidUntil": validUntilStr,
          "availability": vehicle.status === "available" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          "businessFunction": "http://purl.org/goodrelations/v1#LeaseOut",
          "category": "Car Rental",
          "unitCode": "WEE",
          "unitText": "week",
          "eligibleDuration": {
            "@type": "QuantitativeValue",
            "value": 1,
            "unitCode": "WEE",
          },
          "seller": {
            "@type": "AutoRental",
            "@id": "https://rentmaikar.com/#autorental",
            "name": "RentMaikar",
          },
          "eligibleRegion": {
            "@type": "Place",
            "name": location,
          },
        },
      },

      // 3. Navigation BreadcrumbList Entity
      {
        "@type": "BreadcrumbList",
        "@id": `${vehicleUrl}#breadcrumbs`,
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://rentmaikar.com",
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Catalogue",
            "item": `https://rentmaikar.com/catalogue/${category}`,
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": title,
            "item": vehicleUrl,
          },
        ],
      },
    ],
  };
}
