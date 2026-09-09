export interface RegionSamples {
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phoneE164: string;
  address: string;
  city: string;
  location: string;
  landmark: string;
  state: string;
  postalLabel: string;
  postalCode: string;
  country: string;
}

export function regionSampleData(selected: any): RegionSamples {
  const isNigeria =
    selected?.value?.toLowerCase() === 'nigeria' ||
    selected?.countryCode?.toLowerCase() === 'ng' ||
    selected?.phonePrefix === '+234';

  if (isNigeria) {
    return {
      firstName: 'Olumide',
      lastName: 'Adeyemi',
      name: 'Olumide Adeyemi',
      email: 'olumide@example.com',
      phoneE164: '+2348012345678',
      address: '14 Adeola Odeku St, Victoria Island',
      city: 'Lagos',
      location: 'Victoria Island, Lagos',
      landmark: 'Near Eko Hotel',
      state: 'Lagos',
      postalLabel: 'Postal Code',
      postalCode: '101241',
      country: 'Nigeria',
    };
  }

  return {
    firstName: 'Sarah',
    lastName: 'Johnson',
    name: 'Sarah Johnson',
    email: 'sarah.j@example.com',
    phoneE164: '+15125550198',
    address: '742 Evergreen Terrace',
    city: 'Austin',
    location: 'Downtown, Austin',
    landmark: 'Near Zilker Park',
    state: 'TX',
    postalLabel: 'ZIP Code',
    postalCode: '78701',
    country: 'USA',
  };
}
