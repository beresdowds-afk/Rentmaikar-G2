import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRegion } from '@/contexts/RegionContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Edit, Eye, FileText, GitBranch, Loader2, Plus, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AGREEMENT_PLACEHOLDERS } from '@/lib/agreement-template';

type AgreementRegion = 'USA' | 'Nigeria' | (string & {});

interface LegalAgreementTemplate {
  id: string;
  template_key: string;
  agreement_type: string;
  region: AgreementRegion;
  title: string;
  version: string;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Starter scaffold only — the binding agreement text lives in the database and
// is authored/versioned here, never hard-coded in the application.
const DEFAULT_CONTENT = `OWNER AND RENTER AGREEMENT

Agreement Date: {{agreement_date}}
Region: {{region}}

{{owner_full_name}}, known as "OWNER"
{{driver_full_name}}, known as "DRIVER"

Vehicle: {{vehicle_make_model_year}} | VIN: {{vehicle_vin}} | Plate: {{license_plate}}

1. TERM
Start: {{contract_start_date}} {{contract_start_time}} — End: {{contract_end_date}} {{contract_end_time}}

2. PAYMENTS
Basic rental price: {{currency}} {{basic_rental_price}}

EXECUTION
Owner, Driver and the {{platform_entity}} Administrator sign this agreement electronically on the RentMaiKar platform.`;

const emptyForm = (region: AgreementRegion) => ({
  template_key: 'owner_driver_agreement',
  agreement_type: 'vehicle_rental',
  region,
  title: `Owner and Driver Rental Agreement - ${region}`,
  version: '1.0',
  content: DEFAULT_CONTENT,
  is_active: false,
});

export function LegalAgreementTemplateManagement() {
  const { country } = useRegion();
  const defaultRegion: AgreementRegion = country === 'Nigeria' ? 'Nigeria' : 'USA';
  const [templates, setTemplates] = useState<LegalAgreementTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regionFilter, setRegionFilter] = useState<'all' | AgreementRegion>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LegalAgreementTemplate | null>(null);
  const [form, setForm] = useState(emptyForm(defaultRegion));

  const visibleTemplates = useMemo(
    () => templates.filter((template) => regionFilter === 'all' || template.region === regionFilter),
    [templates, regionFilter],
  );

  const loadTemplates = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('legal_agreement_templates')
      .select('*')
      .order('updated_at', { ascending: false });

