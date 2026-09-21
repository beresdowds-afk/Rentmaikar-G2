import React, { useState, useEffect } from 'react';
import { Phone, Users, ShieldCheck, Search, Loader2, Sparkles, AlertCircle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVoIPCalls } from '@/hooks/useVoIPCalls';
import { useRegion } from '@/contexts/RegionContext';
import { COUNTRY_CODES, validatePhoneNumber, formatPhoneForDisplay } from '@/types/voip';
import type { CallRegion, CallType } from '@/types/voip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCommunicationsHub } from './CommunicationsHubContext';
import { HubActiveCallHUD } from './HubActiveCallHUD';

interface ContactQuickPick {
  userId: string;
  name: string;
  phone: string;
  role: string;
}

export const HubCallDialer: React.FC = () => {
  const { country } = useRegion();
  const { prefillRecipient, clearPrefill, activeCall, setActiveCall, openMessageEditor } = useCommunicationsHub();
  const { initiateCall, endCall, activeCall: hookActiveCall } = useVoIPCalls();

  const [region, setRegion] = useState<CallRegion>(
    country === 'Nigeria' ? 'Nigeria' : 'USA'
  );
  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isCalling, setIsCalling] = useState(false);

  // Quick directory lookup
  const [quickQuery, setQuickQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContactQuickPick[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Apply prefill if passed from context
  useEffect(() => {
    if (prefillRecipient) {
      if (prefillRecipient.phone) {
        setPhoneNumber(prefillRecipient.phone);
      }
      if (prefillRecipient.name) {
        setDisplayName(prefillRecipient.name);
      }
      // Auto-detect region if possible
      if (prefillRecipient.phone?.startsWith('+234')) {
        setRegion('Nigeria');
      } else if (prefillRecipient.phone?.startsWith('+1')) {
        setRegion('USA');
      }
    }
  }, [prefillRecipient]);

  // Keep live call state synchronized
  useEffect(() => {
    if (hookActiveCall) {
      setActiveCall(hookActiveCall);
    }
  }, [hookActiveCall, setActiveCall]);

  // Quick user search
  useEffect(() => {
    if (quickQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, phone')
          .or(`full_name.ilike.%${quickQuery}%,phone.ilike.%${quickQuery}%,email.ilike.%${quickQuery}%`)
          .limit(6);

        if (error) throw error;

        const userIds = (profiles || []).map((p) => p.user_id);
        const { data: roles } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', userIds);

        const roleMap = new Map((roles || []).map((r) => [r.user_id, r.role]));

        const mapped: ContactQuickPick[] = (profiles || [])
          .filter((p) => p.phone)
          .map((p) => ({
            userId: p.user_id,
            name: p.full_name || p.email || 'User',
            phone: p.phone!,
            role: roleMap.get(p.user_id) || 'user',
          }));

        setSearchResults(mapped);
      } catch (err) {
        console.error('Directory search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [quickQuery]);

  const prefix = COUNTRY_CODES[region] || '+1';

  const handleSelectContact = (contact: ContactQuickPick) => {
    setPhoneNumber(contact.phone);
    setDisplayName(contact.name);
    if (contact.phone.startsWith('+234')) {
      setRegion('Nigeria');
    } else if (contact.phone.startsWith('+1')) {
      setRegion('USA');
    }
    setQuickQuery('');
    setSearchResults([]);
  };

  const handleDial = async () => {
    const rawNumber = phoneNumber.trim();
    if (!rawNumber) {
      toast.error('Please enter a phone number to call');
      return;
    }

    const fullNumber = rawNumber.startsWith('+') ? rawNumber : `${prefix}${rawNumber}`;
    if (!validatePhoneNumber(fullNumber, region)) {
      toast.error(`Please enter a valid ${region} phone number`);
      return;
    }

    setIsCalling(true);
    try {
      const result = await initiateCall('individual', region, [
        {
          phoneNumber: fullNumber,
          displayName: displayName.trim() || undefined,
        },
      ]);
      if (result) {
        toast.success(`Calling ${displayName || formatPhoneForDisplay(fullNumber)}...`);
        clearPrefill();
      }
    } catch (err: any) {
      console.error('Call initiation failed:', err);
      toast.error(err.message || 'Failed to place call via VoIP gateway');
    } finally {
      setIsCalling(false);
    }
  };

  const currentLiveCall = activeCall || hookActiveCall;

  return (
    <div className="space-y-4">
      {/* If there is an active call, show the Live Call HUD first */}
      {currentLiveCall && (
        <HubActiveCallHUD call={currentLiveCall} onEndCall={endCall} />
      )}

      {/* Dialer Card */}
      <div className="bg-card border border-border/80 rounded-xl p-4 shadow-sm space-y-3.5">
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <div className="flex items-center gap-1.5">
            <Phone className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-semibold text-foreground">Admin Softphone Dialer</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-emerald-600" />
            <span className="text-[10px] text-muted-foreground font-mono">Twilio Voice Encrypted</span>
          </div>
        </div>

        {/* Quick Directory Search */}
        <div className="space-y-1 relative">
          <Label className="text-[11px] font-medium text-muted-foreground">
            Search Drivers, Owners & Staff
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={quickQuery}
              onChange={(e) => setQuickQuery(e.target.value)}
              placeholder="Search by name, phone or email..."
              className="h-8 pl-8 text-xs bg-background"
            />
            {isSearching && (
              <Loader2 className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground animate-spin" />
            )}
          </div>

          {/* Quick Search Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 z-20 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-border/50">
              {searchResults.map((user) => (
                <button
                  key={user.userId}
                  type="button"
                  onClick={() => handleSelectContact(user)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/80 transition flex items-center justify-between text-xs"
                >
                  <div className="truncate pr-2">
                    <span className="font-medium text-foreground">{user.name}</span>
                    <span className="text-[11px] text-muted-foreground font-mono ml-2">
                      {formatPhoneForDisplay(user.phone)}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[9px] py-0 px-1 capitalize shrink-0">
                    {user.role}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Region & Phone Input */}
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Region</Label>
            <Select value={region} onValueChange={(val: CallRegion) => setRegion(val)}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USA" className="text-xs">
                  USA (+1)
                </SelectItem>
                <SelectItem value="Nigeria" className="text-xs">
                  Nigeria (+234)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-[11px] font-medium text-muted-foreground">Phone Number</Label>
            <Input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder={region === 'Nigeria' ? '801 234 5678' : '415 555 2671'}
              className="h-9 text-xs font-mono bg-background"
            />
          </div>
        </div>

        {/* Recipient Display Name */}
        <div className="space-y-1">
          <Label className="text-[11px] font-medium text-muted-foreground">
            Recipient Name (Optional)
          </Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. John Doe (Driver) or Jane Smith (Owner)"
            className="h-8 text-xs bg-background"
          />
        </div>

        {/* Call Action Button */}
        <Button
          type="button"
          onClick={handleDial}
          disabled={isCalling || !phoneNumber.trim()}
          className="w-full h-9 text-xs font-medium gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isCalling ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Connecting Softphone...</span>
            </>
          ) : (
            <>
              <Phone className="h-3.5 w-3.5" />
              <span>Call via Admin Gateway</span>
            </>
          )}
        </Button>

        {phoneNumber.trim() && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              openMessageEditor({
                name: displayName.trim() || 'Contact',
                phone: phoneNumber.trim(),
                defaultAction: 'message',
              });
            }}
            className="w-full h-8 text-xs font-medium gap-2 text-indigo-600 border-indigo-500/30 hover:bg-indigo-50"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Switch to Message Editor for this Contact</span>
          </Button>
        )}
      </div>
    </div>
  );
};
