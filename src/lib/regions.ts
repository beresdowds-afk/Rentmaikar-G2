export interface Region {
  id: string;
  name: string;
  country: 'USA' | 'Nigeria' | (string & {});
  currency: 'USD' | 'NGN' | (string & {});
  center: { lat: number; lng: number };
  zoom: number;
  paymentGateway: 'paypal' | 'paystack';
  requiresPoliceReport: boolean;
  cities?: string[];
}

export const regions: Region[] = [
  // USA - DMV States
  {
    id: 'dc',
    name: 'Washington DC',
    country: 'USA',
    currency: 'USD',
    center: { lat: 38.9072, lng: -77.0369 },
    zoom: 11,
    paymentGateway: 'paypal',
    requiresPoliceReport: false,
  },
  {
    id: 'md',
    name: 'Maryland',
    country: 'USA',
    currency: 'USD',
    center: { lat: 39.0458, lng: -76.6413 },
    zoom: 8,
    paymentGateway: 'paypal',
    requiresPoliceReport: false,
    cities: ['Baltimore', 'Silver Spring', 'Bethesda', 'Rockville', 'College Park'],
  },
  {
    id: 'va',
    name: 'Virginia',
    country: 'USA',
    currency: 'USD',
    center: { lat: 37.4316, lng: -78.6569 },
    zoom: 7,
    paymentGateway: 'paypal',
    requiresPoliceReport: false,
    cities: ['Arlington', 'Alexandria', 'Richmond', 'Virginia Beach', 'Norfolk'],
  },
  // Nigeria
  {
    id: 'lagos',
    name: 'Lagos',
    country: 'Nigeria',
    currency: 'NGN',
    center: { lat: 6.5244, lng: 3.3792 },
    zoom: 11,
    paymentGateway: 'paystack',
    requiresPoliceReport: true,
    cities: ['Victoria Island', 'Lekki', 'Ikeja', 'Surulere', 'Yaba'],
  },
  {
    id: 'abuja',
    name: 'Abuja',
    country: 'Nigeria',
    currency: 'NGN',
    center: { lat: 9.0765, lng: 7.3986 },
    zoom: 11,
    paymentGateway: 'paystack',
    requiresPoliceReport: true,
    cities: ['Garki', 'Wuse', 'Maitama', 'Asokoro', 'Gwarinpa'],
  },
  {
    id: 'portharcourt',
    name: 'Port Harcourt',
    country: 'Nigeria',
    currency: 'NGN',
    center: { lat: 4.8156, lng: 7.0498 },
    zoom: 12,
    paymentGateway: 'paystack',
    requiresPoliceReport: true,
    cities: ['GRA', 'Trans Amadi', 'Diobu', 'Rumuokoro', 'Eleme'],
  },
];

export const getRegionById = (id: string): Region | undefined => {
  return regions.find(r => r.id === id);
};

export const getRegionsByCountry = (country: 'USA' | 'Nigeria' | (string & {})): Region[] => {
  return regions.filter(r => r.country === country);
};

export const getAllRegionCenters = (): { id: string; name: string; center: { lat: number; lng: number } }[] => {
  return regions.map(r => ({ id: r.id, name: r.name, center: r.center }));
};
