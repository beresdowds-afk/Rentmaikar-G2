import { useState, useEffect } from 'react';

interface ExchangeRates {
  USD_NGN: number;
  NGN_USD: number;
  lastUpdated: Date;
}

interface UseCurrencyConversionReturn {
  rates: ExchangeRates | null;
  isLoading: boolean;
  error: string | null;
  convertToUSD: (amount: number, fromCurrency: 'USD' | 'NGN' | (string & {})) => number;
  convertToNGN: (amount: number, fromCurrency: 'USD' | 'NGN' | (string & {})) => number;
  formatWithConversion: (amount: number, currency: 'USD' | 'NGN' | (string & {})) => string;
  refetch: () => Promise<void>;
}

// Fallback rate in case API fails
const FALLBACK_USD_NGN = 1550;

export function useCurrencyConversion(): UseCurrencyConversionReturn {
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRates = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Using exchangerate-api.com free tier (no API key required for basic usage)
      const response = await fetch(
        'https://api.exchangerate-api.com/v4/latest/USD'
      );

      if (!response.ok) {
        throw new Error('Failed to fetch exchange rates');
      }

      const data = await response.json();
      const usdToNgn = data.rates?.NGN || FALLBACK_USD_NGN;

      setRates({
        USD_NGN: usdToNgn,
        NGN_USD: 1 / usdToNgn,
        lastUpdated: new Date(),
      });
    } catch (err: any) {
      console.error('Error fetching exchange rates:', err);
      setError(err.message);
      
      // Use fallback rates
      setRates({
        USD_NGN: FALLBACK_USD_NGN,
        NGN_USD: 1 / FALLBACK_USD_NGN,
        lastUpdated: new Date(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
    
    // Refresh rates every 30 minutes
    const interval = setInterval(fetchRates, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const convertToUSD = (amount: number, fromCurrency: 'USD' | 'NGN' | (string & {})): number => {
    if (fromCurrency === 'USD') return amount;
    const rate = rates?.NGN_USD || (1 / FALLBACK_USD_NGN);
    return amount * rate;
  };

  const convertToNGN = (amount: number, fromCurrency: 'USD' | 'NGN' | (string & {})): number => {
    if (fromCurrency === 'NGN') return amount;
    const rate = rates?.USD_NGN || FALLBACK_USD_NGN;
    return amount * rate;
  };

  const formatWithConversion = (amount: number, currency: 'USD' | 'NGN' | (string & {})): string => {
    if (currency === 'USD') {
      return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  return {
    rates,
    isLoading,
    error,
    convertToUSD,
    convertToNGN,
    formatWithConversion,
    refetch: fetchRates,
  };
}
