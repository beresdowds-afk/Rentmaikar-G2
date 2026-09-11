import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Link2,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Send,
  UserCheck,
  Car,
  Phone,
  Mail,
  RefreshCw,
  Sparkles,
  Calendar,
  Pencil,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ownerPortalLinkService, OwnerPortalTokenRecord } from '@/services/ownerPortalLinkService';
import { renderPlaceholders, usedPlaceholders } from '@/lib/reply-placeholders';
import { CannedReply } from '@/hooks/useCannedReplies';
import { DEFAULT_COORDINATED_OWNER_TEMPLATES } from '@/lib/default-canned-replies';

interface OwnerOption {
  user_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  vehicles_count?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: string;
  license_plate?: string;
  pickup_location?: string;
  due_date?: string;
  amount_due?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialReply?: CannedReply | null;
  onSendViaComposer?: (params: { recipient: OwnerOption; message: string; channel: string }) => void;
}

export function ProduceOwnerMessageDialog({
  open,
  onOpenChange,
  initialReply,
  onSendViaComposer,
}: Props) {
  const [selectedChannel, setSelectedChannel] = useState<'sms' | 'email' | 'whatsapp'>('sms');
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number>(7);

  // Dynamic variable override states
  const [overrideVehicleMake, setOverrideVehicleMake] = useState<string>('');
  const [overrideVehicleModel, setOverrideVehicleModel] = useState<string>('');
  const [overrideDueDate, setOverrideDueDate] = useState<string>('');
  const [overridePlate, setOverridePlate] = useState<string>('');
  const [overridePickup, setOverridePickup] = useState<string>('');
  const [overrideAmountDue, setOverrideAmountDue] = useState<string>('');
  const [viewMode, setViewMode] = useState<'preview' | 'template'>('preview');
  const [showVariableControls, setShowVariableControls] = useState<boolean>(false);

  const customTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Generated link details
  const [currentToken, setCurrentToken] = useState<string>('');
  const [portalUrl, setPortalUrl] = useState<string>('');
  const [tokenRecord, setTokenRecord] = useState<OwnerPortalTokenRecord | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customBody, setCustomBody] = useState<string>('');

  // 1. Determine active template text
  const activeTemplate = useMemo(() => {
    if (initialReply && (initialReply.channel === selectedChannel || !initialReply.channel)) {
      return initialReply.body;
    }
    const matchingDef = DEFAULT_COORDINATED_OWNER_TEMPLATES.find(
      (t) => t.channel === selectedChannel
    );
    return matchingDef?.body || DEFAULT_COORDINATED_OWNER_TEMPLATES[0].body;
  }, [initialReply, selectedChannel]);

  // Set initial channel when dialog opens with a reply
  useEffect(() => {
    if (initialReply?.channel && ['sms', 'email', 'whatsapp'].includes(initialReply.channel)) {
      setSelectedChannel(initialReply.channel as 'sms' | 'email' | 'whatsapp');
    }
  }, [initialReply]);

  // Reset custom body when template changes
  useEffect(() => {
    setCustomBody(activeTemplate);
  }, [activeTemplate]);

  // 2. Fetch owners from database
  useEffect(() => {
    if (!open) return;
    let isSubscribed = true;

    async function loadOwners() {
      setLoadingOwners(true);
      try {
        // Query users with owner role
        const { data: roleRows } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'owner')
          .limit(100);

        const ownerUserIds = (roleRows || []).map((r) => r.user_id);
        const defaultDueDate = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        if (ownerUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, full_name, email, phone')
            .in('user_id', ownerUserIds);

          // Get vehicle counts and primary vehicle per owner
          const { data: vehicles } = await supabase
            .from('vehicles')
            .select('owner_id, make, model, year, license_plate, pickup_location, daily_rate')
            .in('owner_id', ownerUserIds);

          const countMap: Record<string, number> = {};
          const firstVehicleMap: Record<string, any> = {};
          (vehicles || []).forEach((v) => {
            countMap[v.owner_id] = (countMap[v.owner_id] || 0) + 1;
            if (!firstVehicleMap[v.owner_id]) {
              firstVehicleMap[v.owner_id] = v;
            }
          });

          const formatted: OwnerOption[] = (profiles || []).map((p) => {
            const v = firstVehicleMap[p.user_id];
            const isNg = (p.phone || '').startsWith('+234');
            const currency = isNg ? '₦' : '$';
            return {
              user_id: p.user_id,
              full_name: p.full_name || 'Unnamed Owner',
              email: p.email || undefined,
              phone: p.phone || undefined,
              vehicles_count: countMap[p.user_id] || 0,
              vehicle_make: v?.make || 'Toyota',
              vehicle_model: v?.model || 'Corolla Cross',
              vehicle_year: v?.year ? String(v.year) : '2024',
              license_plate: v?.license_plate || 'RM-5820',
              pickup_location: v?.pickup_location || 'Rentmaikar Fleet Hub',
              due_date: defaultDueDate,
              amount_due: v?.daily_rate ? `${currency}${(Number(v.daily_rate) * 7).toFixed(2)}` : `${currency}350.00`,
            };
          });

          if (isSubscribed) {
            setOwners(formatted);
            if (formatted.length > 0 && !selectedOwnerId) {
              setSelectedOwnerId(formatted[0].user_id);
            }
          }
        } else {
          // Fallback demo owners if no live DB owners yet
          const fallbackOwners: OwnerOption[] = [
            {
              user_id: 'demo-owner-1',
              full_name: 'David Adeleke',
              email: 'david.adeleke@example.com',
              phone: '+1 (555) 234-5678',
              vehicles_count: 2,
              vehicle_make: 'Toyota',
              vehicle_model: 'Corolla Cross',
              vehicle_year: '2024',
              license_plate: 'RM-5921',
              pickup_location: 'Downtown Hub, Ikeja',
              due_date: defaultDueDate,
              amount_due: '$350.00',
            },
            {
              user_id: 'demo-owner-2',
              full_name: 'Elena Rostova',
              email: 'elena.r@example.com',
              phone: '+1 (555) 876-5432',
              vehicles_count: 1,
              vehicle_make: 'Honda',
              vehicle_model: 'Civic',
              vehicle_year: '2023',
              license_plate: 'RM-3310',
              pickup_location: 'Central Depot, Austin',
              due_date: defaultDueDate,
              amount_due: '$280.00',
            },
            {
              user_id: 'demo-owner-3',
              full_name: 'Marcus Vance',
              email: 'marcus.vance@example.com',
              phone: '+1 (555) 345-9876',
              vehicles_count: 3,
              vehicle_make: 'Hyundai',
              vehicle_model: 'Elantra',
              vehicle_year: '2024',
              license_plate: 'RM-9042',
              pickup_location: 'Airport Fleet Hub',
              due_date: defaultDueDate,
              amount_due: '$420.00',
            },
          ];
          if (isSubscribed) {
            setOwners(fallbackOwners);
            if (!selectedOwnerId) setSelectedOwnerId(fallbackOwners[0].user_id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch owners:', err);
      } finally {
        if (isSubscribed) setLoadingOwners(false);
      }
    }

    loadOwners();

    return () => {
      isSubscribed = false;
    };
  }, [open]);

  const selectedOwner = useMemo(() => {
    return owners.find((o) => o.user_id === selectedOwnerId) || owners[0];
  }, [owners, selectedOwnerId]);

  // Sync override dynamic variables when selectedOwner changes
  useEffect(() => {
    if (selectedOwner) {
      setOverrideVehicleMake(selectedOwner.vehicle_make || 'Toyota');
      setOverrideVehicleModel(selectedOwner.vehicle_model || 'Camry');
      setOverrideDueDate(selectedOwner.due_date || new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
      setOverridePlate(selectedOwner.license_plate || 'RM-8820');
      setOverridePickup(selectedOwner.pickup_location || 'Rentmaikar Fleet Hub');
      setOverrideAmountDue(selectedOwner.amount_due || '$350.00');
    }
  }, [selectedOwner]);

  // 3. Generate one-time portal link whenever owner, channel, or expiration changes
  const generateNewLink = async () => {
    if (!selectedOwner) return;
    setIsGenerating(true);
    try {
      const res = await ownerPortalLinkService.generateOneTimePortalLink({
        ownerId: selectedOwner.user_id,
        ownerName: selectedOwner.full_name,
        ownerEmail: selectedOwner.email,
        ownerPhone: selectedOwner.phone,
        channel: selectedChannel,
        expiresInDays,
        targetTab: 'overview',
      });
      setCurrentToken(res.token);
      setPortalUrl(res.portalUrl);
      setTokenRecord(res.record);
      toast.success('Generated new one-time portal link');
    } catch (err) {
      toast.error('Failed to generate one-time link');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (open && selectedOwner) {
      generateNewLink();
    }
  }, [open, selectedOwnerId, selectedChannel, expiresInDays]);

  // 4. Render resolved message with placeholders filled
  const resolvedMessage = useMemo(() => {
    const templateToUse = customBody || activeTemplate;
    const vMake = overrideVehicleMake || selectedOwner?.vehicle_make || 'Toyota';
    const vModel = overrideVehicleModel || selectedOwner?.vehicle_model || 'Camry';
    const vYear = selectedOwner?.vehicle_year || '2024';
    const vPlate = overridePlate || selectedOwner?.license_plate || 'RM-8820';
    const vDue = overrideDueDate || selectedOwner?.due_date || new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const vPickup = overridePickup || selectedOwner?.pickup_location || 'Rentmaikar Fleet Hub';
    const vAmount = overrideAmountDue || selectedOwner?.amount_due || '$350.00';

    const values = {
      owner_name: selectedOwner?.full_name || 'Valued Owner',
      first_name: selectedOwner?.full_name ? selectedOwner.full_name.split(' ')[0] : 'Valued Owner',
      individual_portal_link: portalUrl || '[GENERATING PORTAL LINK...]',
      portal_link: portalUrl || '[GENERATING PORTAL LINK...]',
      recipient_name: selectedOwner?.full_name || 'Valued Owner',
      company_name: 'Rentmaikar',
      vehicle_make: vMake,
      vehicle_model: vModel,
      vehicle_year: vYear,
      vehicle_name: `${vMake} ${vModel}`,
      license_plate: vPlate,
      vehicle_plate: vPlate,
      pickup_location: vPickup,
      due_date: vDue,
      amount_due: vAmount,
      support_email: 'support@rentmaikar.com',
      support_phone: (selectedOwner?.phone || '').startsWith('+234') ? '+234 800 RENTMAIKAR' : '+1 (608) 384-3932',
    };
    return renderPlaceholders(templateToUse, values);
  }, [
    customBody,
    activeTemplate,
    selectedOwner,
    portalUrl,
    overrideVehicleMake,
    overrideVehicleModel,
    overridePlate,
    overrideDueDate,
    overridePickup,
    overrideAmountDue,
  ]);

  const handleInsertVarIntoCustomBody = (token: string) => {
    const el = customTextareaRef.current;
    if (!el) {
      setCustomBody((prev) => `${prev} ${token}`);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const val = el.value || '';
    const next = val.slice(0, start) + token + val.slice(end);
    setCustomBody(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  // Copy helpers
  const handleCopyMessage = () => {
    navigator.clipboard.writeText(resolvedMessage);
    setCopiedMsg(true);
    toast.success('Message copied to clipboard');
    setTimeout(() => setCopiedMsg(false), 2000);
  };

  const handleCopyLink = () => {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl);
    setCopiedLink(true);
    toast.success('One-time link copied');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleTestLink = () => {
    if (!portalUrl) return;
    window.open(portalUrl, '_blank');
  };

  const handleSendViaComposer = () => {
    if (!selectedOwner) return;
    if (onSendViaComposer) {
      onSendViaComposer({
        recipient: selectedOwner,
        message: resolvedMessage,
        channel: selectedChannel,
      });
      onOpenChange(false);
    } else {
      handleCopyMessage();
    }
  };

  // SMS metrics
  const charCount = resolvedMessage.length;
  const smsSegments = Math.ceil(charCount / 153) || 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                Produce Message with One-Time Owner Portal Link
              </DialogTitle>
              <DialogDescription className="text-xs">
                Creates a single-use access link for the selected owner and injects it into the compliant template.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Channel Selector */}
          <div className="flex items-center justify-between gap-2 border-b pb-3">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Channel Template
              </Label>
              <p className="text-xs text-muted-foreground">
                Select between coordinated SMS, Email, and WhatsApp variants.
              </p>
            </div>
            <Tabs
              value={selectedChannel}
              onValueChange={(val) => setSelectedChannel(val as 'sms' | 'email' | 'whatsapp')}
            >
              <TabsList className="h-9">
                <TabsTrigger value="sms" className="text-xs">
                  SMS (10DLC)
                </TabsTrigger>
                <TabsTrigger value="email" className="text-xs">
                  Email
                </TabsTrigger>
                <TabsTrigger value="whatsapp" className="text-xs">
                  WhatsApp
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Owner Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-muted/40 rounded-xl border">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-primary" />
                Select Recipient Owner
              </Label>
              <Select value={selectedOwnerId} onValueChange={setSelectedOwnerId}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={loadingOwners ? 'Loading owners...' : 'Select an owner'} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {owners.map((owner) => (
                    <SelectItem key={owner.user_id} value={owner.user_id}>
                      <div className="flex items-center justify-between gap-3 text-xs w-full">
                        <span className="font-medium text-foreground">{owner.full_name}</span>
                        <span className="text-muted-foreground">
                          {owner.vehicles_count ? `${owner.vehicles_count} vehicle(s)` : 'No vehicles yet'}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Link Expiry</Label>
              <Select
                value={String(expiresInDays)}
                onValueChange={(v) => setExpiresInDays(Number(v))}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Day</SelectItem>
                  <SelectItem value="3">3 Days</SelectItem>
                  <SelectItem value="7">7 Days (Recommended)</SelectItem>
                  <SelectItem value="14">14 Days</SelectItem>
                  <SelectItem value="30">30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedOwner && (
              <div className="sm:col-span-3 space-y-2 pt-2 border-t border-border/50">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                    {selectedOwner.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-emerald-600" />
                        {selectedOwner.phone}
                      </span>
                    )}
                    {selectedOwner.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3 text-sky-600" />
                        {selectedOwner.email}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Car className="h-3 w-3 text-amber-600" />
                      {overrideVehicleMake} {overrideVehicleModel} ({overridePlate})
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-primary" />
                      Due: {overrideDueDate}
                    </span>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-primary hover:text-primary gap-1"
                    onClick={() => setShowVariableControls(!showVariableControls)}
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    {showVariableControls ? 'Hide Variable Values' : 'Inspect / Override Dynamic Values'}
                  </Button>
                </div>

                {/* Variable Values Controls */}
                {showVariableControls && (
                  <div className="p-3 bg-background/80 rounded-lg border space-y-2.5 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        Active Dynamic Variable Values (Auto-populated from Fleet Records):
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Values will replace tokens in the dispatched message
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <Label className="text-[11px] text-muted-foreground font-mono">[VEHICLE_MAKE]</Label>
                        <Input
                          value={overrideVehicleMake}
                          onChange={(e) => setOverrideVehicleMake(e.target.value)}
                          className="h-7 text-xs mt-0.5"
                          placeholder="e.g. Toyota"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground font-mono">[VEHICLE_MODEL]</Label>
                        <Input
                          value={overrideVehicleModel}
                          onChange={(e) => setOverrideVehicleModel(e.target.value)}
                          className="h-7 text-xs mt-0.5"
                          placeholder="e.g. Camry"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground font-mono">[DUE_DATE]</Label>
                        <Input
                          value={overrideDueDate}
                          onChange={(e) => setOverrideDueDate(e.target.value)}
                          className="h-7 text-xs mt-0.5"
                          placeholder="e.g. Sep 17, 2026"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground font-mono">[LICENSE_PLATE]</Label>
                        <Input
                          value={overridePlate}
                          onChange={(e) => setOverridePlate(e.target.value)}
                          className="h-7 text-xs mt-0.5"
                          placeholder="e.g. RM-5820"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground font-mono">[PICKUP_LOCATION]</Label>
                        <Input
                          value={overridePickup}
                          onChange={(e) => setOverridePickup(e.target.value)}
                          className="h-7 text-xs mt-0.5"
                          placeholder="e.g. Rentmaikar Fleet Hub"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground font-mono">[AMOUNT_DUE]</Label>
                        <Input
                          value={overrideAmountDue}
                          onChange={(e) => setOverrideAmountDue(e.target.value)}
                          className="h-7 text-xs mt-0.5"
                          placeholder="e.g. $350.00"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* One-Time Link Token Info */}
          <div className="rounded-xl border bg-card p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold text-foreground">
                  Individual One-Time Portal Link
                </span>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                  Single-Use Protected
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={generateNewLink}
                disabled={isGenerating}
              >
                <RefreshCw className={`h-3 w-3 ${isGenerating ? 'animate-spin' : ''}`} />
                Regenerate
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={portalUrl || 'Generating link...'}
                className="font-mono text-xs bg-muted/50 select-all"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 px-3 flex-shrink-0"
                onClick={handleCopyLink}
              >
                {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedLink ? 'Copied' : 'Copy Link'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-9 gap-1.5 px-3 flex-shrink-0"
                onClick={handleTestLink}
                title="Open and verify the owner dashboard view"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Test
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Directs owner to their Rentmaikar Dashboard to complete missing vehicle details, pickup locations, and withdrawal phone verification. Invalids automatically after 1 access.
            </p>
          </div>

          {/* Live Message Preview & Template Editor */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant={viewMode === 'preview' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setViewMode('preview')}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Resolved Preview
                </Button>
                <Button
                  type="button"
                  variant={viewMode === 'template' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setViewMode('template')}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Template & Variables
                </Button>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{charCount} characters</span>
                {selectedChannel === 'sms' && (
                  <Badge variant="secondary" className="text-[10px]">
                    {smsSegments} SMS {smsSegments === 1 ? 'part' : 'segments'}
                  </Badge>
                )}
              </div>
            </div>

            {viewMode === 'preview' ? (
              <div className="space-y-1.5">
                <Textarea
                  rows={selectedChannel === 'email' ? 10 : 6}
                  value={resolvedMessage}
                  readOnly
                  className="font-sans text-xs sm:text-sm bg-muted/20 resize-y leading-relaxed"
                />
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" />
                    All dynamic variables resolved:
                  </span>
                  {usedPlaceholders(customBody || activeTemplate).map((tok) => (
                    <Badge
                      key={tok}
                      variant="outline"
                      className="text-[10px] font-mono px-1.5 py-0 border bg-background"
                    >
                      [{tok.toUpperCase()}]
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <Textarea
                  ref={customTextareaRef}
                  rows={selectedChannel === 'email' ? 10 : 6}
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                  className="font-mono text-xs bg-background resize-y leading-relaxed"
                  placeholder="Type or insert tokens like [VEHICLE_MAKE], [VEHICLE_MODEL], [DUE_DATE]..."
                />

                {/* Quick Variable Insertion Chips */}
                <div className="p-2.5 bg-muted/40 rounded-lg border space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Insert Dynamic Variables at Cursor:
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => setCustomBody(activeTemplate)}
                    >
                      Reset to Default Template
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { token: '[VEHICLE_MAKE]', label: 'Make' },
                      { token: '[VEHICLE_MODEL]', label: 'Model' },
                      { token: '[DUE_DATE]', label: 'Due Date' },
                      { token: '[LICENSE_PLATE]', label: 'Plate' },
                      { token: '[PICKUP_LOCATION]', label: 'Pickup' },
                      { token: '[AMOUNT_DUE]', label: 'Amount Due' },
                      { token: '[INDIVIDUAL PORTAL LINK]', label: 'One-Time Link' },
                      { token: '[OWNER NAME]', label: 'Owner Name' },
                      { token: '[FIRST_NAME]', label: 'First Name' },
                    ].map((item) => (
                      <Button
                        key={item.token}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px] font-mono bg-background hover:bg-primary/10 hover:text-primary hover:border-primary/40"
                        onClick={() => handleInsertVarIntoCustomBody(item.token)}
                        title={`Click to insert ${item.token}`}
                      >
                        + {item.token}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Security & Compliance Checklist */}
          <Alert className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs py-2.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-muted-foreground">
              <strong>Compliance Notice:</strong> This message uses official 10DLC service/account classification. It includes mandatory security disclaimers, individual single-use authentication, and disregard instructions.
            </AlertDescription>
          </Alert>

          {/* Bottom Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="gap-1.5 text-xs"
                onClick={handleCopyMessage}
              >
                {copiedMsg ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedMsg ? 'Message Copied!' : 'Copy Full Message'}
              </Button>
              <Button
                className="gap-1.5 text-xs"
                onClick={handleSendViaComposer}
              >
                <Send className="h-3.5 w-3.5" />
                {onSendViaComposer ? 'Open in Composer' : 'Copy for Dispatch'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ProduceOwnerMessageDialog;
