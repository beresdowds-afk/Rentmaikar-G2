import Seo from "@/components/seo/Seo";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { Building, Mail, Phone, MapPin, Car, Calendar, Check, ArrowLeft, Upload, ExternalLink, FileText, Shield } from "lucide-react";
import { PhoneNumberInput } from "@/components/ui/phone-number-input";
import { CurrencyIcon } from "@/components/ui/Currencyicon";
import { useRegion } from "@/contexts/RegionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import ConsentSection, { type MessagingChannel } from "@/components/registration/ConsentSection";
import { recordSmsConsentPair } from "@/lib/sms-consent";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PricingHintBanner from "@/components/home/PricingHintBanner";
import { supabase } from "@/integrations/supabase/client";
import { ensureAuthUserForApplicant } from "@/lib/user-provisioning";
import { classifyRegistrationError, type FriendlyRegistrationError } from "@/lib/registration-errors";
import { logRegistrationEvent } from "@/lib/registration-audit";
import { RegistrationErrorAlert } from "@/components/registration/RegistrationErrorAlert";
import { useCategoryYearSpecs } from "@/hooks/useCategoryYearSpecs";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuth } from "@/contexts/AuthContext";
import { useRegionSamples } from "@/hooks/useRegionSamples";
import {
  ADDRESS_MAX,
  addressHint as buildAddressHint,
  optionalAddressSchema,
} from "@/lib/address-validation";

const createOwnerSchema = (country: "usa" | "nigeria") => z.object({
  // Owner Details
  firstName: z.string().min(2, "First name is required").max(50, "First name too long"),
  lastName: z.string().min(2, "Last name is required").max(50, "Last name too long"),
  email: z.string().email("Invalid email address").max(255, "Email too long"),
  password: z.string().max(72, "Password too long").optional().or(z.literal("")),
  phoneCountry: z.enum(["us", "ng"]).optional(),
  phoneNumber: z
    .string()
    .refine((v) => {
      const p = parsePhoneNumberFromString(v || "");
      return !!p && p.isValid();
    }, "Enter a valid phone number with country code"),
  
  // Location
  country: z.enum(["usa", "nigeria"]),
  city: z.string().min(1, "City is required"),
  zipCode: z.string().min(3, "ZIP/Postal code is required").max(10, "ZIP code too long"),
  streetAddress: optionalAddressSchema,
  
  // Vehicle Details
  vehicleMake: z.string().min(1, "Vehicle make is required"),
  vehicleModel: z.string().min(1, "Vehicle model is required").max(50, "Model name too long"),
  vehicleYear: z.string().min(4, "Vehicle year is required"),
  vehicleColor: z.string().min(1, "Vehicle color is required").max(30, "Color name too long"),
  vehiclePlate: country === "usa" 
    ? z.string().min(1, "VIN is required").max(17, "VIN too long")
    : z.string().min(1, "License plate is required").max(15, "License plate too long"),
  desiredPrice: z.string().min(1, "Desired weekly price is required"),
  vehicleDescription: z.string().max(500, "Description too long").optional(),
  
  // Confirmations
  hasRegistration: z.boolean().refine(val => val, "Vehicle registration is required"),
  hasInsurance: z.boolean().refine(val => val, "Insurance is required"),
  hasInspectionCertificate: country === "usa" 
    ? z.boolean().refine(val => val, "Vehicle inspection certificate is required for USA")
    : z.boolean().optional(),
  // Nigeria-specific
  hasRoadWorthiness: country === "nigeria"
    ? z.boolean().refine(val => val, "Road worthiness certificate is required for Nigeria")
    : z.boolean().optional(),
  hasProofOfOwnership: country === "nigeria"
    ? z.boolean().refine(val => val, "Proof of ownership is required for Nigeria")
    : z.boolean().optional(),
  hasSafetyEquipment: country === "nigeria"
    ? z.boolean().refine(val => val, "You must affirm provision of required safety equipment")
    : z.boolean().optional(),
  agreeTerms: z.boolean().refine(val => val, "You must agree to Terms of Service"),
  agreePrivacy: z.boolean().refine(val => val, "You must agree to Privacy Policy"),
  agreeIoT: z.boolean().refine(val => val, "You must consent to IoT tracking"),
  agreeFees: z.boolean().refine(val => val, "You must acknowledge platform fees"),
  messagingConsent: z.boolean().refine(val => val, "You must consent to receive service messages"),
  messagingChannel: z.string().refine((val) => ["sms", "whatsapp"].includes(val), "Select SMS or WhatsApp as your second channel"),
  dataSharingConsent: z.boolean().refine(val => val, "You must consent to third-party data sharing"),
  // Optional A2P 10DLC SMS opt-ins — never required.
  smsServiceConsent: z.boolean().optional().default(false),
  smsMarketingConsent: z.boolean().optional().default(false),
});

