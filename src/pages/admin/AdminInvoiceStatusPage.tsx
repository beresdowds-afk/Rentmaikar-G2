import { useAuth } from "@/contexts/AuthContext";
import { InvoiceStatusPanel } from "@/components/payments/InvoiceStatusPanel";

export default function AdminInvoiceStatusPage() {
  const { user } = useAuth();
  return (
    <div className="container mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Invoice Status</h1>
        <p className="text-sm text-muted-foreground">
          Cross-check billing period, agreed rate, security deposit linkage, payment state, and receipts across every driver and owner.
        </p>
      </div>
      <InvoiceStatusPanel scope="admin" userId={user?.id} />
    </div>
  );
}
