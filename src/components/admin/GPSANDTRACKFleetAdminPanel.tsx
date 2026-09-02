import { useCallback, useState } from "react";
import { invokeEdge } from "@/lib/edge-invoke";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Wrench, UserCheck, ArrowRightLeft, FileSignature, PlugZap, Undo2, Search, ShieldCheck, History as HistoryIcon } from "lucide-react";
import { toast } from "sonner";

interface Diagnosis {
  code?: string;
  title?: string;
  detail?: string;
  hints?: string[];
}

interface PermissionResult {
  scope: string;
  label: string;
  unlocks: string;
  state: "granted" | "missing";
  missing_scope?: string;
  note: string;
}

interface AuditEntry {
  id: string;
  created_at: string;
  operation: string;
  actor_name: string;
  actor_email: string | null;
  status: "succeeded" | "failed";
  status_code: string;
  status_title: string;
  status_detail: string | null;
  payload: Record<string, unknown>;
}

const AUDIT_OPERATIONS = [
  "install_device",
  "uninstall_device",
  "update_asset",
  "install_test_start",
  "assign_driver",
  "unassign_driver",
  "update_driver",
  "transfer_trackers",
  "deal_create",
  "deal_unwind",
];


const DEAL_TYPES = [
  { id: 1, label: "Device Dropship" },
  { id: 2, label: "Device Handover" },
  { id: 3, label: "Vehicle Sale Protected" },
  { id: 4, label: "Vehicle Sale Unprotected" },
  { id: 5, label: "Vehicle Loan Standard" },
  { id: 6, label: "Vehicle Lease Standard" },
  { id: 7, label: "Vehicle Loan Captive" },
  { id: 8, label: "Vehicle Lease Captive" },
  { id: 9, label: "Vehicle Sale Drive-Off" },
  { id: 10, label: "Vehicle Dealer Transfer" },
  { id: 11, label: "Vehicle NCA" },
];

const RELATIONSHIPS = [
  { id: 1, label: "Borrower (financed)" },
  { id: 2, label: "Leasee (leased)" },
  { id: 3, label: "Owner (sold)" },
  { id: 4, label: "Other / operator" },
];

const CONFLICT_ACTIONS = [
  { id: 3, label: "Replace (default)" },
  { id: 2, label: "Make primary, demote others" },
  { id: 1, label: "Add as backup" },
  { id: -1, label: "Error if a conflict exists" },
];

const csv = (v: string) => v.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);

