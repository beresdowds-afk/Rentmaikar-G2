import Seo from "@/components/seo/Seo";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { User, Mail, Phone, MapPin, FileText, Car, Check, ArrowLeft, ExternalLink, Shield } from "lucide-react";
import { PhoneNumberInput } from "@/components/ui/phone-number-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import ConsentSection, { type MessagingChannel } from "@/components/registration/ConsentSection";
import { recordSmsConsentPair } from "@/lib/sms-consent";
import { toast } from "sonner";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PricingHintBanner from "@/components/home/PricingHintBanner";
import { supabase } from "@/integrations/supabase/client";
import { ensureAuthUserForApplicant } from "@/lib/user-provisioning";
import { classifyRegistrationError, type FriendlyRegistrationError } from "@/lib/registration-errors";
import { logRegistrationEvent } from "@/lib/registration-audit";
import { RegistrationErrorAlert } from "@/components/registration/RegistrationErrorAlert";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuth } from "@/contexts/AuthContext";
import { usePersonaEnabled } from "@/hooks/usePersonaEnabled";
import { refereeDetailsRequired } from "@/lib/referee-requirements";
import { useRefereeRequirement } from "@/hooks/useRefereeRequirement";
import { useRegionSamples } from "@/hooks/useRegionSamples";

import {
  ADDRESS_MIN,
  ADDRESS_MAX,
  addressHint as buildAddressHint,
  requiredAddressSchema,
} from "@/lib/address-validation";

/** Phone field that must parse to a valid international (E.164) number. */
const toE164 = (v: string) => {
  const t = (v || "").trim();
  return t.startsWith("+") ? t.replace(/\s+/g, "") : `+${t.replace(/[^\d]/g, "")}`;
};

/** E.164 for supplied values, null when the (optional) field was left blank. */
const optionalE164 = (v?: string) => {
  const t = (v || "").trim();
  return t ? toE164(t) : null;
};


const refereePhone = (label: string) =>
  z
    .string()
    .min(1, `${label} phone is required`)
    .max(20, "Phone too long")
    .refine((v) => {
      const p = parsePhoneNumberFromString(toE164(v));
      return !!p && p.isValid();
    }, `Enter ${label}'s phone with country code, e.g. +2348012345678`);

/**
 * Referee fields are conditionally required.
 *
 * `refereesRequired` is the admin switch (`driver_referee_requirement`): when
 * off, every referee field is optional and the section is hidden so drivers
 * register freely. `detailsRequired` additionally demands address/email —
 * see `refereeDetailsRequired()`.
 */
