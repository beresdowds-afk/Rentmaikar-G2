import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import {
  displayValue,
  fieldLabel,
  type FieldChoice,
  type FieldConflict,
} from "@/lib/conflict-resolution";

interface Props {
  open: boolean;
  conflicts: FieldConflict[];
  /** Fields changed elsewhere that were merged without a decision. */
  autoMerged?: string[];
  /** Where the other edit came from, when known ("the website", "the app"). */
  otherSourceLabel?: string;
  saving?: boolean;
  onCancel: () => void;
  onResolve: (choices: Record<string, FieldChoice>) => void;
}

/**
 * Asks the user to settle field-level conflicts when the same record was edited
 * on another device (website vs installed app) at the same time.
 */
export default function ConflictResolutionDialog({
  open,
  conflicts,
  autoMerged = [],
  otherSourceLabel = "another device",
  saving = false,
  onCancel,
  onResolve,
}: Props) {
  const [choices, setChoices] = useState<Record<string, FieldChoice>>({});

  const choiceFor = (field: string): FieldChoice => choices[field] ?? "local";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
            Changes were made on {otherSourceLabel}
          </DialogTitle>
          <DialogDescription>
            These fields were edited in two places at once. Choose which version to keep — nothing
            is saved until you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[50vh] overflow-y-auto">
          {conflicts.map((c) => (
            <div key={c.field} className="rounded-lg border p-3">
              <p className="mb-2 font-medium">{fieldLabel(c.field)}</p>
              <RadioGroup
                value={choiceFor(c.field)}
                onValueChange={(v) => setChoices((p) => ({ ...p, [c.field]: v as FieldChoice }))}
                className="space-y-2"
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="local" id={`${c.field}-local`} className="mt-1" />
                  <Label htmlFor={`${c.field}-local`} className="font-normal">
                    <span className="block text-sm text-muted-foreground">Your version here</span>
                    <span className="block">{displayValue(c.local)}</span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="remote" id={`${c.field}-remote`} className="mt-1" />
                  <Label htmlFor={`${c.field}-remote`} className="font-normal">
                    <span className="block text-sm text-muted-foreground">
                      Saved on {otherSourceLabel}
                    </span>
                    <span className="block">{displayValue(c.remote)}</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          ))}

          {autoMerged.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Kept automatically from {otherSourceLabel}:{" "}
              {autoMerged.map((f) => (
                <Badge key={f} variant="secondary" className="mr-1">
                  {fieldLabel(f)}
                </Badge>
              ))}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => onResolve(choices)} disabled={saving}>
            {saving ? "Saving…" : "Save with these choices"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
