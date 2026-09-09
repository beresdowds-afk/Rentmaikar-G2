export interface FriendlySecretError {
  title: string;
  description: string;
  fixSteps?: string[];
  message?: string;
}

export function friendlySecretError(e: Error | any, provider?: string): FriendlySecretError {
  const msg = e?.message || String(e || 'Unknown error');
  const provName = provider ? provider.toUpperCase() : 'Credential';

  return {
    title: `Failed to save ${provName} credentials`,
    description: msg,
    message: msg,
    fixSteps: ['Verify your API keys and tokens', 'Ensure permissions are granted', 'Try again'],
  };
}

export function secretErrorDescription(friendly: FriendlySecretError): string {
  return friendly.description || friendly.message || 'Please check the provided credentials and try again.';
}
