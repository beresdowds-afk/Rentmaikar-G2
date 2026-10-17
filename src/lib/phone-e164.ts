/** Normalises a phone string to E.164 (leading "+", digits only). */
export const toE164 = (v: string) => {
  const t = (v || "").trim();
  return t.startsWith("+") ? t.replace(/\s+/g, "") : `+${t.replace(/[^\d]/g, "")}`;
};

/** E.164 for supplied values, null when the (optional) field was left blank. */
export const optionalE164 = (v?: string) => {
  const t = (v || "").trim();
  return t ? toE164(t) : null;
};
