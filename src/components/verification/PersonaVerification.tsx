import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

import { Shield, Loader2, CheckCircle2, IdCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRegion } from "@/contexts/RegionContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import PersonaFieldsFallbackDialog, { type PersonaFieldKey, type PersonaFallbackValues } from "./PersonaFieldsFallbackDialog";
import { UploadDropZone } from "@/components/ui/upload-drop-zone";
import VerificationFailureCard from "./VerificationFailureCard";
import { classifyVerificationFailure, type ClassifiedFailure } from "@/lib/verification-failures";
import { logVerificationEvent, newCorrelationId, reportVerificationFailure } from "@/lib/verification-logger";
import { withRetry } from "@/lib/verification-retry";
import { runPreflight } from "@/lib/verification-preflight";
import { saveVerificationSession, clearVerificationSession } from "@/hooks/useVerificationResume";
import { usePersonaEnabled } from "@/hooks/usePersonaEnabled";
import { usePersonaIdPolicy } from "@/hooks/usePersonaIdClasses";



interface Props {
  subject?: "self" | "referee";
  subjectRole?: "driver" | "referee" | "owner" | "support_staff" | "admin_assistant" | "proxy";
  subjectRef?: string;
  fields?: Record<string, string>;
  onComplete?: (inquiryId: string | null) => void;
  buttonLabel?: string;
  
}

function splitName(full?: string | null): { name_first?: string; name_last?: string } {
  if (!full) return {};
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { name_first: parts[0] };
  return { name_first: parts.slice(0, -1).join(" "), name_last: parts.slice(-1)[0] };
}

const PERSONA_SDK_URL = "https://cdn.withpersona.com/dist/persona-v5.5.0.js";
const PERSONA_SDK_INTEGRITY =
  "sha384-UK+a2yEU9KOzEmsgI4IlkrXWE4AekM/iAgWF60Zuyule702g7qaQ2nYccO3tnT0A";

function loadPersonaSdk(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).Persona) return resolve((window as any).Persona);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PERSONA_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).Persona));
      existing.addEventListener("error", reject);
      return;
    }
    const s = document.createElement("script");
    s.src = PERSONA_SDK_URL;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.integrity = PERSONA_SDK_INTEGRITY;
    s.onload = () => resolve((window as any).Persona);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/** Launches an embedded Persona identity verification session. Region-aware. */
