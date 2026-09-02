// Translates raw Postgres / edge-function errors raised while saving or
// rotating provider secrets into clear, actionable messages for admins.

export type FriendlySecretError = {
  title: string;
  description: string;
  /** Concrete next steps shown under the message. */
  fixSteps: string[];
  raw: string;
};

type Rule = {
  match: RegExp;
  title: string;
  description: string;
  fixSteps: string[];
};

const RULES: Rule[] = [
  {
    match: /column "([a-z0-9_]+)" of relation "([a-z0-9_]+)" does not exist|does not exist.*column/i,
    title: "The secret store is out of date",
    description:
      "The database function that saves credentials refers to a column that no longer exists, so nothing was written.",
    fixSteps: [
      "No credential was changed — the previous value is still active.",
      "Report this to engineering: the credential-writing function needs a schema fix.",
    ],
  },
  {
    match: /row-level security|permission denied|not authorized|insufficient_privilege|42501/i,
    title: "You don’t have permission to change this secret",
    description:
      "Your account is missing the admin privilege required to write provider credentials.",
    fixSteps: [
      "Ask a full administrator to grant you credential-management access.",
      "If you were recently promoted, sign out and back in to refresh your session.",
    ],
  },
  {
    match: /jwt|token is expired|invalid claim|session|401/i,
    title: "Your session expired",
    description: "The request was rejected because your sign-in session is no longer valid.",
    fixSteps: ["Sign out and sign back in.", "Re-enter the credential and save again."],
  },
  {
    match: /violates check constraint|invalid input value for enum|check constraint/i,
    title: "That value isn’t accepted",
    description:
      "One of the fields failed validation — usually an unsupported provider name or a malformed value.",
    fixSteps: [
      "Check for stray spaces, quotes or line breaks in the value you pasted.",
      "Make sure the URL fields start with https:// and have no trailing slash.",
    ],
  },
  {
    match: /null value in column|not-null constraint|violates not-null/i,
    title: "A required field is empty",
    description: "One of the required credential fields was left blank.",
    fixSteps: ["Fill in every field marked as required, then save again."],
  },
  {
    match: /duplicate key|unique constraint/i,
    title: "That credential version already exists",
    description: "An identical credential version is already stored, so nothing was changed.",
    fixSteps: ["Enter a different value, or use the existing active version."],
  },
  {
    match: /vault|encryption|decrypt/i,
    title: "The secure vault rejected the write",
    description: "The credential could not be encrypted and stored safely.",
    fixSteps: [
      "Try again in a moment.",
      "If it keeps failing, report it — the value was not saved and the old one is still active.",
    ],
  },
  {
    match: /failed to fetch|network|timeout|timed out|ECONNRESET|503|502|504/i,
    title: "Couldn’t reach the server",
    description: "The save request never completed, so the credential may not have been stored.",
    fixSteps: [
      "Check your connection and try again.",
      "Reload the panel afterwards to confirm whether a new version was recorded.",
    ],
  },
  {
    match: /rate limit|too many requests|429/i,
    title: "Too many attempts",
    description: "Credential updates are rate limited to protect the secret store.",
    fixSteps: ["Wait a minute, then save again."],
  },
  {
    match: /function .* does not exist|could not find the function|PGRST202/i,
    title: "Credential saving is unavailable",
    description: "The backend function that stores credentials isn’t deployed for this environment.",
    fixSteps: ["Nothing was changed.", "Report this to engineering so the function can be redeployed."],
  },
  {
    match: /invalid credentials|authentication failed|unauthorized|403/i,
    title: "The provider rejected these credentials",
    description: "The values were saved but the provider refused the sign-in attempt.",
    fixSteps: [
      "Double-check the user ID / API key with the provider’s own dashboard.",
      "Confirm the account is active and has API access enabled.",
    ],
  },
];

export function friendlySecretError(err: unknown, providerLabel?: string): FriendlySecretError {
  const raw =
    typeof err === "string"
      ? err
      : ((err as { message?: string; error_description?: string; details?: string } | null)?.message ??
        (err as { error_description?: string } | null)?.error_description ??
        (err as { details?: string } | null)?.details ??
        "Unknown error");

  const suffix = providerLabel ? ` (${providerLabel})` : "";
  const rule = RULES.find((r) => r.match.test(raw));

  if (!rule) {
    return {
      title: `Could not save the credentials${suffix}`,
      description:
        "The update failed and the previously stored value is still in use. The technical detail is below.",
      fixSteps: ["Try again.", "If it keeps failing, share the technical detail with engineering."],
      raw,
    };
  }

  return {
    title: `${rule.title}${suffix}`,
    description: rule.description,
    fixSteps: rule.fixSteps,
    raw,
  };
}

/** Single-string form for compact toasts. */
export function secretErrorDescription(e: FriendlySecretError): string {
  return [e.description, ...e.fixSteps.map((s) => `• ${s}`)].join("\n");
}
