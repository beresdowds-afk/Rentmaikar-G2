// Thin admin wrapper around DocumentExportButton that runs the server-side
// flow: builds the ZIP via the `export-user-documents` edge function so the
// admin never has to stream possibly hundreds of files through their browser.
// The audit trail is written server-side with source='server'.

import { DocumentExportButton } from "@/components/documents/DocumentExportButton";

interface Props {
  /** Driver or owner whose documents to bundle. */
  targetUserId: string;
  /** Optional vehicle scope for owner exports. */
  vehicleId?: string;
  /** Human label for the zip filename (e.g. driver-jane-doe or vehicle-abc123). */
  label?: string;
  variant?: "default" | "outline" | "ghost";
}

export const AdminDocumentExportButton = ({
  targetUserId, vehicleId, label, variant = "outline",
}: Props) => (
  <DocumentExportButton
    userId={targetUserId}
    vehicleId={vehicleId}
    label={label}
    variant={variant}
    serverSide
    buttonLabel={vehicleId ? "Export vehicle docs (ZIP)" : "Export driver docs (ZIP)"}
  />
);

export default AdminDocumentExportButton;