const ownerSchema = createOwnerSchema("usa");

type OwnerFormData = z.infer<typeof ownerSchema>;

const usaCities = ["Washington DC", "Maryland", "Virginia"];
const nigeriaCities = ["Lagos", "Abuja", "Port Harcourt"];

const carMakes = [
  "Toyota", "Honda", "Nissan", "Hyundai", "Kia", "Chevrolet", 
  "Ford", "Mazda", "Volkswagen", "Mercedes-Benz", "BMW", "Lexus"
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 11 }, (_, i) => (currentYear - 10 + i).toString());

const OwnerRegistration = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const samples = useRegionSamples();
  const { currencySymbol } = useRegion();
  const [currentCountry, setCurrentCountry] = useState<"usa" | "nigeria">("usa");
  const [submitError, setSubmitError] = useState<FriendlyRegistrationError | null>(null);
  const [lastFormData, setLastFormData] = useState<OwnerFormData | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const alreadySignedIn = !!user;
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting, touchedFields },
  } = useForm<OwnerFormData>({
    resolver: zodResolver(createOwnerSchema(currentCountry)),
    defaultValues: {
      country: "usa",
      hasRegistration: false,
      hasInsurance: false,
      hasInspectionCertificate: false,
      hasRoadWorthiness: false,
      hasProofOfOwnership: false,
      hasSafetyEquipment: false,
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

  // Prefill from existing session so signed-in owners don't retype identity.
  useEffect(() => {
    if (!user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName = String(meta.full_name ?? '').trim();
    const [first, ...rest] = fullName.split(/\s+/);
    if (first) setValue('firstName', first);
    if (rest.length) setValue('lastName', rest.join(' '));
    if (user.email) setValue('email', user.email);
    (async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profile?.phone) setValue('phoneNumber', profile.phone);
    })();
  }, [user, setValue]);

  // Live (optional) address feedback — same shared rules as the driver form.
  const ownerAddressValue = watch("streetAddress") ?? "";
  const ownerAddressLength = ownerAddressValue.trim().length;
  const ownerAddressHint = buildAddressHint(ownerAddressValue, {
    isDriver: false,
    touched: Boolean(touchedFields.streetAddress) || ownerAddressLength > 0,
  });

  const selectedCountry = watch("country");
  const selectedYear = watch("vehicleYear");
  const cities = selectedCountry === "usa" ? usaCities : nigeriaCities;

  // Calculate suggested price based on year (uses editable year specs)
  const yearSpecsRegion = selectedCountry === "usa" ? "USA" : "Nigeria";
  const { specs: yearSpecs } = useCategoryYearSpecs(yearSpecsRegion);
  const getSuggestedPrice = () => {
    if (!selectedYear) return null;
    const year = parseInt(selectedYear);
    const sym = selectedCountry === "nigeria" ? "₦" : "$";
    const priceByCategory: Record<string, string> = selectedCountry === "nigeria"
      ? {
          premium: `${sym}93,000/week (Premium)`,
          standard: `${sym}73,000/week (Standard)`,
          budget: `${sym}60,000/week (Budget)`,
        }
      : {
          premium: `${sym}350/week (Premium)`,
          standard: `${sym}300/week (Standard)`,
          budget: `${sym}250/week (Budget)`,
        };
    const match = [...yearSpecs]
      .sort((a, b) => b.sort_order - a.sort_order)
      .find((s) => year >= s.min_year && year <= s.max_year);
    if (match) {
      return priceByCategory[match.category] ??
        `${match.label} tier (${match.min_year}-${match.max_year})`;
    }
    // Legacy fallback
    if (year >= 2021) return priceByCategory.premium;
    if (year >= 2017) return priceByCategory.standard;
    return priceByCategory.budget;
  };

  const onSubmit = async (data: OwnerFormData) => {
    setLastFormData(data);
    setSubmitError(null);
    try {
      // 1) Ensure an auth user exists for this applicant (shared helper).
      const userId = await ensureAuthUserForApplicant({
        email: data.email,
        password: data.password,
        fullName: `${data.firstName} ${data.lastName}`.trim(),
        requestedRole: 'owner',
      });

      const { error } = await supabase.from('applications').insert({
        user_id: userId,
        application_type: 'owner' as const,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email,
        phone_country: data.phoneCountry ?? (parsePhoneNumberFromString(data.phoneNumber)?.country === 'NG' ? 'ng' : 'us'),
        phone_number: data.phoneNumber,
        country: data.country,
        city: data.city,
        zip_code: data.zipCode,
        street_address: data.streetAddress || null,
        region: data.country === 'usa' ? 'usa' : 'nigeria',
        vehicle_make: data.vehicleMake,
        vehicle_model: data.vehicleModel,
        vehicle_year: parseInt(data.vehicleYear),
        vehicle_color: data.vehicleColor,
        vehicle_plate: data.vehiclePlate,
        desired_weekly_price: parseFloat(data.desiredPrice),
        vehicle_description: data.vehicleDescription || null,
        has_registration: data.hasRegistration,
        has_insurance: data.hasInsurance,
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
        phoneNumber: data.phoneNumber,
        serviceConsent: !!data.smsServiceConsent,
        marketingConsent: !!data.smsMarketingConsent,
        source: "owner-registration",
      });

      // Audit: registration data reached the database.
      void logRegistrationEvent("registration_upsert_succeeded", {
        email: data.email,
        applicationType: "owner",
        metadata: { country: data.country },
      });

      try {
        await supabase.rpc('advance_registration_stage', { _target: 'account_opened' });
      } catch (e) {
        console.warn('Could not advance registration stage:', e);
      }

      toast.success("Account created! You now have view-only access. Complete verification to unlock full features.");
      setSubmitError(null);
      navigate("/owner/dashboard");
    } catch (error) {
      console.error("Owner registration error:", error);
      const friendly = classifyRegistrationError(error);
      void logRegistrationEvent("registration_upsert_failed", {
        email: data.email,
        applicationType: "owner",
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
        title="List Your Car — Rentmaikar Vehicle Owner Signup"
        description="Register your vehicle with Rentmaikar to earn passive income from vetted rideshare drivers in the USA and Nigeria."
        path="/owner/register"
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
                <Building className="w-8 h-8 text-accent" />
              </div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                List Your Vehicle
              </h1>
              <p className="text-muted-foreground mt-2">
                Earn passive income by renting your car to verified rideshare drivers
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {submitError && (
                <RegistrationErrorAlert
                  error={submitError}
                  onRetry={handleRetry}
                  isRetrying={isRetrying}
                  signInReturnTo="/owner/register"
                />
              )}
              {/* Owner Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Building className="w-5 h-5 text-accent" />
                  Owner Information
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" placeholder={samples.firstName} autoComplete="given-name" autoFocus {...register("firstName")} />
                    {errors.firstName && (
                      <p className="text-destructive text-sm">{errors.firstName.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" placeholder={samples.lastName} autoComplete="family-name" {...register("lastName")} />
                    {errors.lastName && (
                      <p className="text-destructive text-sm">{errors.lastName.message}</p>
                    )}
                  </div>
                </div>

                {alreadySignedIn ? (
                  <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm">
                    <p className="font-medium text-foreground">Signed in as {user?.email}</p>
                    <p className="text-muted-foreground mt-1">
                      We'll link this listing to your existing account, so you don't need
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
                        You'll use this password to sign in to your owner dashboard after approval.
                      </p>
                      {errors.password && (
                        <p className="text-destructive text-sm">{errors.password.message}</p>
                      )}
                    </div>
                  </>
                )}


                <div className="space-y-2">
                  <Label htmlFor="owner-phone">Phone Number</Label>
                  <Controller
                    control={control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <PhoneNumberInput
                        id="owner-phone"
                        defaultCountry={currentCountry === 'nigeria' ? 'NG' : currentCountry === 'usa' ? 'US' : undefined}
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
                      onValueChange={(value) => {
                        const country = value as "usa" | "nigeria";
                        setValue("country", country);
                        setCurrentCountry(country);
                      }}
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
                      Address <span className="text-xs text-muted-foreground">(optional)</span>
                    </Label>
                    <span
                      className={`text-xs tabular-nums ${
                        ownerAddressLength > ADDRESS_MAX ? "text-destructive" : "text-muted-foreground"
                      }`}
                      aria-live="polite"
                    >
                      {ownerAddressLength}/{ADDRESS_MAX}
                    </span>
                  </div>
                  <Input
                    id="streetAddress"
                    placeholder={samples.address}
                    maxLength={ADDRESS_MAX + 50}
                    aria-invalid={ownerAddressHint?.tone === "error" || !!errors.streetAddress}
                    aria-describedby="streetAddress-hint"
                    {...register("streetAddress")}
                  />
                  <p
                    id="streetAddress-hint"
                    aria-live="polite"
                    className={`text-sm ${
                      ownerAddressHint?.tone === "error"
                        ? "text-destructive"
                        : ownerAddressHint?.tone === "warn"
                        ? "text-amber-500"
                        : ownerAddressHint?.tone === "ok"
                        ? "text-emerald-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {ownerAddressHint?.msg ?? "Optional for owners — add it to speed up handover."}
                  </p>
                  {errors.streetAddress && (
                    <p className="text-destructive text-sm">{errors.streetAddress.message}</p>
                  )}
                </div>


                <div className="space-y-2">
                  <Label htmlFor="zipCode">{samples.postalLabel}</Label>
                  <Input id="zipCode" placeholder={samples.postalCode} {...register("zipCode")} />
                  {errors.zipCode && (
                    <p className="text-destructive text-sm">{errors.zipCode.message}</p>
                  )}
                </div>

              </div>

              {/* Vehicle Details */}
              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Car className="w-5 h-5 text-accent" />
                  Vehicle Details
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Make</Label>
                    <Select onValueChange={(value) => setValue("vehicleMake", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select make" />
                      </SelectTrigger>
                      <SelectContent>
                        {carMakes.map((make) => (
                          <SelectItem key={make} value={make}>
                            {make}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.vehicleMake && (
                      <p className="text-destructive text-sm">{errors.vehicleMake.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicleModel">Model</Label>
                    <Input id="vehicleModel" placeholder="Camry" {...register("vehicleModel")} />
                    {errors.vehicleModel && (
                      <p className="text-destructive text-sm">{errors.vehicleModel.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Select onValueChange={(value) => setValue("vehicleYear", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {years.reverse().map((year) => (
                          <SelectItem key={year} value={year}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.vehicleYear && (
                      <p className="text-destructive text-sm">{errors.vehicleYear.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicleColor">Color</Label>
                    <Input id="vehicleColor" placeholder="Silver" {...register("vehicleColor")} />
                    {errors.vehicleColor && (
                      <p className="text-destructive text-sm">{errors.vehicleColor.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehiclePlate">
                      {selectedCountry === "usa" ? "Vehicle Identification Number (VIN)" : "License Plate"}
                    </Label>
                    <Input 
                      id="vehiclePlate" 
                      placeholder={selectedCountry === "usa" ? "1HGBH41JXMN109186" : "ABC-1234"} 
                      {...register("vehiclePlate")} 
                    />
                    {errors.vehiclePlate && (
                      <p className="text-destructive text-sm">{errors.vehiclePlate.message}</p>
                    )}
                  </div>
                </div>

                {selectedYear && (
                  <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
                    <p className="text-sm font-medium text-accent flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Suggested price: {getSuggestedPrice()}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="desiredPrice">Desired Weekly Price ({currencySymbol})</Label>
                  <div className="relative">
                    <CurrencyIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="desiredPrice"
                      type="number"
                      placeholder="300"
                      className="pl-10"
                      {...register("desiredPrice")}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Final price is set by admin based on market rates and vehicle condition
                  </p>
                  {errors.desiredPrice && (
                    <p className="text-destructive text-sm">{errors.desiredPrice.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vehicleDescription">Description (Optional)</Label>
                  <Textarea
                    id="vehicleDescription"
                    placeholder="Tell us about your vehicle's features, condition, etc."
                    rows={3}
                    {...register("vehicleDescription")}
                  />
                </div>
              </div>

              {/* Documents */}
              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Upload className="w-5 h-5 text-accent" />
                  Documents & Confirmations
                </h3>
                
                <label className="flex items-start gap-3 p-4 rounded-lg border border-border hover:border-accent/50 cursor-pointer">
                  <Checkbox
                    onCheckedChange={(checked) =>
                      setValue("hasRegistration", checked as boolean)
                    }
                  />
                  <div>
                    <span className="font-medium">Valid Vehicle Registration</span>
                    <p className="text-sm text-muted-foreground">
                      You have current registration documents ready to upload
                    </p>
                  </div>
                </label>
                {errors.hasRegistration && (
                  <p className="text-destructive text-sm">{errors.hasRegistration.message}</p>
                )}

                <label className="flex items-start gap-3 p-4 rounded-lg border border-border hover:border-accent/50 cursor-pointer">
                  <Checkbox
                    onCheckedChange={(checked) =>
                      setValue("hasInsurance", checked as boolean)
                    }
                  />
                  <div>
                    <span className="font-medium">Valid Insurance with Rideshare Coverage</span>
                    <p className="text-sm text-muted-foreground">
                      Your insurance includes rideshare endorsement
                    </p>
                  </div>
                </label>
                {errors.hasInsurance && (
                  <p className="text-destructive text-sm">{errors.hasInsurance.message}</p>
                )}

                {/* Vehicle Inspection Certificate - USA Only */}
                {selectedCountry === "usa" && (
                  <>
                    <label className="flex items-start gap-3 p-4 rounded-lg border border-accent/30 bg-accent/5 hover:border-accent/50 cursor-pointer">
                      <Checkbox
                        onCheckedChange={(checked) =>
                          setValue("hasInspectionCertificate", checked as boolean)
                        }
                      />
                      <div>
                        <span className="font-medium flex items-center gap-2">
                          <FileText className="w-4 h-4 text-accent" />
                          Current Vehicle Inspection Certificate
                        </span>
                        <p className="text-sm text-muted-foreground">
                          You have a valid state vehicle inspection certificate (required for USA)
                        </p>
                      </div>
                    </label>
                    {errors.hasInspectionCertificate && (
                      <p className="text-destructive text-sm">{errors.hasInspectionCertificate.message}</p>
                    )}
                  </>
                )}

                {/* Nigeria-Specific Requirements */}
                {selectedCountry === "nigeria" && (
                  <>
                    <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
                      <p className="text-sm font-medium text-warning flex items-center gap-2 mb-3">
                        <Shield className="w-4 h-4" />
                        🇳🇬 Nigeria Owner Requirements
                      </p>
                    </div>

                    <label className="flex items-start gap-3 p-4 rounded-lg border border-warning/30 bg-warning/5 hover:border-warning/50 cursor-pointer">
                      <Checkbox
                        onCheckedChange={(checked) =>
                          setValue("hasRoadWorthiness", checked as boolean)
                        }
                      />
                      <div>
                        <span className="font-medium flex items-center gap-2">
                          <FileText className="w-4 h-4 text-warning" />
                          Road Worthiness Certificate
                        </span>
                        <p className="text-sm text-muted-foreground">
                          You have a valid road worthiness certificate for your vehicle (required for Nigeria)
                        </p>
                      </div>
                    </label>
                    {errors.hasRoadWorthiness && (
                      <p className="text-destructive text-sm">{errors.hasRoadWorthiness.message}</p>
                    )}

                    <label className="flex items-start gap-3 p-4 rounded-lg border border-warning/30 bg-warning/5 hover:border-warning/50 cursor-pointer">
                      <Checkbox
                        onCheckedChange={(checked) =>
                          setValue("hasProofOfOwnership", checked as boolean)
                        }
                      />
                      <div>
                        <span className="font-medium flex items-center gap-2">
                          <FileText className="w-4 h-4 text-warning" />
                          Proof of Ownership
                        </span>
                        <p className="text-sm text-muted-foreground">
                          You have valid proof of vehicle ownership documentation ready for upload
                        </p>
                      </div>
                    </label>
                    {errors.hasProofOfOwnership && (
                      <p className="text-destructive text-sm">{errors.hasProofOfOwnership.message}</p>
                    )}

                    <div className="p-4 rounded-lg border-2 border-warning/50 bg-warning/5">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <Checkbox
                          onCheckedChange={(checked) =>
                            setValue("hasSafetyEquipment", checked as boolean)
                          }
                        />
                        <div>
                          <span className="font-medium flex items-center gap-2">
                            <Shield className="w-4 h-4 text-warning" />
                            Safety Equipment Affirmation
                          </span>
                          <p className="text-sm text-muted-foreground mt-1">
                            I affirm that my vehicle is equipped with or I will provide the following mandatory safety items:
                          </p>
                          <ul className="text-sm text-muted-foreground mt-2 space-y-1 ml-4 list-disc">
                            <li><strong className="text-foreground">C-Caution Sign</strong> (reflective warning triangle)</li>
                            <li><strong className="text-foreground">Fire Extinguisher</strong> (valid and not expired)</li>
                            <li><strong className="text-foreground">Jack</strong> (functional vehicle jack)</li>
                            <li><strong className="text-foreground">Extra/Spare Tyre</strong> (in good condition)</li>
                          </ul>
                        </div>
                      </label>
                      {errors.hasSafetyEquipment && (
                        <p className="text-destructive text-sm mt-2">{errors.hasSafetyEquipment.message}</p>
                      )}
                    </div>
                  </>
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
                <div className="p-4 rounded-lg border border-border hover:border-accent/50 bg-accent/5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      onCheckedChange={(checked) =>
                        setValue("agreeIoT", checked as boolean)
                      }
                    />
                    <div className="flex-1">
                      <span className="font-medium">IoT Tracking Device Requirement</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        I agree to install Rentmaikar IoT tracking devices on my vehicle(s) and understand that 
                        this enables real-time GPS tracking, accident detection, and remote deactivation capabilities.
                      </p>
                    </div>
                  </label>
                  {errors.agreeIoT && (
                    <p className="text-destructive text-sm mt-2">{errors.agreeIoT.message}</p>
                  )}
                </div>

                {/* Platform Fees */}
                <div className="p-4 rounded-lg border border-border hover:border-accent/50 bg-primary/5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      onCheckedChange={(checked) =>
                        setValue("agreeFees", checked as boolean)
                      }
                    />
                    <div className="flex-1">
                      <span className="font-medium">Platform Fee Acknowledgement</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        I acknowledge and agree to the 20% management fee deducted from all rental earnings 
                        before payout to my account.
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
                    Submit Vehicle for Review
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

export default OwnerRegistration;
