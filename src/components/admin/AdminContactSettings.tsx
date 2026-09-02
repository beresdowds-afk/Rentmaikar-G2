import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, MessageSquare, Phone, Loader2, Save, Globe, Building2, Copy, CheckCircle, Plus, Trash2 } from 'lucide-react';
import { useContactSettings, ContactSetting } from '@/hooks/useUnifiedInbox';
import CompanyInfoRealtimeDebug from '@/components/admin/CompanyInfoRealtimeDebug';

import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ForwardingSettingsPanel } from '@/components/admin/ForwardingSettingsPanel';
import { ProviderHealthPanel } from '@/components/admin/ProviderHealthPanel';
import { CommsTestConsolePanel } from '@/components/admin/CommsTestConsolePanel';
import { ProviderAlertSettings } from '@/components/admin/ProviderAlertSettings';

import { OutboundAuditLogPanel } from '@/components/admin/OutboundAuditLogPanel';

const channelIcons = {
  email: Mail,
  sms: Phone,
  whatsapp: MessageSquare,
};

const channelLabels = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

const ContactSettingCard = ({ 
  setting, 
  onUpdate,
  onDelete,
}: { 
  setting: ContactSetting; 
  onUpdate: (id: string, updates: Partial<ContactSetting>) => Promise<boolean>;
  onDelete?: (id: string) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [contactValue, setContactValue] = useState(setting.contact_value);
  const [displayName, setDisplayName] = useState(setting.display_name || '');
  const [isSaving, setIsSaving] = useState(false);

  const Icon = channelIcons[setting.contact_type as keyof typeof channelIcons] || Phone;

  const handleSave = async () => {
    setIsSaving(true);
    const success = await onUpdate(setting.id, {
      contact_value: contactValue,
      display_name: displayName || null,
    });
    if (success) {
      setIsEditing(false);
    }
    setIsSaving(false);
  };

  const handleToggleActive = async (isActive: boolean) => {
    await onUpdate(setting.id, { is_active: isActive });
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {channelLabels[setting.contact_type as keyof typeof channelLabels]}
                </span>
                <Badge variant={setting.is_active ? 'default' : 'secondary'}>
                  {setting.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Contact Value</Label>
                    <Input
                      value={contactValue}
                      onChange={(e) => setContactValue(e.target.value)}
                      placeholder={setting.contact_type === 'email' ? 'support@example.com' : '+1234567890'}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Display Name</Label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g., USA Support Line"
                      className="mt-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-mono">{setting.contact_value}</p>
                  {setting.display_name && (
                    <p className="text-xs text-muted-foreground">{setting.display_name}</p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 px-2"
                      onClick={() => setIsEditing(true)}
                    >
                      Edit
                    </Button>
                    {onDelete && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => onDelete(setting.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <Switch
            checked={setting.is_active}
            onCheckedChange={handleToggleActive}
          />
        </div>
      </CardContent>
    </Card>
  );
};

const CopyButton = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleCopy}>
      {copied ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
};

const AddContactForm = ({ region, onAdded }: { region: string; onAdded: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [contactType, setContactType] = useState('email');
  const [contactValue, setContactValue] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async () => {
    if (!contactValue.trim()) return;
    setIsSaving(true);
    const { error } = await supabase.from('contact_settings').insert({
      region,
      contact_type: contactType,
      contact_value: contactValue.trim(),
      display_name: displayName.trim() || null,
      is_active: true,
    });
    if (error) {
      toast.error('Failed to add contact');
    } else {
      toast.success('Contact added');
      setContactValue('');
      setDisplayName('');
      setIsOpen(false);
      onAdded();
    }
    setIsSaving(false);
  };

  if (!isOpen) {
    return (
      <Button size="sm" variant="outline" className="gap-2" onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4" /> Add Contact
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Channel</Label>
            <select 
              value={contactType} 
              onChange={(e) => setContactType(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="email">Email</option>
              <option value="sms">SMS / Phone</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Display Name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g., Support Line" className="mt-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Contact Value</Label>
          <Input value={contactValue} onChange={(e) => setContactValue(e.target.value)} placeholder={contactType === 'email' ? 'support@example.com' : '+1234567890'} className="mt-1" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleAdd} disabled={isSaving || !contactValue.trim()}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Add
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
};

const EmailConfigRow = ({ entry, onSave }: { 
  entry: { id: string; key: string; email: string; sender_name: string | null; description: string | null; is_active: boolean };
  onSave: () => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(entry.email);
  const [senderName, setSenderName] = useState(entry.sender_name || '');
  const [desc, setDesc] = useState(entry.description || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('platform_email_config')
      .update({ email, sender_name: senderName || null, description: desc || null })
      .eq('id', entry.id);
    if (error) { toast.error('Failed to save'); } else { toast.success('Email config updated'); setEditing(false); onSave(); }
    setSaving(false);
  };

  const handleToggle = async (active: boolean) => {
    await supabase.from('platform_email_config').update({ is_active: active }).eq('id', entry.id);
    onSave();
  };

  if (editing) {
    return (
      <tr className="border-b border-border/50">
        <td className="p-2.5"><Badge variant="outline" className="font-normal">{entry.key}</Badge></td>
        <td className="p-2.5"><Input value={email} onChange={e => setEmail(e.target.value)} className="h-8 text-xs font-mono" /></td>
        <td className="p-2.5"><Input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Sender name" className="h-8 text-xs" /></td>
        <td className="p-2.5"><Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" className="h-8 text-xs" /></td>
        <td className="p-2.5 text-right">
          <div className="flex gap-1 justify-end">
            <Button size="sm" className="h-7 px-2" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/50 group">
      <td className="p-2.5">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-normal">{entry.key}</Badge>
          {!entry.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
        </div>
      </td>
      <td className="p-2.5 font-mono text-xs">{entry.email}</td>
      <td className="p-2.5 text-muted-foreground text-xs">{entry.sender_name || '—'}</td>
      <td className="p-2.5 text-muted-foreground text-xs">{entry.description || '—'}</td>
      <td className="p-2.5 text-right">
        <div className="flex gap-1 justify-end items-center">
          <Switch checked={entry.is_active} onCheckedChange={handleToggle} className="scale-75" />
          <Button size="sm" variant="ghost" className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setEditing(true)}>Edit</Button>
          <CopyButton value={entry.email} />
        </div>
      </td>
    </tr>
  );
};

interface CompanyInfoRow {
  id: string;
  region: string;
  company_name: string;
  address_line: string | null;
  city: string | null;
  state: string | null;
  country_name: string | null;
  postal_code: string | null;
  full_address: string | null;
  phone: string | null;
  phone_raw: string | null;
  email: string | null;
  is_active: boolean;
}

const CompanyInfoEditor = ({ row, onSaved }: { row: CompanyInfoRow; onSaved: () => void }) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CompanyInfoRow>(row);

  useEffect(() => { setForm(row); }, [row]);

  const set = (k: keyof CompanyInfoRow, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('platform_company_info')
      .update({
        company_name: form.company_name,
        address_line: form.address_line,
        city: form.city,
        state: form.state,
        country_name: form.country_name,
        postal_code: form.postal_code,
        full_address: form.full_address,
        phone: form.phone,
        phone_raw: (form.phone_raw || '').replace(/[^\d+]/g, ''),
        email: form.email,
      })
      .eq('id', row.id);
    setSaving(false);
    if (error) { toast.error('Failed to save company info'); return; }
    toast.success('Company info updated — landing footer will refresh');
    setEditing(false);
    onSaved();
  };

  return (
    <div className="p-4 rounded-lg bg-muted space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{row.region === 'USA' ? '🇺🇸' : '🇳🇬'}</span>
          <div>
            <p className="font-semibold">{form.company_name || row.company_name}</p>
            <p className="text-xs text-muted-foreground">{row.region}</p>
          </div>
        </div>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Company name</Label><Input value={form.company_name || ''} onChange={e => set('company_name', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Phone (display)</Label><Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Phone (dial)</Label><Input value={form.phone_raw || ''} onChange={e => set('phone_raw', e.target.value)} placeholder="+16083843932" className="h-8" /></div>
            <div><Label className="text-xs">Email</Label><Input value={form.email || ''} onChange={e => set('email', e.target.value)} className="h-8" /></div>
            <div className="col-span-2"><Label className="text-xs">Address line</Label><Input value={form.address_line || ''} onChange={e => set('address_line', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">City</Label><Input value={form.city || ''} onChange={e => set('city', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">State</Label><Input value={form.state || ''} onChange={e => set('state', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Country</Label><Input value={form.country_name || ''} onChange={e => set('country_name', e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Postal code</Label><Input value={form.postal_code || ''} onChange={e => set('postal_code', e.target.value)} className="h-8" /></div>
            <div className="col-span-2"><Label className="text-xs">Full address (footer display)</Label><Input value={form.full_address || ''} onChange={e => set('full_address', e.target.value)} className="h-8" /></div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setForm(row); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-xs">{form.phone || '—'}</span>
            </div>
            <CopyButton value={form.phone_raw || ''} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-xs">{form.email || '—'}</span>
            </div>
            <CopyButton value={form.email || ''} />
          </div>
          {form.full_address && (
            <div className="flex items-start gap-2 pt-1 border-t border-border/50">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-xs text-muted-foreground">{form.full_address}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const AdminContactSettings = () => {
  const { settings, isLoading, updateSetting, fetchSettings: refetch } = useContactSettings();

  const [forwardingRegions, setForwardingRegions] = useState<any[]>([]);
  const [forwardingLoading, setForwardingLoading] = useState(true);
  const [emailConfigs, setEmailConfigs] = useState<any[]>([]);
  const [emailConfigLoading, setEmailConfigLoading] = useState(true);
  const [companyRows, setCompanyRows] = useState<CompanyInfoRow[]>([]);
  const [companyLoading, setCompanyLoading] = useState(true);

  const fetchEmailConfigs = async () => {
    const { data } = await supabase.from('platform_email_config').select('*').order('key');
    if (data) setEmailConfigs(data);
    setEmailConfigLoading(false);
  };

  const fetchCompanyInfo = async () => {
    const { data } = await supabase.from('platform_company_info').select('*').order('region');
    if (data) setCompanyRows(data as CompanyInfoRow[]);
    setCompanyLoading(false);
  };

  useEffect(() => {
    const fetchForwarding = async () => {
      const { data } = await supabase
        .from('platform_regions')
        .select('id, name, code, forwarding_sms, forwarding_whatsapp, forwarding_notes, platform_countries!inner(name, flag)')
        .order('display_order');
      if (data) setForwardingRegions(data);
      setForwardingLoading(false);
    };
    fetchForwarding();
    fetchEmailConfigs();
    fetchCompanyInfo();
  }, []);

  const usaSettings = settings.filter(s => s.region === 'USA');
  const nigeriaSettings = settings.filter(s => s.region === 'Nigeria');

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('contact_settings').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete contact');
    } else {
      toast.success('Contact deleted');
      refetch();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Contact Directory & Settings
        </h3>
        <p className="text-sm text-muted-foreground">
          Complete directory of all Rentmaikar phone numbers, email addresses, and regional contact channels.
        </p>
      </div>

      {/* Platform Email Directory - DB-driven editable */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Platform Email Addresses
          </CardTitle>
          <CardDescription>
            All official @rentmaikar.com email addresses used across the platform. Click Edit to modify.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {emailConfigLoading ? (
            <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-2.5 font-semibold">Purpose</th>
                    <th className="text-left p-2.5 font-semibold">Email Address</th>
                    <th className="text-left p-2.5 font-semibold">Sender Name</th>
                    <th className="text-left p-2.5 font-semibold">Description</th>
                    <th className="text-right p-2.5 font-semibold w-32"></th>
                  </tr>
                </thead>
                <tbody>
                  {emailConfigs.map((entry) => (
                    <EmailConfigRow key={entry.id} entry={entry} onSave={fetchEmailConfigs} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Company Phone Numbers & Addresses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Company Information by Region
          </CardTitle>
          <CardDescription>
            Official phone numbers, company names, and addresses for each operating region.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {companyLoading ? (
            <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {companyRows.map((row) => (
                <CompanyInfoEditor key={row.id} row={row} onSaved={fetchCompanyInfo} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CompanyInfoRealtimeDebug />

      <ForwardingSettingsPanel />

      <ProviderHealthPanel />

      <CommsTestConsolePanel />

      <ProviderAlertSettings />


      <OutboundAuditLogPanel />



      {/* Message Forwarding Numbers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            Message Forwarding Numbers by Region
          </CardTitle>
          <CardDescription>
            Local numbers that receive copies of all SMS and WhatsApp messages sent through the central messaging system. Managed in ERP → Regional Operations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forwardingLoading ? (
            <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : forwardingRegions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No regions configured yet.</p>
          ) : (
            <div className="space-y-3">
              {forwardingRegions.map((region: any) => {
                const country = region.platform_countries as { name: string; flag: string };
                const hasFwd = region.forwarding_sms || region.forwarding_whatsapp;
                return (
                  <div key={region.id} className="p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2 mb-2">
                      <span>{country.flag}</span>
                      <span className="font-medium text-sm">{region.name}</span>
                      <Badge variant="outline" className="text-[10px]">{region.code}</Badge>
                      {!hasFwd && <Badge variant="secondary" className="text-[10px]">No forwarding</Badge>}
                    </div>
                    {hasFwd ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        {region.forwarding_sms && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs">SMS:</span>
                            <span className="font-mono text-xs">{region.forwarding_sms}</span>
                            <CopyButton value={region.forwarding_sms} />
                          </div>
                        )}
                        {region.forwarding_whatsapp && (
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs">WhatsApp:</span>
                            <span className="font-mono text-xs">{region.forwarding_whatsapp}</span>
                            <CopyButton value={region.forwarding_whatsapp} />
                          </div>
                        )}
                        {region.forwarding_notes && (
                          <p className="text-[10px] text-muted-foreground col-span-2">{region.forwarding_notes}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Configure in ERP → Regional Operations → {region.name}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editable Regional Contact Channels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Regional Contact Channels
          </CardTitle>
          <CardDescription>
            Editable customer-facing contact points (SMS, WhatsApp, Email) by region. These populate dashboard contact options and drive Unified Inbox routing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="usa" className="w-full">
            <TabsList>
              <TabsTrigger value="usa" className="flex items-center gap-2">
                🇺🇸 United States
              </TabsTrigger>
              <TabsTrigger value="nigeria" className="flex items-center gap-2">
                🇳🇬 Nigeria
              </TabsTrigger>
            </TabsList>

            <TabsContent value="usa" className="mt-4 space-y-4">
              {usaSettings.map((setting) => (
                <ContactSettingCard 
                  key={setting.id} 
                  setting={setting} 
                  onUpdate={updateSetting}
                  onDelete={handleDelete}
                />
              ))}
              {usaSettings.length === 0 && (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    No contact channels configured for USA
                  </CardContent>
                </Card>
              )}
              <AddContactForm region="USA" onAdded={refetch} />
            </TabsContent>

            <TabsContent value="nigeria" className="mt-4 space-y-4">
              {nigeriaSettings.map((setting) => (
                <ContactSettingCard 
                  key={setting.id} 
                  setting={setting} 
                  onUpdate={updateSetting}
                  onDelete={handleDelete}
                />
              ))}
              {nigeriaSettings.length === 0 && (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    No contact channels configured for Nigeria
                  </CardContent>
                </Card>
              )}
              <AddContactForm region="Nigeria" onAdded={refetch} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminContactSettings;