    setLoading(false);
    if (error) {
      toast.error(`Failed to load agreement templates: ${error.message}`);
      return;
    }
    setTemplates((data ?? []) as LegalAgreementTemplate[]);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(defaultRegion));
    setDialogOpen(true);
  };

  const openEdit = (template: LegalAgreementTemplate) => {
    setEditing(template);
    setForm({
      template_key: template.template_key,
      agreement_type: template.agreement_type,
      region: template.region,
      title: template.title,
      version: template.version,
      content: template.content,
      is_active: template.is_active,
    });
    setDialogOpen(true);
  };

  // Draft a new version by cloning an existing template with an incremented
  // version tag — leaves the original in place so admins can compare / roll back.
  const openNewVersion = (template: LegalAgreementTemplate) => {
    setEditing(null);
    const bumped = /^(\d+)\.(\d+)$/.exec(template.version);
    const nextVersion = bumped ? `${bumped[1]}.${Number(bumped[2]) + 1}` : `${template.version}.1`;
    setForm({
      template_key: template.template_key,
      agreement_type: template.agreement_type,
      region: template.region,
      title: template.title,
      version: nextVersion,
      content: template.content,
      is_active: false,
    });
    setDialogOpen(true);
  };

  const [previewTemplate, setPreviewTemplate] = useState<LegalAgreementTemplate | null>(null);

  const saveTemplate = async () => {
    if (!form.template_key.trim() || !form.agreement_type.trim() || !form.title.trim() || !form.version.trim() || !form.content.trim()) {
      toast.error('Template key, type, title, version, and content are required');
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const payload = {
      ...form,
      updated_by: userData.user?.id ?? null,
      ...(editing ? {} : { created_by: userData.user?.id ?? null }),
    };

    const { error } = editing
      ? await (supabase as any).from('legal_agreement_templates').update(payload).eq('id', editing.id)
      : await (supabase as any).from('legal_agreement_templates').insert(payload);

    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }

    toast.success('Legal agreement template saved');
    setDialogOpen(false);
    loadTemplates();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Legal Agreement Templates</h2>
          <p className="text-muted-foreground">Manage reusable legal agreement content by country and version.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/legal-templates/preview" target="_blank" rel="noopener noreferrer">
              <Eye className="mr-2 h-4 w-4" />
              Preview latest as user
            </Link>
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Template Library
              </CardTitle>
              <CardDescription>Author the binding agreement body here. Use the {'{{token}}'} placeholders listed in the editor so parties, vehicle and pricing details fill in automatically.</CardDescription>
            </div>
            <Select value={regionFilter} onValueChange={(value) => setRegionFilter(value as 'all' | AgreementRegion)}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                <SelectItem value="USA">USA</SelectItem>
                <SelectItem value="Nigeria">Nigeria</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : visibleTemplates.length === 0 ? (
            <Alert>
              <AlertDescription>No agreement templates match the selected region.</AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTemplates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <div className="font-medium">{template.title}</div>
                      <div className="text-xs text-muted-foreground">{template.template_key}</div>
                    </TableCell>
                    <TableCell>{template.agreement_type}</TableCell>
                    <TableCell>{template.region}</TableCell>
                    <TableCell>{template.version}</TableCell>
                    <TableCell>
                      <Badge variant={template.is_active ? 'default' : 'secondary'}>{template.is_active ? 'Active' : 'Draft'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setPreviewTemplate(template)}>
                          <Eye className="mr-1 h-4 w-4" />
                          Preview
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openNewVersion(template)}>
                          <GitBranch className="mr-1 h-4 w-4" />
                          New version
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(template)}>
                          <Edit className="mr-1 h-4 w-4" />
                          Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Legal Agreement Template' : 'Create Legal Agreement Template'}</DialogTitle>
            <DialogDescription>Template changes are versioned by key, country, and version.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Template key</Label>
              <Input value={form.template_key} onChange={(event) => setForm((current) => ({ ...current, template_key: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Agreement type</Label>
              <Input value={form.agreement_type} onChange={(event) => setForm((current) => ({ ...current, agreement_type: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <Select value={form.region} onValueChange={(value) => setForm((current) => ({ ...current, region: value as AgreementRegion }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USA">USA</SelectItem>
                  <SelectItem value="Nigeria">Nigeria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Version</Label>
              <Input value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Template content</Label>
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Available placeholders (click to copy)</p>
                <div className="flex flex-wrap gap-1.5">
                  {AGREEMENT_PLACEHOLDERS.map((placeholder) => (
                    <button
                      key={placeholder.token}
                      type="button"
                      title={placeholder.description}
                      onClick={() => {
                        navigator.clipboard?.writeText(placeholder.token);
                        toast.success(`Copied ${placeholder.token}`);
                      }}
                      className="rounded border bg-background px-2 py-0.5 font-mono text-[11px] hover:bg-accent"
                    >
                      {placeholder.token}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea rows={16} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} />
            </div>
            <div className="flex items-center gap-3 md:col-span-2">
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm((current) => ({ ...current, is_active: checked }))} />
              <Label>Active template</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.title}</DialogTitle>
            <DialogDescription>
              {previewTemplate && (
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={previewTemplate.is_active ? 'default' : 'secondary'}>
                    {previewTemplate.is_active ? 'Active' : 'Draft'}
                  </Badge>
                  <Badge variant="outline">v{previewTemplate.version}</Badge>
                  <Badge variant="outline">{previewTemplate.region}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Updated {new Date(previewTemplate.updated_at).toLocaleString()}
                  </span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed rounded border bg-card p-4 max-h-[60vh] overflow-auto">
            {previewTemplate?.content}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}