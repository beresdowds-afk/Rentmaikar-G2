import CredentialVerificationPanel from "@/components/admin/CredentialVerificationPanel";
import ProviderCredentialSettings from "@/components/admin/ProviderCredentialSettings";
import Seo from "@/components/seo/Seo";

/**
 * Admin screen that verifies every stored provider credential live and lets
 * admins rotate the vault-backed ones. Saving a credential here immediately
 * re-tests it — no refresh required.
 */
export default function CredentialHealthPage() {
  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Seo
        title="Credential health | Rentmaikar admin"
        description="Verify every third-party provider credential with a live API check."
        path="/admin/credential-health"
        noindex
      />
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Credential health</h1>
        <p className="text-sm text-muted-foreground">
          Live status for every third-party integration. Checks re-run automatically whenever a credential is saved.
        </p>
      </header>
      <CredentialVerificationPanel />
      <ProviderCredentialSettings />
    </div>
  );
}
