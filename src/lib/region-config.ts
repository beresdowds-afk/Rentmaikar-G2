export interface RegionConfig {
  currency: string;
  currencySymbol: string;
  phonePrefix: string;
  whatsappNumber: string;
  smsNumber: string;
  supportEmail: string;
}

export interface CompanyInfo {
  companyName: string;
  phone: string;
  phoneRaw: string;
  email: string;
  fullAddress: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export const regionConfig: Record<string, RegionConfig> = {
  USA: {
    currency: 'USD',
    currencySymbol: '$',
    phonePrefix: '+1',
    whatsappNumber: '+18005550199',
    smsNumber: '+18005550199',
    supportEmail: 'support@rentmaikar.com',
  },
  Nigeria: {
    currency: 'NGN',
    currencySymbol: '₦',
    phonePrefix: '+234',
    whatsappNumber: '+2348000000000',
    smsNumber: '+2348000000000',
    supportEmail: 'support.ng@rentmaikar.com',
  },
};

export const contactOverrides: Record<string, Partial<RegionConfig>> = {};

export const companyInfoMap: Record<string, CompanyInfo> = {
  USA: {
    companyName: 'RentMaikar Inc.',
    phone: '+1 (800) 555-0199',
    phoneRaw: '+18005550199',
    email: 'support@rentmaikar.com',
    fullAddress: '100 Main St, Austin, TX 78701, USA',
    address: '100 Main St',
    city: 'Austin',
    state: 'TX',
    country: 'USA',
    postalCode: '78701',
  },
  Nigeria: {
    companyName: 'RentMaikar Nigeria Ltd.',
    phone: '+234 800 000 0000',
    phoneRaw: '+2348000000000',
    email: 'support.ng@rentmaikar.com',
    fullAddress: 'Victoria Island, Lagos, Nigeria',
    address: 'Victoria Island',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    postalCode: '101241',
  },
};
