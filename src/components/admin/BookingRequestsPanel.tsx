import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, Loader2, Send, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAdminBookingRequests,
  useSendBookingOffer,
  useReviewBookingRequest,
  type BookingRequestRow,
  type BookingRequestStatus,
} from "@/hooks/useBookingRequests";

const statusStyles: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  offer_sent: "bg-primary/10 text-primary border-primary/20",
  accepted: "bg-success/10 text-success border-success/20",
  declined: "bg-destructive/10 text-destructive border-destructive/20",
  withdrawn: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const BookingRequestsPanel = () => {
  const [status, setStatus] = useState<"all" | BookingRequestStatus>("all");
  const { data: requests, isLoading } = useAdminBookingRequests(status);
  const sendOffer = useSendBookingOffer();
  const review = useReviewBookingRequest();

  const [offerFor, setOfferFor] = useState<BookingRequestRow | null>(null);
  const [rate, setRate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const vehicleIds = useMemo(
    () => Array.from(new Set((requests ?? []).map((r) => r.vehicle_id))),
    [requests],
  );
  const driverIds = useMemo(
    () => Array.from(new Set((requests ?? []).map((r) => r.driver_id))),
    [requests],
  );

  const { data: vehicles } = useQuery({
    queryKey: ["booking-request-vehicles", vehicleIds],
    enabled: vehicleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, make, model, year, pickup_city")
        .in("id", vehicleIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ["booking-request-drivers", driverIds],
    enabled: driverIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", driverIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const vehicleLabel = (id: string) => {
    const v = (vehicles ?? []).find((x: any) => x.id === id);
    return v ? `${v.year ?? ""} ${v.make} ${v.model}`.trim() : id.slice(0, 8);
  };
  const driverLabel = (id: string) => {
    const d = (drivers ?? []).find((x: any) => x.user_id === id);
    return d?.full_name || d?.email || id.slice(0, 8);
  };

  const openOffer = (r: BookingRequestRow) => {
    setOfferFor(r);
    setRate(r.offered_rate ? String(r.offered_rate) : "");
    setCurrency(r.offer_currency || (r.region === "Nigeria" ? "NGN" : "USD"));
    setNote(r.offer_note ?? "");
    setExpiresAt("");
  };

  const submitOffer = async () => {
    if (!offerFor) return;
    const value = Number(rate);
    if (!value || value <= 0) {
      toast.error("Enter an offer rate greater than zero");
      return;
    }
    try {
      await sendOffer.mutateAsync({
        requestId: offerFor.id,
        rate: value,
        currency,
        note: note.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      toast.success("Offer sent to the driver");
      setOfferFor(null);
    } catch (e: any) {
      toast.error("Could not send offer", { description: e?.message });
    }
  };

  const handleReview = async (r: BookingRequestRow, next: "declined" | "accepted") => {
    try {
      await review.mutateAsync({ requestId: r.id, status: next });
      toast.success(next === "accepted" ? "Request marked accepted" : "Request declined");
    } catch (e: any) {
      toast.error("Could not update request", { description: e?.message });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" /> Booking requests
          {requests && <Badge variant="secondary">{requests.length}</Badge>}
        </CardTitle>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="offer_sent">Offer sent</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Offer</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(requests ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{vehicleLabel(r.vehicle_id)}</TableCell>
                    <TableCell>{driverLabel(r.driver_id)}</TableCell>
                    <TableCell className="text-sm">
                      {r.start_date} → {r.end_date}
                    </TableCell>
                    <TableCell>{r.region ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusStyles[r.status]}>
                        {r.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.offered_rate ? `${r.offer_currency ?? ""} ${Number(r.offered_rate).toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-2 whitespace-nowrap">
                      {(r.status === "pending" || r.status === "offer_sent") && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => openOffer(r)}>
                            <Send className="h-3 w-3" /> {r.status === "offer_sent" ? "Update offer" : "Send offer"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleReview(r, "declined")}>
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      {r.status === "offer_sent" && (
                        <Button size="sm" variant="ghost" onClick={() => handleReview(r, "accepted")}>
                          <CheckCircle2 className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!(requests ?? []).length && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      No booking requests yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={Boolean(offerFor)} onOpenChange={(o) => !o && setOfferFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send a curated offer</DialogTitle>
            <DialogDescription>
              {offerFor
                ? `${vehicleLabel(offerFor.vehicle_id)} • ${driverLabel(offerFor.driver_id)} • ${offerFor.start_date} → ${offerFor.end_date}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="offer-rate">Weekly rate</Label>
                <Input id="offer-rate" type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="offer-currency">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="offer-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="NGN">NGN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-expiry">Offer expires (optional)</Label>
              <Input id="offer-expiry" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-note">Note to driver (optional)</Label>
              <Textarea id="offer-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferFor(null)}>
              Cancel
            </Button>
            <Button onClick={submitOffer} disabled={sendOffer.isPending}>
              {sendOffer.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Send offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default BookingRequestsPanel;
