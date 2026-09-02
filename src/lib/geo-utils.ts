// Haversine formula to calculate distance between two coordinates in miles
export const calculateDistanceInMiles = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (deg: number): number => deg * (Math.PI / 180);

// USA location coordinates (approximate city centers)
export const usaLocationCoordinates: Record<string, { lat: number; lng: number }> = {
  "Washington DC": { lat: 38.9072, lng: -77.0369 },
  "Maryland": { lat: 39.0458, lng: -76.6413 },
  "Virginia": { lat: 37.4316, lng: -78.6569 },
  "Baltimore": { lat: 39.2904, lng: -76.6122 },
  "Silver Spring": { lat: 38.9907, lng: -77.0261 },
  "Bethesda": { lat: 38.9847, lng: -77.0947 },
  "Rockville": { lat: 39.0840, lng: -77.1528 },
  "College Park": { lat: 38.9897, lng: -76.9378 },
  "Arlington": { lat: 38.8816, lng: -77.0910 },
  "Alexandria": { lat: 38.8048, lng: -77.0469 },
  "Richmond": { lat: 37.5407, lng: -77.4360 },
  "Virginia Beach": { lat: 36.8529, lng: -75.9780 },
  "Norfolk": { lat: 36.8508, lng: -76.2859 },
};

// Nigeria cities grouped by major regions
export const nigeriaCities: Record<string, string[]> = {
  "Lagos": ["Lagos", "Victoria Island", "Lekki", "Ikeja", "Surulere", "Yaba"],
  "Abuja": ["Abuja", "Garki", "Wuse", "Maitama", "Asokoro", "Gwarinpa"],
  "Port Harcourt": ["Port Harcourt", "GRA", "Trans Amadi", "Diobu", "Rumuokoro", "Eleme"],
};

// Get the parent city for a Nigerian location
export const getNigeriaParentCity = (location: string): string | null => {
  for (const [parentCity, subLocations] of Object.entries(nigeriaCities)) {
    if (parentCity === location || subLocations.includes(location)) {
      return parentCity;
    }
  }
  return null;
};

// Nigeria city coordinates for distance calculation
export const nigeriaCityCoordinates: Record<string, { lat: number; lng: number }> = {
  "Lagos": { lat: 6.5244, lng: 3.3792 },
  "Abuja": { lat: 9.0765, lng: 7.3986 },
  "Port Harcourt": { lat: 4.8156, lng: 7.0498 },
};

// Get distance between two locations
export const getDistanceBetweenLocations = (
  location1: string,
  location2: string,
  country: "USA" | "Nigeria" | (string & {})
): number => {
  if (country === "Nigeria") {
    const city1 = getNigeriaParentCity(location1) || location1;
    const city2 = getNigeriaParentCity(location2) || location2;
    const coords1 = nigeriaCityCoordinates[city1];
    const coords2 = nigeriaCityCoordinates[city2];
    if (!coords1 || !coords2) return Infinity;
    return calculateDistanceInMiles(coords1.lat, coords1.lng, coords2.lat, coords2.lng);
  } else {
    const coords1 = usaLocationCoordinates[location1];
    const coords2 = usaLocationCoordinates[location2];
    if (!coords1 || !coords2) return Infinity;
    return calculateDistanceInMiles(coords1.lat, coords1.lng, coords2.lat, coords2.lng);
  }
};

// Default USA catalogue radius (miles). Updated from 35 → 25 to match the
// tighter "vehicles near me" rule surfaced on the driver dashboard.
export const USA_DEFAULT_RADIUS_MILES = 25;

// Check if a vehicle is within range based on country rules
export const isVehicleInRange = (
  vehicleLocation: string,
  vehicleCoordinates: { lat: number; lng: number } | null,
  userLocation: string,
  userCoordinates: { lat: number; lng: number } | null,
  country: "USA" | "Nigeria" | (string & {}),
  radiusMiles: number = USA_DEFAULT_RADIUS_MILES
): boolean => {
  if (country === "Nigeria") {
    // Nigeria: Match by city
    const vehicleParentCity = getNigeriaParentCity(vehicleLocation);
    const userParentCity = getNigeriaParentCity(userLocation);
    return vehicleParentCity !== null && vehicleParentCity === userParentCity;
  } else {
    // USA: configurable radius (default 25 miles)
    if (!vehicleCoordinates || !userCoordinates) {
      const vCoords = usaLocationCoordinates[vehicleLocation];
      const uCoords = usaLocationCoordinates[userLocation];
      if (!vCoords || !uCoords) return false;
      const distance = calculateDistanceInMiles(
        uCoords.lat, uCoords.lng,
        vCoords.lat, vCoords.lng
      );
      return distance <= radiusMiles;
    }
    const distance = calculateDistanceInMiles(
      userCoordinates.lat, userCoordinates.lng,
      vehicleCoordinates.lat, vehicleCoordinates.lng
    );
    return distance <= radiusMiles;
  }
};

// Get distance from user location to vehicle location
export const getVehicleDistance = (
  vehicleLocation: string,
  vehicleCoordinates: { lat: number; lng: number } | null,
  userLocation: string,
  userCoordinates: { lat: number; lng: number } | null,
  country: "USA" | "Nigeria" | (string & {})
): number => {
  if (country === "Nigeria") {
    return getDistanceBetweenLocations(vehicleLocation, userLocation, country);
  } else {
    if (vehicleCoordinates && userCoordinates) {
      return calculateDistanceInMiles(
        userCoordinates.lat, userCoordinates.lng,
        vehicleCoordinates.lat, vehicleCoordinates.lng
      );
    }
    return getDistanceBetweenLocations(vehicleLocation, userLocation, country);
  }
};
