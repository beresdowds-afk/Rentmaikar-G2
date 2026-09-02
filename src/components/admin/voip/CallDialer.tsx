import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneNumberInput } from '@/components/ui/phone-number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Phone, Users, Plus, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CallRegion, CallType, VoIPCallGroup } from '@/types/voip';
import { COUNTRY_CODES, validatePhoneNumber, formatPhoneForDisplay } from '@/types/voip';
import { useRegion } from '@/contexts/RegionContext';
import { regionToDefaultCountry } from '@/hooks/useDefaultPhoneCountry';
import { UserCallSearch } from './UserCallSearch';
import { Separator } from '@/components/ui/separator';


interface CallDialerProps {
  onInitiateCall: (
    callType: CallType,
    region: CallRegion,
    recipients: { phoneNumber: string; displayName?: string; userId?: string }[]
  ) => Promise<any>;
  groups: VoIPCallGroup[];
  isLoading: boolean;
}

export const CallDialer = ({ onInitiateCall, groups, isLoading }: CallDialerProps) => {
  // Seed the dial region from RegionContext so admins start on their active
  // region instead of a hard-coded USA default.
  const { country: activeCountry } = useRegion();
  const [callMode, setCallMode] = useState<'individual' | 'group'>('individual');
  const [region, setRegion] = useState<CallRegion>(
    (activeCountry === 'Nigeria' ? 'Nigeria' : 'USA') as CallRegion,
  );

  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [recipients, setRecipients] = useState<{ phoneNumber: string; displayName: string }[]>([]);
  const [isCalling, setIsCalling] = useState(false);
  const { toast } = useToast();

  const prefix = COUNTRY_CODES[region];

  const handleAddRecipient = () => {
    const fullNumber = phoneNumber.startsWith('+') ? phoneNumber : `${prefix}${phoneNumber}`;
    
    if (!validatePhoneNumber(fullNumber, region)) {
      toast({
        title: 'Invalid Phone Number',
        description: `Please enter a valid ${region} phone number`,
        variant: 'destructive',
      });
      return;
    }

    if (recipients.some(r => r.phoneNumber === fullNumber)) {
      toast({
        title: 'Duplicate',
        description: 'This number is already in the list',
        variant: 'destructive',
      });
      return;
    }

    setRecipients([...recipients, { phoneNumber: fullNumber, displayName: displayName || fullNumber }]);
    setPhoneNumber('');
    setDisplayName('');
  };

  const handleRemoveRecipient = (phone: string) => {
    setRecipients(recipients.filter(r => r.phoneNumber !== phone));
  };

  const handleCall = async () => {
    setIsCalling(true);
    try {
      if (callMode === 'individual') {
        const fullNumber = phoneNumber.startsWith('+') ? phoneNumber : `${prefix}${phoneNumber}`;
        
        if (!validatePhoneNumber(fullNumber, region)) {
          toast({
            title: 'Invalid Phone Number',
            description: `Please enter a valid ${region} phone number`,
            variant: 'destructive',
          });
          return;
        }

        await onInitiateCall('individual', region, [
          { phoneNumber: fullNumber, displayName: displayName || undefined },
        ]);
      } else if (callMode === 'group') {
        if (selectedGroupId) {
          const group = groups.find(g => g.id === selectedGroupId);
          if (group?.members) {
            await onInitiateCall('group', region, group.members.map(m => ({
              phoneNumber: m.phone_number,
              displayName: m.display_name,
              userId: m.user_id,
            })));
          }
        } else if (recipients.length > 0) {
          await onInitiateCall('group', region, recipients);
        } else {
          toast({
            title: 'No Recipients',
            description: 'Please add at least one recipient or select a group',
            variant: 'destructive',
          });
          return;
        }
      }
    } finally {
      setIsCalling(false);
    }
  };

  const filteredGroups = groups.filter(g => g.region === region || g.region === 'All');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Make a Call
        </CardTitle>
        <CardDescription>
          Call individual users or groups across USA and Nigeria
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Region Selection */}
        <div className="space-y-2">
          <Label>Select Region</Label>
          <div className="flex gap-2">
            <Button
              variant={region === 'USA' ? 'default' : 'outline'}
              onClick={() => setRegion('USA')}
              className="flex-1"
            >
              <span className="mr-2">🇺🇸</span>
              USA (+1)
            </Button>
            <Button
              variant={region === 'Nigeria' ? 'default' : 'outline'}
              onClick={() => setRegion('Nigeria')}
              className="flex-1"
            >
              <span className="mr-2">🇳🇬</span>
              Nigeria (+234)
            </Button>
          </div>
        </div>

        {/* Call Mode */}
        <Tabs value={callMode} onValueChange={(v) => setCallMode(v as 'individual' | 'group')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="individual">
              <Phone className="h-4 w-4 mr-2" />
              Individual
            </TabsTrigger>
            <TabsTrigger value="group">
              <Users className="h-4 w-4 mr-2" />
              Group Call
            </TabsTrigger>
          </TabsList>

          <TabsContent value="individual" className="space-y-4 mt-4">
            {/* Search a registered user — selecting one dials immediately */}
            <div className="space-y-2 rounded-md border p-4">
              <Label>Search users to call</Label>
              <p className="text-xs text-muted-foreground">
                Selecting a driver or owner starts the call right away.
              </p>
              <UserCallSearch
                embedded
                isLoading={isLoading || isCalling}
                onInitiateCall={onInitiateCall}
                onUserSelected={(user) => {
                  if (user.phone) {
                    setRegion(user.phone.startsWith('+234') ? 'Nigeria' : 'USA');
                    setPhoneNumber(user.phone);
                  }
                  setDisplayName(user.full_name || '');
                }}
              />
            </div>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or dial manually</span>
              <Separator className="flex-1" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <PhoneNumberInput
                  id="phone"
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                  defaultCountry={regionToDefaultCountry(region)}
                  placeholder="Enter phone number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Display Name (Optional)</Label>
                <Input
                  id="name"
                  placeholder="Contact name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="group" className="space-y-4 mt-4">
            {/* Existing Groups */}
            <div className="space-y-2">
              <Label>Select Existing Group</Label>
              <Select value={selectedGroupId || "manual"} onValueChange={(v) => setSelectedGroupId(v === "manual" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a group or add recipients manually" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Add recipients manually</SelectItem>
                  {filteredGroups.filter(g => g.id).map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name} ({group.members?.length || 0} members)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Manual Recipients */}
            {!selectedGroupId && (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm">
                        {prefix}
                      </span>
                      <Input
                        placeholder="Phone"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                        className="rounded-l-none"
                        maxLength={10}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Display Name</Label>
                    <Input
                      placeholder="Name (optional)"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleAddRecipient} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                </div>

                {/* Recipients List */}
                {recipients.length > 0 && (
                  <div className="space-y-2">
                    <Label>Recipients ({recipients.length})</Label>
                    <div className="flex flex-wrap gap-2">
                      {recipients.map((r) => (
                        <Badge key={r.phoneNumber} variant="secondary" className="flex items-center gap-1 py-1">
                          {r.displayName || formatPhoneForDisplay(r.phoneNumber)}
                          <button
                            onClick={() => handleRemoveRecipient(r.phoneNumber)}
                            className="ml-1 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Call Button */}
        <Button
          onClick={handleCall}
          disabled={isCalling || isLoading}
          className="w-full"
          size="lg"
        >
          {isCalling ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Phone className="h-4 w-4 mr-2" />
              {callMode === 'individual' ? 'Call Now' : 'Start Conference Call'}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
