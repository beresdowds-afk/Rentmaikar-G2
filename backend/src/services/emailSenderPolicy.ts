const APPROVED_DOMAIN = "rentmaikar.com";
const ADDRESS_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+$/i;

export type EmailSenderEnvironment = Record<string, string | undefined>;

function normalizeAddress(value: string): string {
  const address = value.trim().toLowerCase();
  if (
    !ADDRESS_PATTERN.test(address) ||
    address.split("@").length !== 2 ||
    /^\./.test(address.split("@")[0]) ||
    /\.$|\.\./.test(address.split("@")[0]) ||
    address.slice(address.lastIndexOf("@") + 1) !== APPROVED_DOMAIN
  ) {
    throw new Error("Email sender must be a valid address at the exact rentmaikar.com domain");
  }
  return address;
}

export function validateApprovedBusinessSender(
  value: string,
  approvedAddresses: string[],
): string {
  const address = normalizeAddress(value);
  const approved = approvedAddresses.map(normalizeAddress);
  if (!approved.includes(address)) {
    throw new Error("Email sender is not in the approved sender allowlist");
  }
  return address;
}

export function resolveBusinessReplyTo(
  replyTo: string | string[] | undefined,
  environment: EmailSenderEnvironment = process.env,
): string | string[] | undefined {
  if (replyTo === undefined) return undefined;
  const addresses = Array.isArray(replyTo) ? replyTo : [replyTo];
  const approved = (environment.APPROVED_BUSINESS_SENDERS || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  const defaultSender = validateApprovedBusinessSender(environment.DEFAULT_BUSINESS_FROM || "", approved);
  let normalized: string[];
  try {
    normalized = addresses.map((address) => validateApprovedBusinessSender(address, approved));
  } catch {
    return defaultSender;
  }
  return Array.isArray(replyTo) ? normalized : normalized[0];
}

export function getConfiguredBusinessSender(
  environment: EmailSenderEnvironment = process.env,
): string {
  const configured = environment.DEFAULT_BUSINESS_FROM?.trim();
  const allowlist = (environment.APPROVED_BUSINESS_SENDERS || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);

  if (!configured || allowlist.length === 0) {
    throw new Error(
      "Outbound email is disabled: configure DEFAULT_BUSINESS_FROM and APPROVED_BUSINESS_SENDERS with provider-verified rentmaikar.com addresses",
    );
  }

  const address = validateApprovedBusinessSender(configured, allowlist);
  return `RentMaikar <${address}>`;
}

export function resolveBusinessEmailSender(
  _requestedSender: string | undefined,
  environment: EmailSenderEnvironment = process.env,
): string {
  return getConfiguredBusinessSender(environment);
}
