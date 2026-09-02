import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Vehicle {
  id: string;
  make: string | null;
  model: string | null;
  license_plate: string | null;
  year: number | null;
}

interface Props {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  includeNone?: boolean;
}

export function VehiclePicker({ value, onChange, placeholder = "Link to vehicle…", includeNone = true }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("vehicles")
        .select("id, make, model, license_plate, year")
        .order("created_at", { ascending: false })
        .limit(500);
      setVehicles((data as Vehicle[]) || []);
    })();
  }, []);

  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? null : v)}
    >
      <SelectTrigger className="max-w-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeNone && <SelectItem value="__none__">— Unlinked —</SelectItem>}
        {vehicles.map(v => (
          <SelectItem key={v.id} value={v.id}>
            {[v.year, v.make, v.model].filter(Boolean).join(" ")}
            {v.license_plate ? ` · ${v.license_plate}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
