// Constant-time string comparison for webhook signatures.
// Node/Deno's built-in string `!==` short-circuits on the first differing byte;
// use this to compare HMAC hex digests instead.
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