const buildDriverSchema = (detailsRequired: boolean, refereesRequired: boolean) => {
  const optionalText = (max: number) => z.string().max(max, "Too long").optional().or(z.literal(""));
  const refereeName = (label: string) =>
    refereesRequired
      ? z.string().min(2, `${label} name is required`).max(100, "Name too long")
      : optionalText(100);
  const refereePhoneField = (label: string) =>
    refereesRequired ? refereePhone(label) : optionalText(20);
  const refereeAddress = (label: string) =>
    detailsRequired && refereesRequired
      ? z.string().min(5, `${label} home address is required`).max(200, "Address too long")
      : optionalText(200);
  const refereeEmail = (label: string) =>
    detailsRequired && refereesRequired
      ? z.string().min(1, `${label} email is required`).email("Invalid email address").max(255)
      : z.string().email("Invalid email address").max(255).optional().or(z.literal(""));


  return z.object({
  firstName: z.string().min(2, "First name is required").max(50, "First name too long"),
  lastName: z.string().min(2, "Last name is required").max(50, "Last name too long"),
  email: z.string().email("Invalid email address").max(255, "Email too long"),
  // Password is optional when the visitor is already signed in.
  password: z.string().max(72, "Password too long").optional().or(z.literal("")),
  phoneCountry: z.enum(["us", "ng"]).optional(),
  phoneNumber: z
    .string()
    .refine((v) => {
      const p = parsePhoneNumberFromString(v || "");
      return !!p && p.isValid();
    }, "Enter a valid phone number with country code"),
  country: z.enum(["usa", "nigeria"]),
  city: z.string().min(1, "City is required"),
  streetAddress: requiredAddressSchema,
  zipCode: z.string().min(3, "ZIP/Postal code is required").max(10, "ZIP code too long"),
  rideshareApproval: z.array(z.string()).min(1, "Select at least one platform"),
  hasDriverLicense: z.boolean().refine(val => val, "Driver license is required"),
  // Referees — only mandatory while the admin keeps the referee requirement on.
  // Phones must be E.164; the DB enforces this with a trigger.
  referee1Name: refereeName("Referee 1"),
  referee1Phone: refereePhoneField("Referee 1"),
  referee1Address: refereeAddress("Referee 1"),
  referee1Email: refereeEmail("Referee 1"),
  // Referee 2
  referee2Name: refereeName("Referee 2"),
  referee2Phone: refereePhoneField("Referee 2"),
  referee2Address: refereeAddress("Referee 2"),
  referee2Email: refereeEmail("Referee 2"),
  // Referee 3
  referee3Name: refereeName("Referee 3"),
  referee3Phone: refereePhoneField("Referee 3"),
  referee3Address: refereeAddress("Referee 3"),
  referee3Email: refereeEmail("Referee 3"),


  // Security deposit acknowledgment
  securityDepositAcknowledged: z.boolean().refine(val => val, "You must acknowledge the security deposit requirement"),
  agreeTerms: z.boolean().refine(val => val, "You must agree to Terms of Service"),
  agreePrivacy: z.boolean().refine(val => val, "You must agree to Privacy Policy"),
  agreeIoT: z.boolean().refine(val => val, "You must consent to IoT tracking"),
  agreeFees: z.boolean().refine(val => val, "You must acknowledge the late payment and default policy"),
  messagingConsent: z.boolean().refine(val => val, "You must consent to receive service messages"),
  messagingChannel: z.string().refine((val) => ["sms", "whatsapp"].includes(val), "Select SMS or WhatsApp as your second channel"),
  dataSharingConsent: z.boolean().refine(val => val, "You must consent to third-party data sharing"),
  // Optional A2P 10DLC SMS opt-ins — never required.
  smsServiceConsent: z.boolean().optional().default(false),
  smsMarketingConsent: z.boolean().optional().default(false),

  });
};

type DriverFormData = z.infer<ReturnType<typeof buildDriverSchema>>;

const usaCities = [
  "Washington DC",
  "Maryland",
  "Virginia",
];

const nigeriaCities = [
  "Lagos",
  "Abuja",
  "Port Harcourt",
];

const ridesharePlatforms = [
  { id: "uber", label: "Uber" },
  { id: "lyft", label: "Lyft" },
  { id: "bolt", label: "Bolt" },
  { id: "indrive", label: "InDrive" },
];