export default function GPSANDTRACKFleetAdminPanel({ onChanged }: { onChanged?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ action: string; ok: boolean; diagnosis?: Diagnosis; payload?: unknown } | null>(
    null,
  );

  // install
  const [installVin, setInstallVin] = useState("");
  const [installSerial, setInstallSerial] = useState("");
  const [installOdo, setInstallOdo] = useState("");
  const [installConflict, setInstallConflict] = useState("3");
  const [vinNotDecodable, setVinNotDecodable] = useState(false);
  const [uninstallId, setUninstallId] = useState("");

  // install test
  const [testDeviceId, setTestDeviceId] = useState("");
  const [testDt, setTestDt] = useState("");

  // asset
  const [assetId, setAssetId] = useState("");
  const [asset, setAsset] = useState({
    description: "",
    external_ref: "",
    make_description: "",
    model_description: "",
    year: "",
    color: "",
    license_issuer: "",
    license_number: "",
  });

  // driver assignment
  const [assignVin, setAssignVin] = useState("");
  const [assignRelationship, setAssignRelationship] = useState("1");
  const [assignConflict, setAssignConflict] = useState("3");
  const [assignDriverId, setAssignDriverId] = useState("");
  const [assignFields, setAssignFields] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    external_ref: "",
  });
  const [unassignDriverId, setUnassignDriverId] = useState("");
  const [unassignVin, setUnassignVin] = useState("");

  // driver update
  const [driverId, setDriverId] = useState("");
  const [driver, setDriver] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    street_line1: "",
    street_line2: "",
    city: "",
    state_code: "",
    country_code: "",
    postal_code: "",
    license_issuer: "",
    license_number: "",
  });

  // transfer
  const [transferAccount, setTransferAccount] = useState("");
  const [transferDevices, setTransferDevices] = useState("");
  const [transferAssets, setTransferAssets] = useState("");
  const [transferDrivers, setTransferDrivers] = useState("");

  // deals
  const [deal, setDeal] = useState({
    account_id: "",
    deal_type_id: "3",
    account_template_id: "",
    product_code: "",
    deal_price: "",
    deal_external_ref: "",
    deal_date: "",
    device_serial: "",
    asset_vin: "",
  });
  const [deals, setDeals] = useState<Record<string, unknown>[]>([]);
  const [dealId, setDealId] = useState("");
  const [dealDetail, setDealDetail] = useState<Record<string, unknown> | null>(null);

  // permissions probe
  const [perms, setPerms] = useState<{
    results: PermissionResult[];
    missing: string[];
    summary: string;
    checkedAt: string;
  } | null>(null);

  // audit log viewer
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditAction, setAuditAction] = useState("all");
  const [auditOutcome, setAuditOutcome] = useState("all");
  const [auditDays, setAuditDays] = useState("30");


  const run = useCallback(
    async (key: string, body: Record<string, unknown>, successMessage: string) => {
      setBusy(key);
      try {
        const { data, error } = await invokeEdge("sarekon-admin", body);
        if (error) throw new Error(error.message);
        const d = (data ?? {}) as Record<string, unknown>;
        if (d.error && d.ok === undefined) throw new Error(String(d.error));
        const diagnosis = d.diagnosis as Diagnosis | undefined;
        setResult({ action: key, ok: d.ok !== false, diagnosis, payload: d.response ?? d });
        if (d.ok === false) toast.error(`${diagnosis?.title ?? "Request failed"} — ${diagnosis?.detail ?? ""}`);
        else {
          toast.success(successMessage);
          onChanged?.();
        }
        return d;
      } catch (e) {
        toast.error((e as Error).message);
        setResult({ action: key, ok: false, diagnosis: { title: "Request failed", detail: (e as Error).message } });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [onChanged],
  );

  const spinner = (key: string) => busy === key;

  return (
    <div className="space-y-4">
      <Alert>
        <Wrench className="h-4 w-4" />
        <AlertTitle>Dealer operations</AlertTitle>
        <AlertDescription>
          These calls change records inside GPSANDTRACK (installs, driver assignments, account transfers and deals).
          Every action is written to the IoT audit log. Device IDs are the system-assigned IDs from the Devices tab —
          not serial numbers.
        </AlertDescription>
      </Alert>

      {result && (
        <Alert variant={result.ok ? "default" : "destructive"}>
          <AlertTitle className="flex items-center gap-2">
            {result.ok ? "Success" : result.diagnosis?.title ?? "Failed"}
            <Badge variant="outline">{result.action}</Badge>
          </AlertTitle>
          <AlertDescription>
            {result.diagnosis?.detail}
            {result.payload ? (
              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
                {JSON.stringify(result.payload, null, 2)}
              </pre>
            ) : null}
          </AlertDescription>
        </Alert>
      )}

      <Accordion type="multiple" defaultValue={["install"]} className="space-y-3">
        {/* ---------------- Installation ---------------- */}
        <AccordionItem value="install" className="rounded-lg border px-4">
          <AccordionTrigger className="text-base">
            <span className="flex items-center gap-2"><PlugZap className="h-4 w-4" /> Install & uninstall devices</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-6 pb-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="install-vin">Asset VIN / HIN / serial</Label>
                <Input id="install-vin" value={installVin} onChange={(e) => setInstallVin(e.target.value)} placeholder="1FMCU9GD7JUC16335" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="install-serial">Device serial</Label>
                <Input id="install-serial" value={installSerial} onChange={(e) => setInstallSerial(e.target.value)} placeholder="V24346052939583" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="install-odo">Odometer at install (optional)</Label>
                <Input id="install-odo" inputMode="numeric" value={installOdo} onChange={(e) => setInstallOdo(e.target.value)} placeholder="127894" />
              </div>
              <div className="space-y-1">
                <Label>If another device is already primary</Label>
                <Select value={installConflict} onValueChange={setInstallConflict}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONFLICT_ACTIONS.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox id="vin-nd" checked={vinNotDecodable} onCheckedChange={(v) => setVinNotDecodable(v === true)} />
                <Label htmlFor="vin-nd" className="font-normal">
                  VIN is not decodable (not a street-legal VIN, boat HIN or supported serial)
                </Label>
              </div>
            </div>
            <Button
              disabled={!installVin || !installSerial || !!busy}
              onClick={() =>
                run(
                  "install_device",
                  {
                    action: "install_device",
                    asset_vin: installVin.trim(),
                    device_serial: installSerial.trim(),
                    vin_not_decodable: vinNotDecodable,
                    conflict_action_id: Number(installConflict),
                    installed_odometer: installOdo ? Number(installOdo) : undefined,
                  },
                  "Device installed into the asset",
                )}
            >
              {spinner("install_device") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Install device
            </Button>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="uninstall-id">Device ID to uninstall</Label>
                <Input id="uninstall-id" value={uninstallId} onChange={(e) => setUninstallId(e.target.value)} placeholder="3928573490" />
              </div>
              <div className="flex items-end">
                <Button
                  variant="destructive"
                  disabled={!uninstallId || !!busy}
                  onClick={() =>
                    run("uninstall_device", { action: "uninstall_device", dvd_id: uninstallId.trim() }, "Device uninstalled")}
                >
                  {spinner("uninstall_device") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Uninstall device
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="text-sm font-medium">Basic installation test (GPS + cellular)</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="test-device">Device ID</Label>
                  <Input id="test-device" value={testDeviceId} onChange={(e) => setTestDeviceId(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="test-dt">Test start time (from “Start test”)</Label>
                  <Input id="test-dt" value={testDt} onChange={(e) => setTestDt(e.target.value)} placeholder="2010-03-02 15:22:01" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={!testDeviceId || !!busy}
                  onClick={async () => {
                    const d = await run(
                      "install_test_start",
                      { action: "install_test_start", dvd_id: testDeviceId.trim() },
                      "Installation test started",
                    );
                    if (d?.test_dt) setTestDt(String(d.test_dt));
                  }}
                >
                  {spinner("install_test_start") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Start test
                </Button>
                <Button
                  variant="outline"
                  disabled={!testDeviceId || !testDt || !!busy}
                  onClick={() =>
                    run(
                      "install_test_result",
                      { action: "install_test_result", dvd_id: testDeviceId.trim(), test_dt: testDt.trim() },
                      "Test result fetched",
                    )}
                >
                  {spinner("install_test_result") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Check result
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Poll the result about every 10 seconds (minimum 5 seconds apart).</p>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ---------------- Asset ---------------- */}
        <AccordionItem value="asset" className="rounded-lg border px-4">
          <AccordionTrigger className="text-base">
            <span className="flex items-center gap-2"><Wrench className="h-4 w-4" /> Update vehicle (asset) details</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="asset-id">Asset ID</Label>
                <Input id="asset-id" value={assetId} onChange={(e) => setAssetId(e.target.value)} placeholder="11389443" />
              </div>
              {(Object.keys(asset) as Array<keyof typeof asset>).map((k) => (
                <div className="space-y-1" key={k}>
                  <Label htmlFor={`asset-${k}`} className="capitalize">{k.replace(/_/g, " ")}</Label>
                  <Input
                    id={`asset-${k}`}
                    value={asset[k]}
                    onChange={(e) => setAsset((s) => ({ ...s, [k]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <Button
              disabled={!assetId || !!busy}
              onClick={() =>
                run("update_asset", { action: "update_asset", asset_id: assetId.trim(), fields: asset }, "Asset updated")}
            >
              {spinner("update_asset") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save asset
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* ---------------- Drivers ---------------- */}
        <AccordionItem value="drivers" className="rounded-lg border px-4">
          <AccordionTrigger className="text-base">
            <span className="flex items-center gap-2"><UserCheck className="h-4 w-4" /> Driver assignment & details</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-6 pb-4">
            <div className="space-y-3">
              <div className="text-sm font-medium">Assign a driver to a vehicle</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="assign-vin">Asset VIN</Label>
                  <Input id="assign-vin" value={assignVin} onChange={(e) => setAssignVin(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Relationship</Label>
                  <Select value={assignRelationship} onValueChange={setAssignRelationship}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIPS.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="assign-driver-id">Existing driver ID (optional)</Label>
                  <Input id="assign-driver-id" value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>If another driver is already primary</Label>
                  <Select value={assignConflict} onValueChange={setAssignConflict}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONFLICT_ACTIONS.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {(Object.keys(assignFields) as Array<keyof typeof assignFields>).map((k) => (
                  <div className="space-y-1" key={k}>
                    <Label htmlFor={`assign-${k}`} className="capitalize">{k.replace(/_/g, " ")}</Label>
                    <Input
                      id={`assign-${k}`}
                      value={assignFields[k]}
                      onChange={(e) => setAssignFields((s) => ({ ...s, [k]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Without a driver ID, pass full name plus at least one of email, phone or external reference — the driver
                is matched or created from those fields.
              </p>
              <Button
                disabled={!assignVin || !!busy}
                onClick={() =>
                  run(
                    "assign_driver",
                    {
                      action: "assign_driver",
                      asset_vin: assignVin.trim(),
                      relationship_type_id: Number(assignRelationship),
                      conflict_action_id: Number(assignConflict),
                      driver_id: assignDriverId.trim() || undefined,
                      fields: assignFields,
                    },
                    "Driver assigned to the vehicle",
                  )}
              >
                {spinner("assign_driver") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Assign driver
              </Button>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="text-sm font-medium">Unassign a driver</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="unassign-driver">Driver ID</Label>
                  <Input id="unassign-driver" value={unassignDriverId} onChange={(e) => setUnassignDriverId(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="unassign-vin">or Asset VIN</Label>
                  <Input id="unassign-vin" value={unassignVin} onChange={(e) => setUnassignVin(e.target.value)} />
                </div>
              </div>
              <Button
                variant="destructive"
                disabled={(!unassignDriverId && !unassignVin) || !!busy}
                onClick={() =>
                  run(
                    "unassign_driver",
                    {
                      action: "unassign_driver",
                      driver_id: unassignDriverId.trim() || undefined,
                      asset_vin: unassignVin.trim() || undefined,
                    },
                    "Driver unassigned",
                  )}
              >
                {spinner("unassign_driver") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Unassign driver
              </Button>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="text-sm font-medium">Update driver record</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="driver-id">Driver ID</Label>
                  <Input id="driver-id" value={driverId} onChange={(e) => setDriverId(e.target.value)} />
                </div>
                {(Object.keys(driver) as Array<keyof typeof driver>).map((k) => (
                  <div className="space-y-1" key={k}>
                    <Label htmlFor={`driver-${k}`} className="capitalize">{k.replace(/_/g, " ")}</Label>
                    <Input
                      id={`driver-${k}`}
                      value={driver[k]}
                      onChange={(e) => setDriver((s) => ({ ...s, [k]: e.target.value }))}
                      placeholder={k === "state_code" ? "US-AL" : k === "country_code" ? "US" : undefined}
                    />
                  </div>
                ))}
              </div>
              <Button
                disabled={!driverId || !!busy}
                onClick={() =>
                  run("update_driver", { action: "update_driver", driver_id: driverId.trim(), fields: driver }, "Driver updated")}
              >
                {spinner("update_driver") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save driver
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ---------------- Transfer ---------------- */}
        <AccordionItem value="transfer" className="rounded-lg border px-4">
          <AccordionTrigger className="text-base">
            <span className="flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" /> Transfer trackers to another account</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="transfer-account">Destination account ID</Label>
                <Input id="transfer-account" value={transferAccount} onChange={(e) => setTransferAccount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="transfer-devices">Device IDs (comma separated)</Label>
                <Input id="transfer-devices" value={transferDevices} onChange={(e) => setTransferDevices(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="transfer-assets">Asset IDs</Label>
                <Input id="transfer-assets" value={transferAssets} onChange={(e) => setTransferAssets(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="transfer-drivers">Driver IDs</Label>
                <Input id="transfer-drivers" value={transferDrivers} onChange={(e) => setTransferDrivers(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Pass every device, asset and driver that are installed or assigned to each other — partial transfers are
              rejected by the provider. Full admin role required.
            </p>
            <Button
              disabled={!transferAccount || !!busy}
              onClick={() =>
                run(
                  "transfer_trackers",
                  {
                    action: "transfer_trackers",
                    account_id: transferAccount.trim(),
                    device_ids: csv(transferDevices),
                    asset_ids: csv(transferAssets),
                    driver_ids: csv(transferDrivers),
                  },
                  "Trackers transferred",
                )}
            >
              {spinner("transfer_trackers") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Transfer
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* ---------------- Deals ---------------- */}
        <AccordionItem value="deals" className="rounded-lg border px-4">
          <AccordionTrigger className="text-base">
            <span className="flex items-center gap-2"><FileSignature className="h-4 w-4" /> Deals (sale, loan, lease, dropship)</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-6 pb-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="deal-account">Dealer account ID</Label>
                <Input id="deal-account" value={deal.account_id} onChange={(e) => setDeal((s) => ({ ...s, account_id: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Deal type</Label>
                <Select value={deal.deal_type_id} onValueChange={(v) => setDeal((s) => ({ ...s, deal_type_id: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEAL_TYPES.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {([
                ["account_template_id", "Account template ID (captive deals)"],
                ["product_code", "Product code (partnership deals)"],
                ["deal_price", "Deal price"],
                ["deal_external_ref", "External reference"],
                ["deal_date", "Deal date (YYYY-MM-DD)"],
                ["device_serial", "Device serial"],
                ["asset_vin", "Asset VIN"],
              ] as const).map(([k, label]) => (
                <div className="space-y-1" key={k}>
                  <Label htmlFor={`deal-${k}`}>{label}</Label>
                  <Input id={`deal-${k}`} value={deal[k]} onChange={(e) => setDeal((s) => ({ ...s, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
            <Button
              disabled={!deal.account_id || !!busy}
              onClick={() =>
                run(
                  "deal_create",
                  {
                    action: "deal_create",
                    account_id: deal.account_id.trim(),
                    deal_type_id: Number(deal.deal_type_id),
                    account_template_id: deal.account_template_id || undefined,
                    product_code: deal.product_code || undefined,
                    deal_price: deal.deal_price || undefined,
                    deal_external_ref: deal.deal_external_ref || undefined,
                    deal_date: deal.deal_date || undefined,
                    device_serial: deal.device_serial || undefined,
                    asset_vin: deal.asset_vin || undefined,
                  },
                  "Deal created",
                )}
            >
              {spinner("deal_create") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create deal
            </Button>

            <Separator />

            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="deal-id">Deal ID</Label>
                  <Input id="deal-id" value={dealId} onChange={(e) => setDealId(e.target.value)} className="max-w-xs" />
                </div>
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={async () => {
                    const d = await run("deal_list", { action: "deal_list", limit: 100 }, "Deals loaded");
                    setDeals(((d?.deals as Record<string, unknown>[]) ?? []));
                  }}
                >
                  {spinner("deal_list") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  List deals
                </Button>
                <Button
                  variant="outline"
                  disabled={!dealId || !!busy}
                  onClick={async () => {
                    const d = await run("deal_show", { action: "deal_show", deal_id: dealId.trim() }, "Deal loaded");
                    setDealDetail((d?.deal as Record<string, unknown>) ?? null);
                  }}
                >
                  {spinner("deal_show") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Show deal
                </Button>
                <Button
                  variant="destructive"
                  disabled={!dealId || !!busy}
                  onClick={() => run("deal_unwind", { action: "deal_unwind", deal_id: dealId.trim() }, "Deal unwound")}
                >
                  {spinner("deal_unwind") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
                  Unwind deal
                </Button>
              </div>

              {deals.length > 0 && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Deals ({deals.length})</CardTitle>
                    <CardDescription>Click a row to load it into the deal ID field.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Deal</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>VIN</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deals.map((d, i) => (
                          <TableRow
                            key={i}
                            className="cursor-pointer"
                            onClick={() => setDealId(String(d.deal_id ?? ""))}
                          >
                            <TableCell>{String(d.deal_id ?? "—")}</TableCell>
                            <TableCell>{String(d.deal_type_description ?? d.deal_type_id ?? "—")}</TableCell>
                            <TableCell>{String(d.customer_account_description ?? "—")}</TableCell>
                            <TableCell>{String(d.asset_vin ?? "—")}</TableCell>
                            <TableCell>{String(d.deal_date ?? d.entered_on_local ?? "—")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {dealDetail && (
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(dealDetail, null, 2)}
                </pre>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ---------------- Dealer permissions ---------------- */}
        <AccordionItem value="permissions" className="rounded-lg border px-4">
          <AccordionTrigger className="text-base">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Dealer permissions check
              {perms && perms.missing.length > 0 ? (
                <Badge variant="destructive">{perms.missing.length} missing</Badge>
              ) : null}
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Probes every dealer endpoint with an empty payload — nothing is created or changed — and reports the
              exact scope GPSANDTRACK is refusing (for example <code>deal/read</code>).
            </p>
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={async () => {
                const d = await run("fleet_permissions", { action: "fleet_permissions" }, "Permission check complete");
                if (d?.ok) {
                  setPerms({
                    results: (d.results as PermissionResult[]) ?? [],
                    missing: (d.missing_scopes as string[]) ?? [],
                    summary: String(d.summary ?? ""),
                    checkedAt: String(d.checked_at ?? ""),
                  });
                }
              }}
            >
              {spinner("fleet_permissions") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Run permissions check
            </Button>

            {perms && (
              <>
                <Alert variant={perms.missing.length ? "destructive" : "default"}>
                  <AlertTitle>
                    {perms.missing.length ? `${perms.missing.length} scope(s) missing` : "All scopes enabled"}
                  </AlertTitle>
                  <AlertDescription>{perms.summary}</AlertDescription>
                </Alert>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operation</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Unlocks</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perms.results.map((r) => (
                      <TableRow key={r.scope}>
                        <TableCell>{r.label}</TableCell>
                        <TableCell><code className="text-xs">{r.missing_scope ?? r.scope}</code></TableCell>
                        <TableCell className="text-muted-foreground">{r.unlocks}</TableCell>
                        <TableCell>
                          <Badge variant={r.state === "granted" ? "outline" : "destructive"}>
                            {r.state === "granted" ? "Granted" : "Missing"}
                          </Badge>
                          <div className="mt-1 text-xs text-muted-foreground">{r.note}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {perms.checkedAt && (
                  <p className="text-xs text-muted-foreground">
                    Checked {new Date(perms.checkedAt).toLocaleString()}
                  </p>
                )}
              </>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* ---------------- Audit log ---------------- */}
        <AccordionItem value="audit" className="rounded-lg border px-4">
          <AccordionTrigger className="text-base">
            <span className="flex items-center gap-2"><HistoryIcon className="h-4 w-4" /> Fleet action audit log</span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label>Operation</Label>
                <Select value={auditAction} onValueChange={setAuditAction}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All operations</SelectItem>
                    {AUDIT_OPERATIONS.map((a) => (
                      <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Outcome</Label>
                <Select value={auditOutcome} onValueChange={setAuditOutcome}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="ok">Succeeded</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Window</Label>
                <Select value={auditDays} onValueChange={setAuditDays}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Last 24 hours</SelectItem>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={async () => {
                  const d = await run(
                    "fleet_audit_log",
                    {
                      action: "fleet_audit_log",
                      audit_action: auditAction === "all" ? undefined : auditAction,
                      audit_outcome: auditOutcome,
                      since_days: Number(auditDays),
                      limit: 100,
                    },
                    "Audit log loaded",
                  );
                  setAuditEntries(((d?.entries as AuditEntry[]) ?? []));
                }}
              >
                {spinner("fleet_audit_log") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Load audit log
              </Button>
            </div>

            {auditEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fleet-admin actions recorded for this filter.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Request</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditEntries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(e.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{e.actor_name}</div>
                        {e.actor_email && <div className="text-muted-foreground">{e.actor_email}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{e.operation.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={e.status === "succeeded" ? "outline" : "destructive"}>
                          {e.status === "succeeded" ? "Succeeded" : e.status_code}
                        </Badge>
                        <div className="mt-1 max-w-xs text-muted-foreground">
                          {e.status_detail ?? e.status_title}
                        </div>
                      </TableCell>
                      <TableCell>
                        <pre className="max-h-24 max-w-xs overflow-auto rounded bg-muted p-2 text-[10px]">
                          {JSON.stringify(e.payload, null, 2)}
                        </pre>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

    </div>
  );
}
