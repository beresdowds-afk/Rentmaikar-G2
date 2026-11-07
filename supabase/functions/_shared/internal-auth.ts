function secretMatches(provided: string, configured: string): boolean {
  if (!provided || !configured) return false;

  const encoder = new TextEncoder();
  const a = encoder.encode(provided);
  const b = encoder.encode(configured);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);

  for (let i = 0; i < length; i += 1) {
    mismatch |= a[i % a.length] ^ b[i % b.length];
  }

  return mismatch === 0;
}

export function isTrustedInternalRequest(
  headers: Pick<Headers, "get">,
  serviceRoleKey: string,
  cronSecret: string,
): boolean {
  const cronHeader = headers.get("x-cron-secret") ?? "";
  if (secretMatches(cronHeader, cronSecret)) return true;

  const authorization = headers.get("Authorization") ?? "";
  return authorization.startsWith("Bearer ") &&
    secretMatches(authorization.slice(7), serviceRoleKey);
}
