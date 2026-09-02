import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneNumberInput } from '@/components/ui/phone-number-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Users, Plus, Trash2, Phone, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { VoIPCallGroup, CallRegion } from '@/types/voip';
import { COUNTRY_CODES, validatePhoneNumber, formatPhoneForDisplay } from '@/types/voip';
import { useRegion } from '@/contexts/RegionContext';
import { regionToDefaultCountry } from '@/hooks/useDefaultPhoneCountry';


interface CallGroupsProps {
  groups: VoIPCallGroup[];
  onCreateGroup: (
    name: string,
    description: string,
    region: 'USA' | 'Nigeria' | (string & {}) | 'All',
    members: { phoneNumber: string; displayName?: string; userId?: string; region: CallRegion }[]
  ) => Promise<any>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  isLoading: boolean;
}

export const CallGroups = ({ groups, onCreateGroup, onDeleteGroup, isLoading }: CallGroupsProps) => {
  const { country: activeCountry } = useRegion();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupRegion, setGroupRegion] = useState<'USA' | 'Nigeria' | (string & {}) | 'All'>('All');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberRegion, setMemberRegion] = useState<CallRegion>(
    (activeCountry === 'Nigeria' ? 'Nigeria' : 'USA') as CallRegion,
  );

  const [members, setMembers] = useState<{ phoneNumber: string; displayName: string; region: CallRegion }[]>([]);
  const { toast } = useToast();

  const handleAddMember = () => {
    const prefix = COUNTRY_CODES[memberRegion];
    const fullNumber = memberPhone.startsWith('+') ? memberPhone : `${prefix}${memberPhone}`;
    
    if (!validatePhoneNumber(fullNumber, memberRegion)) {
      toast({
        title: 'Invalid Phone Number',
        description: `Please enter a valid ${memberRegion} phone number`,
        variant: 'destructive',
      });
      return;
    }

    if (members.some(m => m.phoneNumber === fullNumber)) {
      toast({
        title: 'Duplicate',
        description: 'This number is already in the group',
        variant: 'destructive',
      });
      return;
    }

    setMembers([...members, { phoneNumber: fullNumber, displayName: memberName || fullNumber, region: memberRegion }]);
    setMemberPhone('');
    setMemberName('');
  };

  const handleRemoveMember = (phone: string) => {
    setMembers(members.filter(m => m.phoneNumber !== phone));
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast({ title: 'Error', description: 'Group name is required', variant: 'destructive' });
      return;
    }
    if (members.length === 0) {
      toast({ title: 'Error', description: 'Add at least one member', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    try {
      await onCreateGroup(groupName, groupDescription, groupRegion, members);
      setIsCreateOpen(false);
      setGroupName('');
      setGroupDescription('');
      setMembers([]);
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setGroupName('');
    setGroupDescription('');
    setGroupRegion('All');
    setMembers([]);
    setMemberPhone('');
    setMemberName('');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Call Groups
            </CardTitle>
            <CardDescription>
              Manage predefined groups for conference calls
            </CardDescription>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Group
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Call Group</DialogTitle>
                <DialogDescription>
                  Create a new group for conference calls
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="groupName">Group Name *</Label>
                    <Input
                      id="groupName"
                      placeholder="e.g., Nigeria Drivers"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="groupRegion">Region</Label>
                    <Select value={groupRegion} onValueChange={(v) => setGroupRegion(v as 'USA' | 'Nigeria' | (string & {}) | 'All')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">All Regions</SelectItem>
                        <SelectItem value="USA">🇺🇸 USA Only</SelectItem>
                        <SelectItem value="Nigeria">🇳🇬 Nigeria Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="groupDesc">Description</Label>
                  <Textarea
                    id="groupDesc"
                    placeholder="Optional description for this group"
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                  />
                </div>

                {/* Add Members */}
                <div className="border-t pt-4">
                  <Label className="text-base font-medium">Add Members</Label>
                  <div className="grid gap-4 md:grid-cols-4 mt-2">
                    <div className="space-y-2">
                      <Label className="text-xs">Region</Label>
                      <Select value={memberRegion} onValueChange={(v) => setMemberRegion(v as CallRegion)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USA">🇺🇸 +1</SelectItem>
                          <SelectItem value="Nigeria">🇳🇬 +234</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs">Phone Number</Label>
                      <PhoneNumberInput
                        value={memberPhone.startsWith('+') ? memberPhone : ''}
                        onChange={setMemberPhone}
                        defaultCountry={regionToDefaultCountry(memberRegion)}
                        placeholder="Phone"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Name</Label>
                      <Input
                        placeholder="Name (optional)"
                        value={memberName}
                        onChange={(e) => setMemberName(e.target.value)}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={handleAddMember} size="sm" className="w-full">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Members List */}
                  {members.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <Label className="text-xs text-muted-foreground">Members ({members.length})</Label>
                      <div className="flex flex-wrap gap-2">
                        {members.map((m) => (
                          <Badge key={m.phoneNumber} variant="secondary" className="flex items-center gap-1 py-1">
                            {m.region === 'USA' ? '🇺🇸' : '🇳🇬'}
                            {m.displayName}
                            <button
                              onClick={() => handleRemoveMember(m.phoneNumber)}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateGroup} disabled={isCreating}>
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Group'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No call groups created yet</p>
            <p className="text-sm">Create a group to make conference calls easier</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <Card key={group.id} className="relative">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{group.name}</CardTitle>
                      <Badge variant="outline" className="mt-1">
                        {group.region === 'USA' ? '🇺🇸' : group.region === 'Nigeria' ? '🇳🇬' : '🌍'} {group.region}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteGroup(group.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {group.description && (
                    <p className="text-sm text-muted-foreground mb-3">{group.description}</p>
                  )}
                  <div className="space-y-1">
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {group.members?.length || 0} members
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {group.members?.slice(0, 4).map((m, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {m.region === 'USA' ? '🇺🇸' : '🇳🇬'}
                          {m.display_name || formatPhoneForDisplay(m.phone_number)}
                        </Badge>
                      ))}
                      {(group.members?.length || 0) > 4 && (
                        <Badge variant="secondary" className="text-xs">
                          +{(group.members?.length || 0) - 4} more
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
