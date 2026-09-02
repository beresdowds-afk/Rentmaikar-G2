/**
 * Region-driven SMS and email template renderer.
 *
 * All messaging that is region-specific MUST render its final copy through this
 * module so currency, providers, copy, and phone prefixes always come from the
 * RegionContext (or an equivalent region_definitions row on the server side)
 * rather than being hardcoded per template.
 */

export interface RegionTemplateConfig {
  country: string;              // "USA" | "Nigeria" | (string & {}) | "Ghana" | "Global" | ...
  currency: string;             // "USD" | "NGN" | (string & {}) | "GHS"
  currencySymbol: string;       // "$" | "₦" | "₵"
  phonePrefix: string;          // "+1" | "+234"
  smsProvider: "sent" | "twilio" | "termii" | string;
  whatsappProvider: "sent" | "twilio" | "termii" | string;
  rcsProvider?: "sent" | string;
  paymentGateway: string;       // "paypal" | "paystack" | ...
  supportHours?: string;        // "9am-9pm ET"
  whatsappNumber?: string;
  smsNumber?: string;
}

export type TemplateKind =
  | "payment_reminder"
  | "payment_default"
  | "welcome_sms"
  | "welcome_email"
  | "password_reset"
  | "inspection_reminder"
  | "vehicle_shutdown_warning";

export interface RenderedTemplate {
  channel: "sms" | "email";
  subject?: string;
  body: string;
  provider: string;
  from?: string;
}

const money = (cfg: RegionTemplateConfig, amount: number) =>
  `${cfg.currencySymbol}${amount.toLocaleString(undefined, {
    minimumFractionDigits: cfg.currency === "NGN" ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

const formatPhone = (cfg: RegionTemplateConfig, local: string) => {
  const digits = local.replace(/[^0-9]/g, "");
  return `${cfg.phonePrefix}${digits}`;
};

export const renderTemplate = (
  kind: TemplateKind,
  cfg: RegionTemplateConfig,
  vars: Record<string, string | number> = {}
): RenderedTemplate => {
  const support = cfg.supportHours ?? "business hours";
  const amount = typeof vars.amount === "number" ? money(cfg, vars.amount) : "";
  const name = String(vars.name ?? "there");

  switch (kind) {
    case "payment_reminder":
      return {
        channel: "sms",
        provider: cfg.smsProvider,
        from: cfg.smsNumber,
        body:
          `Hi ${name}, your rental payment of ${amount} is due soon. ` +
          `Pay via ${cfg.paymentGateway}. Support ${support}. Reply HELP.`,
      };
    case "payment_default":
      return {
        channel: "sms",
        provider: cfg.smsProvider,
        from: cfg.smsNumber,
        body:
          `Rentmaikar: Payment of ${amount} is overdue for ${cfg.country}. ` +
          `Vehicle may be immobilized. Call ${cfg.phonePrefix}${vars.helpline ?? ""} now.`,
      };
    case "welcome_sms":
      return {
        channel: "sms",
        provider: cfg.smsProvider,
        from: cfg.smsNumber,
        body:
          `Welcome to Rentmaikar ${cfg.country}! Login and set your password. ` +
          `Support: ${support}. Contact ${cfg.phonePrefix}${vars.helpline ?? ""}.`,
      };
    case "welcome_email":
      return {
        channel: "email",
        provider: "resend",
        subject: `Welcome to Rentmaikar ${cfg.country}`,
        body:
          `Hi ${name},\n\nWelcome to Rentmaikar in ${cfg.country}. ` +
          `Payments are processed in ${cfg.currency} (${cfg.currencySymbol}) via ${cfg.paymentGateway}. ` +
          `Reach us during ${support}.\n\n— Rentmaikar`,
      };
    case "password_reset":
      return {
        channel: "email",
        provider: "resend",
        subject: `Reset your Rentmaikar password`,
        body:
          `Hi ${name}, use the link to reset your password. ` +
          `For ${cfg.country} support (${support}) call ${formatPhone(cfg, String(vars.helpline ?? "0000000000"))}.`,
      };
    case "inspection_reminder":
      return {
        channel: "sms",
        provider: cfg.smsProvider,
        from: cfg.smsNumber,
        body:
          `Weekly inspection due for your vehicle in ${cfg.country}. ` +
          `Upload 10 photos in the app. Support ${support}.`,
      };
    case "vehicle_shutdown_warning":
      return {
        channel: "sms",
        provider: cfg.smsProvider,
        from: cfg.smsNumber,
        body:
          `Rentmaikar warning: outstanding balance ${amount}. ` +
          `Vehicle will be immobilized if not settled via ${cfg.paymentGateway}.`,
      };
  }
};

/**
 * Runtime audit helper: verifies a rendered template pulls every region token
 * from the provided config (and not from a different region's values).
 */
export const auditTemplate = (
  rendered: RenderedTemplate,
  cfg: RegionTemplateConfig
): string[] => {
  const issues: string[] = [];
  if (rendered.channel === "sms" && rendered.provider !== cfg.smsProvider) {
    issues.push(`sms provider ${rendered.provider} !== ${cfg.smsProvider}`);
  }
  // Currency symbol must appear whenever the body mentions money.
  if (/\d/.test(rendered.body) && rendered.body.includes("$") && cfg.currencySymbol !== "$") {
    issues.push(`hardcoded $ in body for ${cfg.currency}`);
  }
  if (/\d/.test(rendered.body) && rendered.body.includes("₦") && cfg.currencySymbol !== "₦") {
    issues.push(`hardcoded ₦ in body for ${cfg.currency}`);
  }
  if (rendered.body.includes("+1 ") && cfg.phonePrefix !== "+1") {
    issues.push(`hardcoded +1 in body for ${cfg.country}`);
  }
  if (rendered.body.includes("+234") && cfg.phonePrefix !== "+234") {
    issues.push(`hardcoded +234 in body for ${cfg.country}`);
  }
  return issues;
};

export const REGION_FIXTURES: Record<string, RegionTemplateConfig> = {
  Global: {
    country: "Global",
    currency: "USD",
    currencySymbol: "$",
    phonePrefix: "+1",
    smsProvider: "sent",
    whatsappProvider: "sent",
    rcsProvider: "sent",
    paymentGateway: "stripe",
    supportHours: "24/7 Global",
  },
  USA: {
    country: "USA",
    currency: "USD",
    currencySymbol: "$",
    phonePrefix: "+1",
    smsProvider: "sent",
    whatsappProvider: "sent",
    paymentGateway: "paypal",
    supportHours: "9am-9pm ET",
  },
  Nigeria: {
    country: "Nigeria",
    currency: "NGN",
    currencySymbol: "₦",
    phonePrefix: "+234",
    smsProvider: "termii",
    whatsappProvider: "sent",
    paymentGateway: "opay",
    supportHours: "8am-8pm WAT",
  },
  Ghana: {
    country: "Ghana",
    currency: "GHS",
    currencySymbol: "₵",
    phonePrefix: "+233",
    smsProvider: "sent",
    whatsappProvider: "sent",
    paymentGateway: "flutterwave",
    supportHours: "8am-8pm GMT",
  },
};
