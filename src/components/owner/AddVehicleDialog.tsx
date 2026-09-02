import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRegion } from "@/contexts/RegionContext";
import { useCategoryYearSpecs } from "@/hooks/useCategoryYearSpecs";
import {
  VehiclePhotoUploader,
  type VehiclePhotoUploaderHandle,
  type PhotoItem,
} from "./VehiclePhotoUploader";

type FormState = {
  make: string;
  model: string;
  year: string;
  license_plate: string;
  color: string;
  vin: string;
  pickup_city: string;
  pickup_address: string;
  pickup_instructions: string;
};

const EMPTY: FormState = {
  make: "",
  model: "",
  year: "",
  license_plate: "",
  color: "",
  vin: "",
  pickup_city: "",
  pickup_address: "",
  pickup_instructions: "",
};

/**
 * Owner vehicle submission. Writes straight to `vehicles` so the record is
 * immediately visible on the owner dashboard, and (once an admin approves and
 * publishes it) in the public catalogue. RLS forces `pending` + non-public.
 */
export function AddVehicleDialog() {
  const { user } = useAuth();
  const { country } = useRegion();
  const queryClient = useQueryClient();
  const { specs } = useCategoryYearSpecs(country);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [photoState, setPhotoState] = useState<{ items: PhotoItem[]; uploading: boolean }>({
    items: [],
    uploading: false,
  });
  const photosRef = useRef<VehiclePhotoUploaderHandle>(null);
  // A stable folder for this draft so uploads can happen before the row exists.
  const [draftId] = useState(() =>
    (globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}`),
  );

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const yearNumber = Number(form.year);
  const derivedCategory = useMemo(() => {
    if (!yearNumber) return null;
    return specs.find((s) => yearNumber >= s.min_year && yearNumber <= s.max_year) ?? null;
  }, [specs, yearNumber]);

  const currentYear = new Date().getFullYear();
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (form.make.trim().length < 2) errors.make = "Enter the vehicle make";
  if (form.model.trim().length < 1) errors.model = "Enter the vehicle model";
  if (!yearNumber || yearNumber < 1990 || yearNumber > currentYear + 1)
    errors.year = `Enter a year between 1990 and ${currentYear + 1}`;
  if (form.license_plate.trim().length < 3) errors.license_plate = "Enter the plate number";

  const photoErrors = photoState.items.filter((i) => i.status === "error").length;
  const canSubmit =
    Object.keys(errors).length === 0 &&
    !submitting &&
    !photoState.uploading &&
    photoErrors === 0 &&
    !!user;

  const submit = async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);
    try {
      // Photos must be fully uploaded before the vehicle row is written, so a
      // listing is never saved with missing or partial imagery.
      let photoUrls: string[] = [];
      try {
        photoUrls = (await photosRef.current?.uploadAll()) ?? [];
      } catch (uploadErr: any) {
        toast.error("Photos not uploaded", {
          description: uploadErr?.message ?? "Retry the failed photos and submit again.",
        });
        setSubmitting(false);
        return;
      }

      const { data, error } = await supabase
        .from("vehicles")
        .insert({
          owner_id: user.id,
          make: form.make.trim(),
          model: form.model.trim(),
          year: yearNumber,
          license_plate: form.license_plate.trim().toUpperCase(),
          color: form.color.trim() || null,
          vin: form.vin.trim() || null,
          pickup_city: form.pickup_city.trim() || null,
          pickup_address: form.pickup_address.trim() || null,
          pickup_instructions: form.pickup_instructions.trim() || null,
          photo_urls: photoUrls,
          status: "pending",
          is_public: false,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Keep dashboard + catalogue caches in step immediately; realtime keeps
      // every other open tab/PWA install aligned.
      ["owner-vehicles", "vehicles", "public-vehicles", "public-vehicle", "catalogue"].forEach(
        (key) => queryClient.invalidateQueries({ queryKey: [key] }),
      );

      toast.success(
        photoUrls.length
          ? `Vehicle submitted with ${photoUrls.length} photo${photoUrls.length > 1 ? "s" : ""}`
          : "Vehicle submitted",
        {
          description:
            "It is pending admin verification and will appear in the catalogue once approved.",
        },
      );

      setForm(EMPTY);
      setOpen(false);
      return data;
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (/duplicate key|unique/i.test(msg)) {
        toast.error("That plate number is already registered on the platform.");
      } else if (/row-level security|permission denied/i.test(msg)) {
        toast.error("Your owner account is not approved to list vehicles yet.");
      } else {
        toast.error("Could not submit vehicle", { description: msg || "Please try again." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const field = (
    key: keyof FormState,
    label: string,
    placeholder: string,
    type: string = "text",
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`veh-${key}`}>{label}</Label>
      <Input
        id={`veh-${key}`}
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => set(key)(e.target.value)}
      />
      {errors[key] && form[key] !== "" && (
        <p className="text-xs text-destructive">{errors[key]}</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Vehicle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Vehicle</DialogTitle>
          <DialogDescription>
            Details are saved to your account straight away. Listings go live in the catalogue after
            admin approval.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            {field("make", "Make", "e.g. Toyota")}
            {field("model", "Model", "e.g. Camry")}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field("year", "Year", "e.g. 2021", "number")}
            {field("license_plate", "Plate Number", "e.g. ABC-123")}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field("color", "Colour (optional)", "e.g. Silver")}
            {field("vin", "VIN / Chassis (optional)", "17-character VIN")}
          </div>
          {derivedCategory && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Pricing tier:</span>
              <Badge variant="secondary">
                {derivedCategory.label} ({derivedCategory.min_year}–{derivedCategory.max_year})
              </Badge>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {field("pickup_city", "Pickup city (optional)", "e.g. Lagos")}
            {field("pickup_address", "Pickup address (optional)", "Street address")}
          </div>
          <div className="space-y-2">
            <Label htmlFor="veh-instructions">Pickup instructions (optional)</Label>
            <Textarea
              id="veh-instructions"
              value={form.pickup_instructions}
              placeholder="Where should the driver collect the vehicle?"
              onChange={(e) => set("pickup_instructions")(e.target.value)}
            />
          </div>
          {user && (
            <VehiclePhotoUploader
              ref={photosRef}
              ownerId={user.id}
              draftId={draftId}
              disabled={submitting}
              onStateChange={setPhotoState}
            />
          )}
          <p className="text-xs text-muted-foreground">
            You can add or reorder photos later from the vehicle card on the “My Vehicles” tab.
          </p>
          <Button onClick={submit} disabled={!canSubmit} className="w-full">
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {submitting
              ? photoState.uploading || photoState.items.some((i) => i.status === "uploading")
                ? "Uploading photos…"
                : "Submitting…"
              : "Submit Vehicle for Approval"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AddVehicleDialog;
