/**
 * Canonical public frontend URL used for provider return/cancel/callback links.
 *
 * PayPal and Paystack reject relative URLs, so an unset `APP_URL` used to make
 * every checkout fail with a provider 400 ("INVALID_PARAMETER_SYNTAX"). Always
 * resolve through here so a missing secret degrades to the production frontend
 * instead of breaking payments.
 */
const DEFAULT_APP_URL = "https://rentmaikar.com";

export function appUrl(): string {
  const raw = (Deno.env.get("APP_URL") ?? Deno.env.get("PUBLIC_APP_URL") ?? "").trim();
  if (!/^https?:\/\/[^\s]+$/i.test(raw)) return DEFAULT_APP_URL;
  return raw.replace(/\/+$/, "");
}

/** Absolute URL for a path on the public frontend (`/payment/success`). */
export function appPath(path: string): string {
  return `${appUrl()}/${String(path).replace(/^\/+/, "")}`;
}
