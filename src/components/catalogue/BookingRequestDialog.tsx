import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, CalendarRange } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import { useRegion } from "@/contexts/RegionContext";
import { useSubmitBookingRequest } from "@/hooks/useBookingRequests";
import { rememberReturnTo } from "@/lib/return-to";
import {
  useVehicleAvailability,
  describeBookingError,
  formatConflicts,
} from "@/hooks/useVehicleAvailability";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: { id: string; make: string; model: string; year?: number | null; location?: string } | null;
  /** Weekly price shown for context. */
  price?: number;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const BookingRequestDialog = ({ open, onOpenChange, vehicle, price }: Props) => {
  const { user, userRole, isRoleLoading } = useAuth();
  const { country, currencySymbol } = useRegion();
  const navigate = useNavigate();
  const submit = useSubmitBookingRequest();

  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState("");

  const availability = useVehicleAvailability(
    vehicle?.id,
    startDate,
    endDate,
    open && Boolean(user),
  );
  const unavailable = availability.data && !availability.data.available;

  const canBook = Boolean(user) && (userRole === "driver" || userRole === "admin");

  const days = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const diff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000;
    return diff >= 0 ? Math.round(diff) + 1 : 0;
  }, [startDate, endDate]);

  const goToSignIn = () => {
    rememberReturnTo(window.location.pathname + window.location.search);
    onOpenChange(false);
    navigate("/auth");
  };

  const handleSubmit = async () => {
    if (!vehicle) return;
    if (!startDate || !endDate) {
      toast.error("Choose both a start and an end date");
      return;
    }
    if (days <= 0) {
      toast.error("The end date must be on or after the start date");
      return;
    }
    if (unavailable) {
      toast.error("Those dates aren't available", {
        description: "Another booking already covers part of this period. Please choose different dates.",
      });
      return;
    }
    try {
      await submit.mutateAsync({
        vehicleId: vehicle.id,
        startDate,
        endDate,
        message: message.trim() || undefined,
        region: country,
      });
      toast.success("Booking request sent", {
        description: "Our team will review it and send you a curated offer.",
      });
      setMessage("");
      setEndDate("");
      onOpenChange(false);
    } catch (e: any) {
      availability.refetch();
      toast.error("Could not send request", { description: describeBookingError(e?.message) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" /> Request to book
          </DialogTitle>
          <DialogDescription>
            {vehicle ? `${vehicle.year ?? ""} ${vehicle.make} ${vehicle.model}`.trim() : "Select a vehicle"}
            {vehicle?.location ? ` • ${vehicle.location}` : ""}
            {typeof price === "number" ? ` • ${currencySymbol}${price.toLocaleString()}/week` : ""}
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Sign in as a registered driver to request this vehicle. You will come straight back to this listing.
              </AlertDescription>
            </Alert>
            <Button className="w-full" onClick={goToSignIn}>
              Sign in to continue
            </Button>
          </div>
        ) : !isRoleLoading && !canBook ? (
          <Alert>
            <AlertDescription>
              Booking requests are available to driver accounts. Your account is registered as{" "}
              <strong>{userRole ?? "unassigned"}</strong>, so please contact support if you need driver access.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="booking-start">Start date</Label>
                <Input
                  id="booking-start"
                  type="date"
                  min={todayIso()}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="booking-end">End date</Label>
                <Input
                  id="booking-end"
                  type="date"
                  min={startDate || todayIso()}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {days > 0 && !unavailable && (
              <p className="text-xs text-muted-foreground">
                {availability.isFetching
                  ? "Checking availability…"
                  : `${days} day${days === 1 ? "" : "s"} requested${
                      availability.data?.available ? " • these dates are available" : ""
                    }.`}
              </p>
            )}

            {unavailable && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  These dates aren&apos;t available for this vehicle. Already booked:{" "}
                  {formatConflicts(availability.data?.conflicts ?? []) || "another request covers this period"}.
                  Please choose different dates.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="booking-message">Message to the team (optional)</Label>
              <Textarea
                id="booking-message"
                maxLength={500}
                placeholder="Anything we should know about your rideshare plans or pickup preference?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                Rentmaikar reviews every request and replies with a curated offer. No payment is taken now.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {user && canBook && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submit.isPending || Boolean(unavailable) || availability.isFetching}>
              {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send request
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BookingRequestDialog;
