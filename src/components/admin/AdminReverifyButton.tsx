import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  userName?: string;
}

type SubjectRole = "driver" | "owner" | "support_staff" | "admin_assistant" | "referee" | "proxy";

export default function AdminReverifyButton({ userId, userName }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [channel, setChannel] = useState<"email" | "sms" | "both">("both");
  const [subjectRole, setSubjectRole] = useState<SubjectRole | "auto">("auto");
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("persona-send-reverification", {
      body: {
        user_id: userId,
        reason,
        channel,
        ...(subjectRole !== "auto" ? { subject_role: subjectRole } : {}),
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if ((data as any)?.error) return toast.error(String((data as any).error));
    toast.success(`Re-verification link sent to ${userName ?? "user"}`);
    setOpen(false);
    setReason("");
  }


  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ShieldAlert className="h-4 w-4 mr-1" /> Request re-verification
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request identity re-verification</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason (shown to user)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Documents nearing expiry, or details mismatch." />
            </div>
            <div>
              <Label>Send via</Label>
              <RadioGroup value={channel} onValueChange={(v) => setChannel(v as any)} className="flex gap-4 mt-2">
                <div className="flex items-center gap-2"><RadioGroupItem value="both" id="both" /><Label htmlFor="both">Email + SMS</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="email" id="email" /><Label htmlFor="email">Email</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="sms" id="sms" /><Label htmlFor="sms">SMS</Label></div>
              </RadioGroup>
            <div>
              <Label>Persona workflow (user_role)</Label>
              <Select value={subjectRole} onValueChange={(v) => setSubjectRole(v as any)}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect from user roles</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="referee">Driver's referee</SelectItem>
                  <SelectItem value="proxy">Driver's payment proxy</SelectItem>
                  <SelectItem value="admin_assistant">Admin assistant</SelectItem>
                  <SelectItem value="support_staff">Support staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={send} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Send link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
