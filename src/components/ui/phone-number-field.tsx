import * as React from 'react';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { PhoneNumberInput, type PhoneNumberInputProps } from '@/components/ui/phone-number-input';
import { cn } from '@/lib/utils';
import { useRegionSamples } from '@/hooks/useRegionSamples';

export interface PhoneNumberFieldProps
  extends Omit<PhoneNumberInputProps, 'aria-invalid'> {
  /** Field label rendered above the input. */
  label?: React.ReactNode;
  /** External error (e.g. server-side) shown below the input. */
  error?: string | null;
  /** Optional helper hint under the field. */
  hint?: React.ReactNode;
  /** Show the normalized preview and validity chip. Default: true. */
  showNormalization?: boolean;
  /** Notified whenever validity changes (after normalization). */
  onValidityChange?: (isValid: boolean, e164: string | null) => void;
}

/**
 * Wrapper around <PhoneNumberInput> that gives users inline, real-time
 * feedback about how their input is being normalized to E.164 and flags
 * invalid formats *before* the form is submitted.
 *
 * The preview always uses libphonenumber-js so the same normalisation logic
 * runs on the client that the server enforces via `is_valid_e164()` /
 * `enforce_e164_phone_columns()` triggers.
 */
export const PhoneNumberField = React.forwardRef<HTMLInputElement, PhoneNumberFieldProps>(
  (
    {
      id,
      label,
      error,
      hint,
      value,
      onChange,
      showNormalization = true,
      onValidityChange,
      className,
      ...rest
    },
    ref,
  ) => {
    // Region-aware example — never a hardcoded US "+1" sample.
    const samples = useRegionSamples();

    const parsed = React.useMemo(() => {
      const v = (value ?? '').trim();
      if (!v) return null;
      return parsePhoneNumberFromString(v);
    }, [value]);

    const isValid = !!parsed?.isValid();
    const e164 = isValid ? parsed!.number : null;
    const country = parsed?.country as CountryCode | undefined;

    // Fire validity change callback when it flips.
    const lastValidity = React.useRef<{ valid: boolean; e164: string | null }>({
      valid: false,
      e164: null,
    });
    React.useEffect(() => {
      if (
        lastValidity.current.valid !== isValid ||
        lastValidity.current.e164 !== e164
      ) {
        lastValidity.current = { valid: isValid, e164 };
        onValidityChange?.(isValid, e164);
      }
    }, [isValid, e164, onValidityChange]);

    const showPreview =
      showNormalization && !!value && value.trim().length > 0 && !error;
    const showError = !!error || (!!value && value.trim().length > 3 && !isValid);
    const errorText =
      error ??
      (!isValid && value && value.trim().length > 3
        ? `That number isn’t a valid international format. Include the country code (e.g. ${samples.phoneE164}).`
        : null);

    return (
      <div className={cn('space-y-1.5', className)}>
        {label && <Label htmlFor={id}>{label}</Label>}
        <PhoneNumberInput
          {...rest}
          id={id}
          ref={ref}
          value={value}
          onChange={onChange}
          aria-invalid={showError}
        />
        {showPreview && isValid && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Will be saved as <span className="font-mono">{e164}</span>
            {country && <span className="text-muted-foreground">({country})</span>}
          </p>
        )}
        {showError && errorText && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {errorText}
          </p>
        )}
        {!showError && !showPreview && hint && (
          <p className="text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
    );
  },
);
PhoneNumberField.displayName = 'PhoneNumberField';

export default PhoneNumberField;
