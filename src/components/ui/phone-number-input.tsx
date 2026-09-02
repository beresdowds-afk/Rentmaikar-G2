import * as React from 'react';
import PhoneInputBase, { type Country } from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import 'react-phone-number-input/style.css';
import '@/styles/phone-input.css';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePhoneExample } from '@/hooks/usePhoneReference';

export interface PhoneNumberInputProps {
  /** E.164 value, e.g. "+2348012345678". */
  value?: string;
  onChange: (value: string) => void;
  /**
   * Default ISO country when the value doesn't yet include a calling code.
   * Leave undefined to show a neutral picker with no pre-filled dialing code.
   */
  defaultCountry?: Country;
  /** Notified whenever the flag/country picker changes. */
  onCountryChange?: (country: Country | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  autoComplete?: string;
  'aria-invalid'?: boolean;
}

/**
 * Region-aware phone input with an IDD (international dialing code) country
 * selector. Emits E.164 formatted values on change. Country list, flags and
 * per-country formatting come from libphonenumber-js.
 *
 * The picker is fully controlled internally so the flag, IDD and per-country
 * example placeholder always stay in sync — no matter whether the user picks
 * a country manually, pastes a number with a `+` prefix, or the caller's
 * region resolves asynchronously.
 */
export const PhoneNumberInput = React.forwardRef<HTMLInputElement, PhoneNumberInputProps>(
  (
    {
      value,
      onChange,
      defaultCountry,
      onCountryChange,
      placeholder,
      disabled,
      className,
      id,
      name,
      autoComplete = 'tel',
      ...rest
    },
    ref,
  ) => {
    // No hardcoded country and no implicit region guess: the picker only
    // pre-selects a country when the caller asks for one explicitly, or when
    // the value itself carries a dialing code. Otherwise it stays neutral so
    // no flag or calling code is filled in for the user.
    const resolvedDefault: Country | undefined = defaultCountry;

    // Track the picker's current country so the flag/IDD stay consistent with
    // both the value AND the resolved default when it changes asynchronously.
    const parsedFromValue = React.useMemo(() => {
      if (!value) return undefined;
      return parsePhoneNumberFromString(value)?.country as Country | undefined;
    }, [value]);

    const [country, setCountry] = React.useState<Country | undefined>(
      parsedFromValue ?? resolvedDefault,
    );

    // If the value or the resolved default changes (e.g. RegionContext
    // switches, or the async profile lookup lands), reconcile the picker.
    React.useEffect(() => {
      const next = parsedFromValue ?? resolvedDefault;
      setCountry((prev) => (prev === next ? prev : next));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parsedFromValue, resolvedDefault]);

    const active = country ?? resolvedDefault;
    const example = usePhoneExample(active);
    const effectivePlaceholder =
      placeholder ??
      (active && example ? `e.g. ${example}` : 'Select country, then enter your number');

    return (
      <PhoneInputBase
        international
        countryCallingCodeEditable={false}
        country={country}
        defaultCountry={resolvedDefault}
        addInternationalOption
        onCountryChange={(c) => {
          setCountry(c as Country | undefined);
          onCountryChange?.(c as Country | undefined);
        }}
        flags={flags}
        internationalIcon={() => <Globe className="h-4 w-4 text-muted-foreground" aria-hidden />}
        value={value || undefined}
        onChange={(v) => onChange((v as string) || '')}
        disabled={disabled}
        placeholder={effectivePlaceholder}
        numberInputProps={{
          ref: ref as React.Ref<HTMLInputElement>,
          id,
          name,
          autoComplete,
          'aria-invalid': rest['aria-invalid'],
          className:
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        }}
        className={cn('phone-number-input flex items-center gap-2', className)}
      />
    );
  },
);
PhoneNumberInput.displayName = 'PhoneNumberInput';

export default PhoneNumberInput;
