import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "react-router-dom";
import { Settings, Shield } from "lucide-react";

export type PersonaFieldKey =
  | "name_first"
  | "name_last"
  | "email"
  | "phone";

export interface PersonaFallbackValues {
  fields: Partial<Record<PersonaFieldKey, string>>;
  notify: { sms: boolean; whatsapp: boolean };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  missing: PersonaFieldKey[];
  initial?: Partial<Record<PersonaFieldKey, string>>;
  onConfirm: (v: PersonaFallbackValues) => void;
}

const LABELS: Record<PersonaFieldKey, string> = {
  name_first: "First name",
  name_last: "Last name",
  email: "Email",
  phone: "Phone (E.164)",
};

export default function PersonaFieldsFallbackDialog({
  open,
  onOpenChange,
  missing,
  initial,
  onConfirm,
}: Props) {
  const [values, setValues] = useState<Partial<Record<PersonaFieldKey, string>>>(initial ?? {});
  const [sms, setSms] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);

  const allFilled = missing.every((k) => (values[k] ?? "").trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" /> Complete verification details
          </DialogTitle>
          <DialogDescription>
            We need a few details before starting your identity check. These are
            only used for this verification — save them permanently in your
            profile settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {missing.map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`persona-${k}`}>{LABELS[k]}</Label>
              <Input
                id={`persona-${k}`}
                value={values[k] ?? ""}
                onChange={(e) => setValues((s) => ({ ...s, [k]: e.target.value }))}
                type={k === "email" ? "email" : "text"}
                placeholder={LABELS[k]}
              />
            </div>
          ))}

          <div className="pt-1 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Notify me when verification is pending or complete:
            </p>
            <div className="flex items-center gap-2">
              <Checkbox id="notify-sms" checked={sms} onCheckedChange={(v) => setSms(!!v)} />
              <Label htmlFor="notify-sms" className="text-sm font-normal">SMS</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="notify-wa" checked={whatsapp} onCheckedChange={(v) => setWhatsapp(!!v)} />
              <Label htmlFor="notify-wa" className="text-sm font-normal">WhatsApp</Label>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings/profile">
              <Settings className="h-3.5 w-3.5 mr-1" /> Update profile
            </Link>
          </Button>
          <Button
            onClick={() => onConfirm({ fields: values, notify: { sms, whatsapp } })}
            disabled={!allFilled}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