const DriverRegistration = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const samples = useRegionSamples();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<FriendlyRegistrationError | null>(null);
  const [lastFormData, setLastFormData] = useState<DriverFormData | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  // When the user is already authenticated, hide identity fields (email +
  // password) and reuse the session so we don't create a duplicate account.
  const alreadySignedIn = !!user;

  // Referee address/email are only mandatory while the admin keeps identity
  // (Persona) gating switched on for an application type that needs vetting,
  // and referees themselves are only mandatory while the admin's referee
  // requirement switch is on.
  const { enabled: personaEnabled } = usePersonaEnabled();
  const { required: refereesRequired } = useRefereeRequirement();
  const refereeDetailsMandatory =
    refereesRequired && refereeDetailsRequired(personaEnabled, "driver");
  const driverSchema = useMemo(
    () => buildDriverSchema(refereeDetailsMandatory, refereesRequired),
    [refereeDetailsMandatory, refereesRequired],
  );


  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    control,
    formState: { errors, isSubmitting, touchedFields },
  } = useForm<DriverFormData>({
    resolver: zodResolver(driverSchema),
    // Validate as the user types so the address rules surface immediately
    // instead of only on submit.
    mode: "onChange",

    defaultValues: {
      country: "usa",
      rideshareApproval: [],
      hasDriverLicense: false,
      referee1Name: "",
      referee1Phone: "",
      referee1Address: "",
      referee1Email: "",
      referee2Name: "",
      referee2Phone: "",
      referee2Address: "",
      referee2Email: "",
      referee3Name: "",
      referee3Phone: "",
      referee3Address: "",
      referee3Email: "",

      securityDepositAcknowledged: false,
      agreeTerms: false,
      agreePrivacy: false,
      agreeIoT: false,
      agreeFees: false,
      messagingConsent: false,
      messagingChannel: "none",
      dataSharingConsent: false,
      smsServiceConsent: false,
      smsMarketingConsent: false,

    },
  });

  // Prefill from an existing session so returning drivers don't retype
  // their email/name/phone.
  useEffect(() => {
    if (!user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName = String(meta.full_name ?? '').trim();
    const [first, ...rest] = fullName.split(/\s+/);
    if (first) setValue('firstName', first);
    if (rest.length) setValue('lastName', rest.join(' '));
    if (user.email) setValue('email', user.email);
    // Best-effort phone prefill from profiles.
    (async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profile?.phone) setValue('phoneNumber', profile.phone);
    })();
  }, [user, setValue]);

  const selectedCountry = watch("country");
  const cities = selectedCountry === "usa" ? usaCities : nigeriaCities;

  // ---- Live home-address validation ---------------------------------------
  // Rules live in `@/lib/address-validation` so web and the Capacitor
  // iOS/Android shells stay in lockstep with the database triggers.
  const streetAddressValue = watch("streetAddress") ?? "";
  const addressTrimmed = streetAddressValue.trim();
  const addressLength = addressTrimmed.length;
  const addressTouched = Boolean(touchedFields.streetAddress) || addressLength > 0;

  const addressHint = buildAddressHint(streetAddressValue, {
    isDriver: true,
    touched: addressTouched,
  });



  const handlePlatformChange = (platformId: string, checked: boolean) => {
    const updated = checked
      ? [...selectedPlatforms, platformId]
      : selectedPlatforms.filter((p) => p !== platformId);
    setSelectedPlatforms(updated);
    setValue("rideshareApproval", updated);
  };

  const onSubmit = async (data: DriverFormData) => {
    setLastFormData(data);
    setSubmitError(null);
    try {
      // 1) Ensure an auth user exists for this applicant (shared helper).
      const userId = await ensureAuthUserForApplicant({
        email: data.email,
        password: data.password,
        fullName: `${data.firstName} ${data.lastName}`.trim(),
        requestedRole: 'driver',
      });

      const { error } = await supabase.from('applications').insert({
        user_id: userId,
        application_type: 'driver' as const,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone_country: data.phoneCountry ?? (parsePhoneNumberFromString(toE164(data.phoneNumber))?.country === 'NG' ? 'ng' : 'us'),
        phone_number: toE164(data.phoneNumber),
        country: data.country,
        city: data.city,
        zip_code: data.zipCode,
        street_address: data.streetAddress,
        region: data.country === 'usa' ? 'usa' : 'nigeria',
        rideshare_platforms: data.rideshareApproval,
        has_driver_license: data.hasDriverLicense,
        referee1_name: data.referee1Name || null,
        referee1_phone: optionalE164(data.referee1Phone),
        referee1_address: data.referee1Address || null,
        referee1_email: data.referee1Email || null,
        referee2_name: data.referee2Name || null,
        referee2_phone: optionalE164(data.referee2Phone),
        referee2_address: data.referee2Address || null,
        referee2_email: data.referee2Email || null,
        referee3_name: data.referee3Name || null,
        referee3_phone: optionalE164(data.referee3Phone),
        referee3_address: data.referee3Address || null,
        referee3_email: data.referee3Email || null,


        security_deposit_acknowledged: data.securityDepositAcknowledged,
        agreed_terms: data.agreeTerms,
        agreed_privacy: data.agreePrivacy,
        agreed_iot: data.agreeIoT,
        agreed_fees: data.agreeFees,
        messaging_consent: data.messagingConsent,
        messaging_channel: data.messagingChannel,
        data_sharing_consent: data.dataSharingConsent,
        consent_recorded_at: new Date().toISOString(),
      });

      if (error) throw error;

      // A2P 10DLC: persist the exact SMS opt-in decisions with disclosure text.
      void recordSmsConsentPair({
        phoneNumber: toE164(data.phoneNumber),
        serviceConsent: !!data.smsServiceConsent,
        marketingConsent: !!data.smsMarketingConsent,
        source: "driver-registration",
      });

      // Audit: registration data reached the database.
      void logRegistrationEvent("registration_upsert_succeeded", {
        email: data.email,
        applicationType: "driver",
        metadata: { country: data.country },
      });

      // Move new signup to 'account_opened' — grants view-only dashboard.
      try {
        await supabase.rpc('advance_registration_stage', { _target: 'account_opened' });
      } catch (e) {
        console.warn('Could not advance registration stage:', e);
      }

      toast.success("Account created! You now have view-only access. Complete verification to unlock full features.");
      setSubmitError(null);
      navigate("/driver/dashboard");
    } catch (error) {
      console.error("Driver registration error:", error);
      const friendly = classifyRegistrationError(error);
      void logRegistrationEvent("registration_upsert_failed", {
        email: data.email,
        applicationType: "driver",
        metadata: { reason: friendly.title, raw: friendly.raw.slice(0, 500) },
      });
      setSubmitError(friendly);
      toast.error(friendly.title);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleRetry = () => {
    if (!lastFormData) return;
    setIsRetrying(true);
    onSubmit(lastFormData);
  };


  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Become a Rideshare Driver — Rentmaikar Driver Signup"
        description="Register as a Rentmaikar driver to rent a rideshare-ready vehicle for Uber, Lyft or Bolt in the USA and Nigeria."
        path="/driver/register"
      />
      <Header />
      <PricingHintBanner />
      <main className="pt-8 pb-16">
        <div className="container mx-auto px-4 max-w-2xl">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-6 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="bg-card rounded-2xl p-8 shadow-card border border-border">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-accent" />
              </div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                Driver Registration
              </h1>
              <p className="text-muted-foreground mt-2">
                Join our network of rideshare drivers
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {submitError && (
                <RegistrationErrorAlert
                  error={submitError}
                  onRetry={handleRetry}
                  isRetrying={isRetrying}
                  signInReturnTo="/driver/register"
                />
              )}
              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <User className="w-5 h-5 text-accent" />
                  Personal Information
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder={samples.firstName}
                      autoComplete="given-name"
                      autoFocus
                      {...register("firstName")}
                    />
                    {errors.firstName && (
                      <p className="text-destructive text-sm">{errors.firstName.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder={samples.lastName}
                      autoComplete="family-name"
                      {...register("lastName")}
                    />
                    {errors.lastName && (
                      <p className="text-destructive text-sm">{errors.lastName.message}</p>
                    )}
                  </div>
                </div>

                {alreadySignedIn ? (
                  <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm">
                    <p className="font-medium text-foreground">Signed in as {user?.email}</p>
                    <p className="text-muted-foreground mt-1">
                      We'll link this application to your existing account, so you don't need
                      to re-enter your email or password.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder={samples.email}
                          className="pl-10"
                          autoComplete="email"
                          {...register("email")}
                        />
                      </div>
                      {errors.email && (
                        <p className="text-destructive text-sm">{errors.email.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <PasswordInput
                        id="password"
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                        {...register("password")}
                      />
                      <p className="text-xs text-muted-foreground">
                        You'll use this password to sign in to your driver dashboard after approval.
                      </p>
                      {errors.password && (
                        <p className="text-destructive text-sm">{errors.password.message}</p>
                      )}
                    </div>
                  </>
                )}


                <div className="space-y-2">
                  <Label htmlFor="driver-phone">Phone Number</Label>
                  <Controller
                    control={control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <PhoneNumberInput
                        id="driver-phone"
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          const parsed = parsePhoneNumberFromString(v || "");
                          if (parsed?.country === "NG") setValue("phoneCountry", "ng");
                          else if (parsed?.country === "US") setValue("phoneCountry", "us");
                        }}
                        aria-invalid={!!errors.phoneNumber}
                      />
                    )}
                  />
                  {errors.phoneNumber && (
                    <p className="text-destructive text-sm">{errors.phoneNumber.message}</p>
                  )}
                </div>
              </div>

              {/* Location */}
              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-accent" />
                  Location
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Select
                      defaultValue="usa"
                      onValueChange={(value) => setValue("country", value as "usa" | "nigeria")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="usa">🇺🇸 United States</SelectItem>
                        <SelectItem value="nigeria">🇳🇬 Nigeria</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Select onValueChange={(value) => setValue("city", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select city" />
                      </SelectTrigger>
                      <SelectContent>
                        {cities.map((city) => (
                          <SelectItem key={city} value={city}>
                            {city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.city && (
                      <p className="text-destructive text-sm">{errors.city.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="streetAddress">
                      Home Address <span className="text-destructive">*</span>
                    </Label>
                    <span
                      className={`text-xs tabular-nums ${
                        addressLength > ADDRESS_MAX || (addressTouched && addressLength < ADDRESS_MIN)
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                      aria-live="polite"
                    >
                      {addressLength}/{ADDRESS_MAX}
                    </span>
                  </div>
                  <Input
                    id="streetAddress"
                    placeholder={`e.g. ${samples.address}`}
                    aria-invalid={addressHint?.tone === "error" || !!errors.streetAddress}
                    aria-describedby="streetAddress-hint"
                    maxLength={ADDRESS_MAX + 50}
                    {...register("streetAddress", {
                      onChange: () => void trigger("streetAddress"),
                      onBlur: () => void trigger("streetAddress"),
                    })}
                  />
                  <p
                    id="streetAddress-hint"
                    aria-live="polite"
                    className={`text-sm ${
                      addressHint?.tone === "error"
                        ? "text-destructive"
                        : addressHint?.tone === "warn"
                        ? "text-amber-500"
                        : addressHint?.tone === "ok"
                        ? "text-emerald-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {addressHint?.msg ??
                      errors.streetAddress?.message ??
                      `Required for drivers — at least ${ADDRESS_MIN} characters.`}
                  </p>
                </div>


                <div className="space-y-2">
                  <Label htmlFor="zipCode">{samples.postalLabel}</Label>
                  <Input
                    id="zipCode"
                    placeholder={samples.postalCode}
                    {...register("zipCode")}
                  />
                  {errors.zipCode && (
                    <p className="text-destructive text-sm">{errors.zipCode.message}</p>
                  )}
                </div>

              </div>

              {/* Rideshare Platforms */}
              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Car className="w-5 h-5 text-accent" />
                  Rideshare Platform Approval
                </h3>
                <p className="text-sm text-muted-foreground">
                  Select the platforms you're approved to drive for
                </p>
                
                <div className="grid grid-cols-2 gap-3">
                  {ridesharePlatforms.map((platform) => (
                    <label
                      key={platform.id}
                      className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                        selectedPlatforms.includes(platform.id)
                          ? "border-accent bg-accent/5"
                          : "border-border hover:border-accent/50"
                      }`}
                    >
                      <Checkbox
                        checked={selectedPlatforms.includes(platform.id)}
                        onCheckedChange={(checked) =>
                          handlePlatformChange(platform.id, checked as boolean)
                        }
                      />
                      <span className="font-medium">{platform.label}</span>
                    </label>
                  ))}
                </div>
                {errors.rideshareApproval && (
                  <p className="text-destructive text-sm">{errors.rideshareApproval.message}</p>
                )}
              </div>

              {/* Referees Section — hidden while the admin keeps referees optional */}
              {refereesRequired && (
              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <User className="w-5 h-5 text-accent" />
                  Referees (3 Required)
                </h3>
                <p className="text-sm text-muted-foreground">
                  Please provide details for three referees who can vouch for your character.
                  Name and phone number are always required — home address and email are{" "}
                  {refereeDetailsMandatory ? "also required for identity verification" : "optional"}.

                </p>


                {[1, 2, 3].map((num) => (
                  <div key={num} className="p-4 rounded-lg border border-border space-y-3">
                    <h4 className="font-medium text-foreground">Referee {num}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor={`referee${num}Name`}>Full Name</Label>
                        <Input
                          id={`referee${num}Name`}
                          placeholder={samples.name}
                          {...register(`referee${num}Name` as keyof DriverFormData)}
                        />
                        {errors[`referee${num}Name` as keyof typeof errors] && (
                          <p className="text-destructive text-sm">
                            {errors[`referee${num}Name` as keyof typeof errors]?.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`referee${num}Phone`}>Phone Number</Label>
                        <Controller
                          control={control}
                          name={`referee${num}Phone` as keyof DriverFormData}
                          render={({ field }) => (
                            <PhoneNumberInput
                              id={`referee${num}Phone`}
                              
                              value={(field.value as string) || ""}
                              onChange={field.onChange}
                            />
                          )}
                        />
                        {errors[`referee${num}Phone` as keyof typeof errors] && (
                          <p className="text-destructive text-sm">
                            {errors[`referee${num}Phone` as keyof typeof errors]?.message}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor={`referee${num}Address`}>
                          Residential Address{" "}
                          {!refereeDetailsMandatory && (
                            <span className="text-muted-foreground">(optional)</span>
                          )}
                        </Label>
                        <Input
                          id={`referee${num}Address`}
                          placeholder={samples.address}
                          {...register(`referee${num}Address` as keyof DriverFormData)}
                        />
                        {errors[`referee${num}Address` as keyof typeof errors] && (
                          <p className="text-destructive text-sm">
                            {errors[`referee${num}Address` as keyof typeof errors]?.message}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`referee${num}Email`}>
                          Email{" "}
                          {!refereeDetailsMandatory && (
                            <span className="text-muted-foreground">(optional)</span>
                          )}
                        </Label>
                        <Input
                          id={`referee${num}Email`}
                          type="email"
                          placeholder={samples.email}
                          {...register(`referee${num}Email` as keyof DriverFormData)}
                        />
                        {errors[`referee${num}Email` as keyof typeof errors] && (
                          <p className="text-destructive text-sm">
                            {errors[`referee${num}Email` as keyof typeof errors]?.message}
                          </p>
                        )}
                      </div>
                    </div>

                  </div>
                ))}
              </div>
              )}


              {/* Requirements */}
              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <FileText className="w-5 h-5 text-accent" />
                  Requirements
                </h3>
                
                <label className="flex items-start gap-3 p-4 rounded-lg border border-border hover:border-accent/50 cursor-pointer">
                  <Checkbox
                    onCheckedChange={(checked) =>
                      setValue("hasDriverLicense", checked as boolean)
                    }
                  />
                  <div>
                    <span className="font-medium">I have a valid driver's license</span>
                    <p className="text-sm text-muted-foreground">
                      You'll need to upload a copy during verification
                    </p>
                  </div>
                </label>
                {errors.hasDriverLicense && (
                  <p className="text-destructive text-sm">{errors.hasDriverLicense.message}</p>
                )}

                {/* Security Deposit Acknowledgment */}
                <div className="p-4 rounded-lg border-2 border-warning/50 bg-warning/5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      onCheckedChange={(checked) =>
                        setValue("securityDepositAcknowledged", checked as boolean)
                      }
                    />
                    <div>
                      <span className="font-medium flex items-center gap-2">
                        <Shield className="w-4 h-4 text-warning" />
                        Security Deposit Required
                      </span>
                      <p className="text-sm text-muted-foreground mt-1">
                        I understand that a refundable security deposit of{" "}
                        <strong className="text-foreground">
                          {selectedCountry === "usa" ? "$200 USD" : "₦100,000 NGN"}
                        </strong>{" "}
                        is required before vehicle pickup.
                      </p>
                    </div>
                  </label>
                  {errors.securityDepositAcknowledged && (
                    <p className="text-destructive text-sm mt-2">
                      {errors.securityDepositAcknowledged.message}
                    </p>
                  )}
                </div>

                {selectedCountry === "nigeria" && (
                  <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 space-y-3">
                    <p className="text-sm font-medium text-warning flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      🇳🇬 Nigeria Driver Requirements
                    </p>
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p>• Police Clearance Certificate is <strong>required</strong></p>
                      <p>• Upload your police report during document verification (PDF, PNG, or JPG format accepted)</p>
                      <p>• Maximum file size: 10MB</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Terms & Policy Acceptance */}
              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Shield className="w-5 h-5 text-accent" />
                  Terms & Policy Acceptance
                </h3>
                
                {/* Terms of Service */}
                <div className="p-4 rounded-lg border border-border hover:border-accent/50">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      onCheckedChange={(checked) =>
                        setValue("agreeTerms", checked as boolean)
                      }
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Terms of Service
                        </span>
                        <a 
                          href="/terms" 
                          target="_blank" 
                          className="text-accent hover:underline text-sm flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        I have read and agree to the Terms of Service
                      </p>
                    </div>
                  </label>
                  {errors.agreeTerms && (
                    <p className="text-destructive text-sm mt-2">{errors.agreeTerms.message}</p>
                  )}
                </div>

                {/* Privacy Policy */}
                <div className="p-4 rounded-lg border border-border hover:border-accent/50">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      onCheckedChange={(checked) =>
                        setValue("agreePrivacy", checked as boolean)
                      }
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium flex items-center gap-2">
                          <Shield className="w-4 h-4" />
                          Privacy Policy
                        </span>
                        <a 
                          href="/privacy" 
                          target="_blank" 
                          className="text-accent hover:underline text-sm flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        I have read and agree to the Privacy Policy
                      </p>
                    </div>
                  </label>
                  {errors.agreePrivacy && (
                    <p className="text-destructive text-sm mt-2">{errors.agreePrivacy.message}</p>
                  )}
                </div>

                {/* IoT Consent */}
                <div className="p-4 rounded-lg border border-border hover:border-accent/50 bg-warning/5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      onCheckedChange={(checked) =>
                        setValue("agreeIoT", checked as boolean)
                      }
                    />
                    <div className="flex-1">
                      <span className="font-medium">IoT Tracking & Remote Deactivation Consent</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        I understand and consent to continuous GPS tracking of the vehicle and acknowledge 
                        that the vehicle may be remotely deactivated in cases of payment default, unauthorized use, or safety concerns.
                      </p>
                    </div>
                  </label>
                  {errors.agreeIoT && (
                    <p className="text-destructive text-sm mt-2">{errors.agreeIoT.message}</p>
                  )}
                </div>

                {/* Late Payment & Default Policy Consent */}
                <div className="p-4 rounded-lg border-2 border-destructive/30 bg-destructive/5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      onCheckedChange={(checked) =>
                        setValue("agreeFees", checked as boolean)
                      }
                    />
                    <div className="flex-1">
                      <span className="font-medium flex items-center gap-2">
                        <Shield className="w-4 h-4 text-destructive" />
                        Late Payment & Default Policy
                      </span>
                      <p className="text-sm text-muted-foreground mt-1">
                        I acknowledge and agree that a <strong className="text-foreground">10% administrative fine</strong> will 
                        be applied to any late payment or payment default. I also understand that payment defaults may result in 
                        a <strong className="text-foreground">mandatory downgrade to a daily payment plan</strong> with additional 
                        surcharges, and that repeated defaults may lead to permanent loss of daily payment plan eligibility and 
                        vehicle deactivation.
                      </p>
                    </div>
                  </label>
                  {errors.agreeFees && (
                    <p className="text-destructive text-sm mt-2">{errors.agreeFees.message}</p>
                  )}
                </div>

                {/* Messaging + third-party data sharing consent */}
                <ConsentSection
                  messagingConsent={!!watch("messagingConsent")}
                  messagingChannel={(watch("messagingChannel") as MessagingChannel) ?? "none"}
                  dataSharingConsent={!!watch("dataSharingConsent")}
                  onMessagingConsentChange={(v) => setValue("messagingConsent", v, { shouldValidate: true })}
                  onMessagingChannelChange={(v) => setValue("messagingChannel", v, { shouldValidate: true })}
                  onDataSharingConsentChange={(v) => setValue("dataSharingConsent", v, { shouldValidate: true })}
                  messagingError={errors.messagingConsent?.message as string | undefined}
                  channelError={errors.messagingChannel?.message as string | undefined}
                  dataSharingError={errors.dataSharingConsent?.message as string | undefined}
                  smsServiceConsent={!!watch("smsServiceConsent")}
                  smsMarketingConsent={!!watch("smsMarketingConsent")}
                  onSmsServiceConsentChange={(v) => setValue("smsServiceConsent", v)}
                  onSmsMarketingConsentChange={(v) => setValue("smsMarketingConsent", v)}
                />
              </div>

              <Button
                type="submit"
                variant="hero"
                size="xl"
                className="w-full gap-2"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  "Submitting..."
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Submit Registration
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DriverRegistration;
