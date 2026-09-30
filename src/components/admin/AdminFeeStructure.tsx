import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loadPlatformKvSetting,
  savePlatformKvSetting,
} from "@/lib/platformSettings";

type CommissionSetting = {
  owner_share_pct: number;
};

const DEFAULT_OWNER_SHARE_PCT = 66.67;

export function AdminFeeStructure() {
  const [ownerSharePct, setOwnerSharePct] = useState<number>(
    DEFAULT_OWNER_SHARE_PCT
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const platformSharePct = useMemo(
    () => Number((100 - ownerSharePct).toFixed(2)),
    [ownerSharePct]
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const value = await loadPlatformKvSetting<CommissionSetting | number>(
        "owner_share_pct",
        { owner_share_pct: DEFAULT_OWNER_SHARE_PCT / 100 }
      );

      if (cancelled) return;

      const raw =
        typeof value === "number"
          ? value
          : value?.owner_share_pct ?? DEFAULT_OWNER_SHARE_PCT / 100;

      // platform_kv_settings stores the authoritative value as a fraction.
      const percentage = raw <= 1 ? raw * 100 : raw;

      setOwnerSharePct(
        Math.min(100, Math.max(0, Number(percentage.toFixed(2))))
      );

      setLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (!Number.isFinite(ownerSharePct)) {
      toast.error("Owner share must be a valid percentage.");
      return;
    }

    if (ownerSharePct <= 0 || ownerSharePct >= 100) {
      toast.error("Owner share must be greater than 0% and less than 100%.");
      return;
    }

    setSaving(true);

    try {
      const success = await savePlatformKvSetting("owner_share_pct", {
        owner_share_pct: Number((ownerSharePct / 100).toFixed(6)),
      });

      if (!success.success) {
        throw new Error(success.error || "Failed to save commission setting.");
      }

      toast.success("Commission structure updated.");
    } catch (error) {
      console.error("[AdminFeeStructure] save failed:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save commission structure."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading fee structure…
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Wallet className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-lg font-semibold">
            Fee Structure & Payment Commission
          </h3>
          <p className="text-xs text-muted-foreground">
            This is the authoritative rental-payment commission configuration.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">
            Owner Share of Payment
          </p>
          <p className="text-2xl font-bold mt-1">
            {ownerSharePct.toFixed(2)}%
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">
            Platform Commission
          </p>
          <p className="text-2xl font-bold mt-1">
            {platformSharePct.toFixed(2)}%
          </p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">
            Combined Allocation
          </p>
          <p className="text-2xl font-bold mt-1">
            {(ownerSharePct + platformSharePct).toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="mt-6 max-w-sm space-y-2">
        <Label htmlFor="owner-share-pct">
          Owner Share Override (%)
        </Label>

        <Input
          id="owner-share-pct"
          type="number"
          min={0.01}
          max={99.99}
          step={0.01}
          value={ownerSharePct}
          onChange={(event) =>
            setOwnerSharePct(Number(event.target.value))
          }
        />

        <p className="text-xs text-muted-foreground">
          Platform commission is automatically calculated as 100% minus the
          configured owner share. This value is consumed by the authoritative
          payment settlement function.
        </p>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Commission Override
        </Button>
      </div>
    </Card>
  );
}
