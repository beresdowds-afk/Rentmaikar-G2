// Shared SMS configuration for Rentmaikar edge functions
// Region-specific numbers, rate limits, and message handling

export interface RegionSMSConfig {
  main: string;
  support: string;
  emergency: string;
  shortCode: string | null;
  provider: "twilio" | "termii";
  senderId: string;
  messagingServiceSid: string | null;
  rateLimit: number; // messages per second
}

export interface SMSConfig {
  regions: Record<string, RegionSMSConfig>;
  maxLength: {
    standard: number;
    concatenated: number; // max 10 segments
  };
  globalRateLimit: number;
}

// ─── Region-specific phone numbers & provider config ───
export const smsConfig: SMSConfig = {
  regions: {
    USA: {
      main: "+16083843932",
      support: "+16083843932",
      emergency: "+16083843932",
      shortCode: null, // Apply when approved
      provider: "twilio",
      senderId: "+16083843932",
      messagingServiceSid: Deno.env.get("TWILIO_MS_USA") || null,
      rateLimit: 10,
    },
    NIGERIA: {
      main: "+2348123456789",
      support: "+2348123456790",
      emergency: "+2348123456791",
      shortCode: null, // Apply when approved
      provider: "termii",
      senderId: Deno.env.get("TERMII_SENDER_ID") || "Rentmaikar",
      messagingServiceSid: Deno.env.get("TWILIO_MS_NG") || null,
      rateLimit: 5,
    },
  },
  maxLength: {
    standard: 160,
    concatenated: 1530, // 10 SMS segments
  },
  globalRateLimit: 100,
};

// ─── Get config for a phone number ───
export const getRegionConfig = (phone: string): RegionSMSConfig => {
  if (phone.startsWith("+234") || phone.startsWith("234")) {
    return smsConfig.regions.NIGERIA;
  }
  return smsConfig.regions.USA;
};

// ─── Get the correct "From" number based on message type ───
export type SMSNumberType = "main" | "support" | "emergency";

export const getFromNumber = (phone: string, numberType: SMSNumberType = "main"): string => {
  const config = getRegionConfig(phone);
  return config[numberType];
};

// ─── Message segmentation & length enforcement ───
export const segmentMessage = (message: string): { segments: string[]; totalSegments: number; isConcatenated: boolean } => {
  const { standard, concatenated } = smsConfig.maxLength;

  // GSM-7 check (simplified: ASCII + common chars = 160 per segment)
  // UCS-2 (unicode) = 70 chars per segment
  const hasUnicode = /[^\x00-\x7F]/.test(message);
  const charsPerSegment = hasUnicode ? 70 : standard;
  const maxCharsPerConcatSegment = hasUnicode ? 67 : 153; // multipart header overhead

  if (message.length <= charsPerSegment) {
    return { segments: [message], totalSegments: 1, isConcatenated: false };
  }

  // Split into concatenated segments
  const segments: string[] = [];
  let remaining = message.substring(0, concatenated); // Enforce max length

  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerConcatSegment) {
      segments.push(remaining);
      break;
    }
    // Try to break at word boundary
    let breakPoint = remaining.lastIndexOf(" ", maxCharsPerConcatSegment);
    if (breakPoint === -1 || breakPoint < maxCharsPerConcatSegment * 0.7) {
      breakPoint = maxCharsPerConcatSegment;
    }
    segments.push(remaining.substring(0, breakPoint));
    remaining = remaining.substring(breakPoint).trimStart();
  }

  return { segments, totalSegments: segments.length, isConcatenated: segments.length > 1 };
};

// ─── Truncate message to SMS-safe length with suffix ───
export const truncateForSMS = (message: string, suffix = ""): string => {
  const maxLen = smsConfig.maxLength.standard - suffix.length;
  if (message.length + suffix.length <= smsConfig.maxLength.standard) {
    return message + suffix;
  }
  return message.substring(0, maxLen - 3) + "..." + suffix;
};

// ─── In-memory rate limiter (per edge function invocation) ───
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export const checkRateLimit = (region: string): boolean => {
  const config = smsConfig.regions[region] || smsConfig.regions.USA;
  const now = Date.now();
  const bucket = rateBuckets.get(region);

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(region, { count: 1, resetAt: now + 1000 });
    return true;
  }

  if (bucket.count >= config.rateLimit) {
    return false; // Rate limited
  }

  bucket.count++;
  return true;
};

// ─── Check global rate limit ───
export const checkGlobalRateLimit = (): boolean => {
  const now = Date.now();
  const bucket = rateBuckets.get("__global__");

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set("__global__", { count: 1, resetAt: now + 1000 });
    return true;
  }

  if (bucket.count >= smsConfig.globalRateLimit) {
    return false;
  }

  bucket.count++;
  return true;
};