export default function PersonaVerification({
  subject = "self",
  subjectRole,
  subjectRef,
  fields,
  onComplete,
  buttonLabel,
}: Props) {
  const { country } = useRegion();
  const { user } = useAuth();
  const personaSwitch = usePersonaEnabled();

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [missingFields, setMissingFields] = useState<PersonaFieldKey[]>([]);
  const [pendingFields, setPendingFields] = useState<Record<string, string>>({});
  const [dlDocId, setDlDocId] = useState<string | null>(null);
  const [dlChecking, setDlChecking] = useState(false);
  const [failure, setFailure] = useState<ClassifiedFailure | null>(null);
  const [lastFields, setLastFields] = useState<Record<string, string> | null>(null);
  const [chosenIdClass, setChosenIdClass] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);

  // Persona verifies a government-issued photo ID only. The accepted set is
  // admin-configurable per region and role (persona_id_class_rules), with the
  // built-in policy as the fallback.
  const { policy, isLoading: policyLoading } = usePersonaIdPolicy(subjectRole, country);
  const requiresDriversLicense = policy.requiresDriversLicence;
  const acceptedIds = policy.options;

  useEffect(() => {
    setChosenIdClass((prev) =>
      prev && acceptedIds.some((o) => o.code === prev) ? prev : acceptedIds[0]?.code ?? null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(acceptedIds)]);

  /** Append-only audit row for each verification attempt. */
  async function recordAttempt(patch: Record<string, unknown>): Promise<string | null> {
    if (!user) return null;
    const { data, error } = await supabase
      .from("persona_verification_attempts")
      .insert({
        user_id: user.id,
        subject_role: subjectRole ?? null,
        subject_type: subject,
        region: country ?? null,
        offered_id_classes: acceptedIds as any,
        chosen_id_class: chosenIdClass,
        ...patch,
      } as any)
      .select("id")
      .single();
    if (error) { console.warn("[persona] attempt log failed", error.message); return null; }
    return (data as any)?.id ?? null;
  }

  async function updateAttempt(id: string | null, patch: Record<string, unknown>) {
    if (!id) return;
    await supabase.from("persona_verification_attempts").update(patch as any).eq("id", id);
  }



  useEffect(() => { loadPersonaSdk().catch(() => {/* fallback to hosted */}); }, []);

  // Check whether a driver's license has already been uploaded by this user.
  useEffect(() => {
    if (!requiresDriversLicense || !user) return;
    let cancelled = false;
    (async () => {
      setDlChecking(true);
      const { data } = await supabase
        .from("user_documents")
        .select("id")
        .eq("user_id", user.id)
        .eq("document_type", "drivers_license")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setDlDocId((data as any)?.id ?? null);
        setDlChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [requiresDriversLicense, user]);

  async function resolveFields(): Promise<Record<string, string>> {
    if (fields && Object.keys(fields).length > 0) return fields;
    if (!user) return {};
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("user_id", user.id)
      .maybeSingle();
    const { name_first, name_last } = splitName(profile?.full_name ?? (user.user_metadata as any)?.full_name);
    const out: Record<string, string> = {};
    if (name_first) out.name_first = name_first;
    if (name_last) out.name_last = name_last;
    const email = profile?.email ?? user.email ?? undefined;
    if (email) out.email = email;
    const phone = profile?.phone ?? user.phone ?? undefined;
    if (phone) out.phone = phone;
    return out;
  }

  const REQUIRED: PersonaFieldKey[] = ["name_first", "name_last", "email"];

  async function launchInquiry(finalFields: Record<string, string>) {
    setLoading(true);
    setFailure(null);
    const correlationId = newCorrelationId();
    setLastFields(finalFields);
    const attempt = await recordAttempt({ status: "started", correlation_id: correlationId });
    setAttemptId(attempt);
    try {
      // Device/browser pre-flight: catch denied cameras, blocked storage and
      // offline devices before burning a Persona inquiry.
      const preflight = await runPreflight({ requireCamera: true, skipClockCheck: true });
      if (!preflight.ok) {
        const blocker = preflight.blocking[0];
        const classified = { ...blocker, raw: blocker.detail ?? blocker.code, correlationId };
        setFailure(classified);
        await logVerificationEvent({
          stage: "identity", step: "preflight", outcome: "failed",
          provider: "persona", failure: classified, correlationId,
        });
        await updateAttempt(attempt, {
          status: "failed", error_code: blocker.code,
          error_detail: String(blocker.detail ?? "preflight blocked").slice(0, 400),
          completed_at: new Date().toISOString(),
        });
        setLoading(false);
        return;
      }

      await logVerificationEvent({
        stage: "identity", step: "create_inquiry", outcome: "started", provider: "persona",
        correlationId, context: { subject, subjectRole, region: country },
      });

      // Transient provider/network failures retry automatically with backoff.
      const data = await withRetry(async () => {
        const { data, error } = await supabase.functions.invoke("persona-create-inquiry", {
          body: {
            subject_type: subject,
            subject_role: subjectRole,
            subject_ref: subjectRef,
            region: country,
            fields: finalFields,
            correlation_id: correlationId,
            chosen_id_class: chosenIdClass ?? undefined,
            drivers_license_document_id: requiresDriversLicense ? dlDocId : undefined,
          },
          headers: { "x-correlation-id": correlationId },
        });
        if (error) throw error;
        return data;
      }, { stage: "identity", step: "create_inquiry", provider: "persona", correlationId });


      if (data?.provider_configured === false) {
        toast.info("Verification queued — provider will be enabled soon");
        await updateAttempt(attempt, { status: "failed", error_code: "provider_not_configured" });
        onComplete?.(null);
        return;
      }

      const inquiryId: string | null = data?.inquiry_id ?? data?.inquiry?.inquiry_id ?? null;
      const sessionToken: string | null = data?.session_token ?? null;
      const envId: string | null = data?.environment_id ?? null;
      const hostedUrl: string | undefined = data?.hosted_url;

      await updateAttempt(attempt, {
        status: "launched",
        inquiry_id: inquiryId,
        template_id: data?.template_id ?? null,
      });

      // Persist a resume marker so a refresh / closed tab / backgrounded app
      // continues the same inquiry instead of restarting from scratch.
      saveVerificationSession({
        inquiryId, sessionToken, environmentId: envId, hostedUrl: hostedUrl ?? null,
        subjectRole: subjectRole ?? null, region: country ?? null,
        correlationId, startedAt: new Date().toISOString(), lastStep: "created",
      });

      const Persona = await loadPersonaSdk().catch(() => null);
      if (Persona && inquiryId) {
        const client = new Persona.Client({
          inquiryId,
          sessionToken: sessionToken ?? undefined,
          environmentId: envId ?? undefined,
          onReady: () => client.open(),
          onComplete: ({ inquiryId: id, status }: any) => {
            setDone(true);
            clearVerificationSession();
            void logVerificationEvent({
              stage: "identity", step: "inquiry_complete", outcome: "succeeded",
              provider: "persona", correlationId, context: { inquiry_id: id ?? inquiryId, status },
            });
            void updateAttempt(attempt, {
              status: "completed", result: status ?? "completed",
              inquiry_id: id ?? inquiryId, completed_at: new Date().toISOString(),
            });
            toast.success(`Verification submitted (${status})`);
            onComplete?.(id ?? inquiryId);
          },
          onCancel: () => {
            const classified = classifyVerificationFailure("user_cancelled", { correlationId });
            setFailure(classified);
            void logVerificationEvent({
              stage: "identity", step: "inquiry_cancelled", outcome: "failed",
              provider: "persona", failure: classified, correlationId,
            });
            void updateAttempt(attempt, {
              status: "cancelled", result: "user_cancelled",
              completed_at: new Date().toISOString(),
            });
          },
          onError: (e: any) => {
            const classified = classifyVerificationFailure(e, { correlationId });
            setFailure(classified);
            void logVerificationEvent({
              stage: "identity", step: "sdk_error", outcome: "failed",
              provider: "persona", failure: classified, correlationId,
            });
            void updateAttempt(attempt, {
              status: "failed", error_code: classified?.code ?? "sdk_error",
              error_detail: String(e?.message ?? e).slice(0, 400),
              completed_at: new Date().toISOString(),
            });
            if (hostedUrl) window.open(hostedUrl, "_blank", "noopener,noreferrer");
          },
        });
      } else if (hostedUrl) {
        window.open(hostedUrl, "_blank", "noopener,noreferrer");
        toast.success("Verification opened in a new tab");
        onComplete?.(inquiryId);
      }
    } catch (e: any) {
      const classified = e?.failure ?? (await reportVerificationFailure(e, {
        stage: "identity", step: "create_inquiry", provider: "persona", correlationId,
      }));
      setFailure(classified);
      await updateAttempt(attempt, {
        status: "failed", error_code: classified?.code ?? "create_inquiry_failed",
        error_detail: String(e?.message ?? e).slice(0, 400),
        completed_at: new Date().toISOString(),
      });
    } finally {

      setLoading(false);
    }
  }


  async function notifyPending(phone: string | undefined, channels: { sms: boolean; whatsapp: boolean }) {
    if (!phone || (!channels.sms && !channels.whatsapp)) return;
    try {
      await supabase.functions.invoke("send-sms-notification", {
        body: {
          to: phone,
          type: "verification_code",
          message: "Your Rentmaikar identity verification is in progress. We'll notify you when it's complete.",
          channels: [
            ...(channels.sms ? ["sms"] : []),
            ...(channels.whatsapp ? ["whatsapp"] : []),
          ],
        },
      });
    } catch (e) {
      console.warn("[persona] notify failed", e);
    }
  }

  async function start() {
    if (requiresDriversLicense && !dlDocId) {
      toast.error("Please upload your driver's license before starting verification.");
      return;
    }
    setLoading(true);
    try {
      const resolved = await resolveFields();
      const missing = REQUIRED.filter((k) => !(resolved as any)[k]);
      if (missing.length > 0) {
        setPendingFields(resolved);
        setMissingFields(missing);
        setFallbackOpen(true);
        setLoading(false);
        return;
      }
      await launchInquiry(resolved);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start verification");
      setLoading(false);
    }
  }

  async function handleFallbackConfirm(v: PersonaFallbackValues) {
    setFallbackOpen(false);
    const merged = { ...pendingFields, ...Object.fromEntries(Object.entries(v.fields).filter(([, val]) => !!val)) };
    await notifyPending(merged.phone, v.notify);
    await launchInquiry(merged as Record<string, string>);
  }

  // Platform switch is off: identity verification is not required right now.
  if (!personaSwitch.isLoading && !personaSwitch.enabled) {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertDescription>
          Identity verification is currently not required. You can continue without it.
        </AlertDescription>
      </Alert>
    );
  }

  if (done) {

    return (
      <Button variant="outline" disabled className="gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600" /> Verification submitted
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      {!requiresDriversLicense && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <IdCard className="h-4 w-4" />
            Accepted government IDs for your role and region
            {country && <Badge variant="outline" className="ml-1">{country}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {policyLoading
              ? "Loading the accepted document list…"
              : "We only verify a valid government-issued photo ID. Choose the document you will present:"}
          </p>
          <ul className="text-xs text-muted-foreground list-disc pl-5">
            {acceptedIds.map((o) => <li key={o.code}>{o.label}</li>)}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            {acceptedIds.map((o) => (
              <button
                key={o.code}
                type="button"
                onClick={() => setChosenIdClass(o.code)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  chosenIdClass === o.code
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}


      {requiresDriversLicense && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <IdCard className="h-4 w-4" />
            Driver's licence (the only accepted ID for drivers)
          </div>
          <p className="text-xs text-muted-foreground">
            Drivers must verify with a valid government-issued driver's licence.
            No other document type is accepted for this role.
          </p>

          {dlChecking ? (
            <p className="text-xs text-muted-foreground">Checking uploaded documents…</p>
          ) : dlDocId ? (
            <Alert className="border-green-200 bg-green-50 py-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 text-xs">
                Driver's license on file. You can start verification.
              </AlertDescription>
            </Alert>
          ) : (
            user && (
              <UploadDropZone
                accept="image/*,application/pdf"
                maxSizeMB={10}
                isUploading={dlChecking}
                label="Upload driver's license"
                onFileSelected={async (file: File) => {
                  setDlChecking(true);
                  try {
                    const ext = file.name.split(".").pop() || "bin";
                    const path = `${user.id}/drivers_license/${Date.now()}.${ext}`;
                    const up = await supabase.storage
                      .from("user-documents")
                      .upload(path, file, { upsert: false, contentType: file.type });
                    if (up.error) throw up.error;
                    const { data: doc, error: insErr } = await supabase
                      .from("user_documents")
                      .insert({
                        user_id: user.id,
                        document_type: "drivers_license",
                        file_name: file.name,
                        file_path: path,
                        file_size: file.size,
                        mime_type: file.type,
                      } as any)
                      .select("id")
                      .single();
                    if (insErr) throw insErr;
                    setDlDocId((doc as any).id);
                    toast.success("Driver's license uploaded");
                  } catch (e: any) {
                    toast.error(e?.message ?? "Upload failed");
                  } finally {
                    setDlChecking(false);
                  }
                }}
              />
            )
          )}

        </div>
      )}

      {failure && (
        <VerificationFailureCard
          failure={failure}
          busy={loading}
          onAction={
            failure.action === "contact_support" || failure.action === "wait_for_review"
              ? undefined
              : () => { void launchInquiry(lastFields ?? {}); }
          }
        />
      )}

      <Button
        onClick={start}
        disabled={loading || (requiresDriversLicense && !dlDocId)}
        variant="default"
      >
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
        {buttonLabel ?? "Verify identity with Persona"}
      </Button>

      <PersonaFieldsFallbackDialog
        open={fallbackOpen}
        onOpenChange={setFallbackOpen}
        missing={missingFields}
        initial={pendingFields as any}
        onConfirm={handleFallbackConfirm}
      />
    </div>
  );
}
