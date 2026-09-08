import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Bookmark,
  Plus,
  Check,
  Sparkles,
  FileText,
  Shield,
  CreditCard,
  Car,
  AlertTriangle,
  HelpCircle,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { renderPlaceholders, type PlaceholderValues } from '@/lib/reply-placeholders';
import { saveToTemplateArchives } from '@/lib/ai-auto-responder';

export interface StandardSavedResponse {
  id: string;
  title: string;
  category: 'Terms & Legal' | 'Payments' | 'Verification' | 'Maintenance' | 'Safety' | 'General';
  channel?: 'email' | 'sms' | 'whatsapp' | 'all';
  subject?: string;
  body: string;
  tags: string[];
}

export const DEFAULT_STANDARDIZED_RESPONSES: StandardSavedResponse[] = [
  {
    id: 'terms-direct-contact',
    title: 'Terms Violation: Off-Platform Communications Ban',
    category: 'Terms & Legal',
    channel: 'all',
    subject: 'Important: Rentmaikar Platform Communication Policy Notice',
    body: `Dear {{first_name}},\n\nWe noticed a request regarding off-platform direct contact. Please be advised that under Rentmaikar Terms of Use (Section 4: Prohibited Activities), exchanging personal contact details or settling payments outside the platform is strictly prohibited to preserve user safety, commercial insurance validity, and escrow deposit guarantees.\n\nAll booking adjustments and questions must proceed through our official communication channels.\n\nThank you for keeping our community safe.\n— Rentmaikar Operations`,
    tags: ['terms', 'prohibited', 'contact', 'legal'],
  },
  {
    id: 'verify-document-clarity',
    title: 'KYC: Request for Clear Driver Document Resubmission',
    category: 'Verification',
    channel: 'all',
    subject: 'Action Needed: Resubmit Driver License for {{customer_name}}',
    body: `Hi {{first_name}},\n\nDuring our onboarding audit, your submitted identification document was flagged as blurry or obscured. Under our Tier-2 verification standards (Section 3: Eligibility), please upload a clear, high-resolution photo of your driver license and proof of address in your portal.\n\nOur verification desk will re-evaluate your file within 12 hours of upload.\n\nRegards,\nRentmaikar Verification Desk`,
    tags: ['verification', 'kyc', 'driver license', 'onboarding'],
  },
  {
    id: 'payments-escrow-refund',
    title: 'Billing: Security Deposit Escrow Return Timeline',
    category: 'Payments',
    channel: 'all',
    subject: 'Update on your Security Deposit Refund for {{vehicle_model}}',
    body: `Dear {{first_name}},\n\nRegarding your security deposit inquiry for {{vehicle_model}}:\nAs outlined in Section 6 of our Terms of Use, security deposits are held securely in escrow during the lease. Following vehicle return and completion of the 360 physical inspection, refunds are processed to your primary bank/card account within 5 to 7 business days.\n\nYou will receive an automated transaction receipt once the settlement is released.\n\nSincerely,\nRentmaikar Accounts & Settlement`,
    tags: ['deposit', 'escrow', 'refund', 'billing'],
  },
  {
    id: 'safety-accident-protocol',
    title: 'Emergency: Immediate Roadside Collision Protocol',
    category: 'Safety',
    channel: 'all',
    subject: 'URGENT: Incident & Roadside Assistance Protocol for {{vehicle_model}}',
    body: `URGENT NOTICE for {{customer_name}}:\n\nPlease confirm that all occupants are safe. Under Section 7 (Insurance & Roadside Assistance), please execute the following immediate steps:\n1. Ensure personal medical safety and contact emergency services if needed.\n2. Obtain an official police report number from the responding officer.\n3. Take 360-degree photos of vehicle damage and any third-party plates.\n4. Do NOT admit liability at the scene.\n\nOur incident hotline is available 24/7 at +1 (800) 555-RENT / +234 800-RENTMAIKAR.\n— Rentmaikar Emergency Desk`,
    tags: ['accident', 'incident', 'emergency', 'insurance', 'police'],
  },
  {
    id: 'maintenance-weekly-reminder',
    title: 'Fleet: Weekly 360 Inspection & Tire Log Reminder',
    category: 'Maintenance',
    channel: 'all',
    subject: 'Scheduled Weekly Inspection Checklist for {{vehicle_model}}',
    body: `Hi {{first_name}},\n\nThis is a friendly reminder that the weekly 360 maintenance log for {{vehicle_model}} is due today. Please take 2 minutes to upload 4 exterior photos, tire tread check, and current odometer reading in your Driver Portal.\n\nTimely uploads keep your lease in good standing and ensure warranty coverage.\n\n— Rentmaikar Fleet Team`,
    tags: ['inspection', 'maintenance', 'tires', 'weekly'],
  },
  {
    id: 'general-support-acknowledgment',
    title: 'General: Inquiry Acknowledged & Under Active Review',
    category: 'General',
    channel: 'all',
    subject: 'We have received your message regarding {{subject}}',
    body: `Hello {{first_name}},\n\nThank you for reaching out to Rentmaikar Support. Your request has been assigned to a designated support officer who is reviewing your account details.\n\nWe aim to resolve all standard inquiries within 2 hours. We will follow up with you right here once your details are verified.\n\nKind regards,\nRentmaikar Customer Support`,
    tags: ['support', 'general', 'ticket', 'acknowledgment'],
  },
];

interface SavedResponsesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectResponse: (response: { subject?: string; body: string }) => void;
  currentDraftBody?: string;
  placeholderValues?: PlaceholderValues;
}

export function SavedResponsesModal({
  open,
  onOpenChange,
  onSelectResponse,
  currentDraftBody,
  placeholderValues = {},
}: SavedResponsesModalProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeView, setActiveView] = useState<'browse' | 'create'>('browse');

  // New response form state
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<string>('General');
  const [newBody, setNewBody] = useState(currentDraftBody || '');
  const [isSaving, setIsSaving] = useState(false);

  // Custom responses stored in localStorage
  const customResponses: StandardSavedResponse[] = useMemo(() => {
    try {
      const stored = localStorage.getItem('rentmaikar:custom_template_archives');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((item: any) => ({
          id: item.id,
          title: item.title,
          category: item.category || 'General',
          channel: item.channel || 'all',
          body: item.body,
          tags: item.keywords || ['custom'],
        }));
      }
    } catch {
      // Ignore
    }
    return [];
  }, [open, isSaving]);

  const allResponses = useMemo(() => {
    return [...customResponses, ...DEFAULT_STANDARDIZED_RESPONSES];
  }, [customResponses]);

  const filteredResponses = useMemo(() => {
    return allResponses.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.body.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [allResponses, selectedCategory, search]);

  const handleInsert = (resp: StandardSavedResponse) => {
    const renderedBody = renderPlaceholders(resp.body, placeholderValues, { keepUnknown: true });
    const renderedSubject = resp.subject
      ? renderPlaceholders(resp.subject, placeholderValues, { keepUnknown: true })
      : undefined;
    onSelectResponse({ subject: renderedSubject, body: renderedBody });
    onOpenChange(false);
    toast.success(`Inserted standardized reply: "${resp.title}"`);
  };

  const handleCreateNew = async () => {
    if (!newTitle.trim() || !newBody.trim()) {
      toast.error('Please enter a title and message body');
      return;
    }

    setIsSaving(true);
    const result = await saveToTemplateArchives({
      title: newTitle.trim(),
      category: newCategory,
      body: newBody.trim(),
      keywords: [newCategory.toLowerCase()],
    });

    setIsSaving(false);
    if (result.success) {
      toast.success(result.message);
      setNewTitle('');
      setNewBody('');
      setActiveView('browse');
    } else {
      toast.error(result.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-5">
        <DialogHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg flex items-center gap-2">
                <Bookmark className="h-5 w-5 text-primary" />
                Saved Standardized Responses
              </DialogTitle>
              <DialogDescription className="text-xs">
                Quickly insert approved responses matched to Terms of Use, KYC policies, and FAQ guidelines.
              </DialogDescription>
            </div>
            <div className="flex rounded-md border p-0.5 text-xs bg-muted/40">
              <button
                type="button"
                onClick={() => setActiveView('browse')}
                className={`px-3 py-1 rounded font-medium transition-all ${
                  activeView === 'browse'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Browse Library
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveView('create');
                  if (currentDraftBody && !newBody) setNewBody(currentDraftBody);
                }}
                className={`px-3 py-1 rounded font-medium transition-all flex items-center gap-1 ${
                  activeView === 'create'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Plus className="h-3 w-3" />
                Save New
              </button>
            </div>
          </div>
        </DialogHeader>

        {activeView === 'browse' ? (
          <div className="space-y-3 flex-1 overflow-hidden flex flex-col pt-2">
            {/* Search & Category Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by keyword (e.g., terms, license, deposit, accident)..."
                  className="pl-8 h-8 text-xs bg-background"
                />
              </div>

              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-8 text-xs sm:w-[160px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="Terms & Legal">Terms & Legal</SelectItem>
                  <SelectItem value="Verification">Verification / KYC</SelectItem>
                  <SelectItem value="Payments">Payments & Escrow</SelectItem>
                  <SelectItem value="Safety">Safety & Incidents</SelectItem>
                  <SelectItem value="Maintenance">Maintenance</SelectItem>
                  <SelectItem value="General">General Support</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Response Cards List */}
            <ScrollArea className="flex-1 pr-3 max-h-[480px]">
              {filteredResponses.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground space-y-2">
                  <FileText className="h-8 w-8 mx-auto opacity-40" />
                  <p className="text-sm font-medium">No matching standardized responses</p>
                  <p className="text-xs">Try searching for different keywords or create a new response.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredResponses.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-lg border bg-card hover:bg-muted/40 transition-all space-y-2 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-foreground">
                              {item.title}
                            </span>
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {item.category}
                            </Badge>
                          </div>
                          {item.subject && (
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">
                              Subject: {item.subject}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleInsert(item)}
                          className="h-7 px-2.5 text-xs gap-1 opacity-90 group-hover:opacity-100"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Insert Reply
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed whitespace-pre-wrap">
                        {item.body}
                      </p>

                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        {item.tags.map((t) => (
                          <span
                            key={t}
                            className="px-1.5 py-0.5 rounded bg-muted/60 text-[10px] text-muted-foreground font-mono"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="space-y-3.5 pt-3 flex-1 overflow-y-auto">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Standard Response Title</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Terms Violation: Subleasing Policy"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Terms & Legal">Terms & Legal</SelectItem>
                  <SelectItem value="Verification">Verification / KYC</SelectItem>
                  <SelectItem value="Payments">Payments & Escrow</SelectItem>
                  <SelectItem value="Safety">Safety & Incidents</SelectItem>
                  <SelectItem value="Maintenance">Maintenance</SelectItem>
                  <SelectItem value="General">General Support</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Response Template Body</Label>
              <Textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Type the standardized message template. You can use placeholders like {{first_name}}, {{vehicle_model}}, {{customer_name}}..."
                className="min-h-[160px] text-xs leading-relaxed"
              />
              <p className="text-[11px] text-muted-foreground">
                Tokens like <code>{'{{first_name}}'}</code>, <code>{'{{vehicle_model}}'}</code>, and <code>{'{{today}}'}</code> are auto-resolved upon insertion.
              </p>
            </div>

            <DialogFooter className="pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveView('browse')}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateNew}
                disabled={isSaving || !newTitle.trim() || !newBody.trim()}
                className="text-xs gap-1.5"
              >
                <Bookmark className="h-3.5 w-3.5" />
                {isSaving ? 'Saving...' : 'Save & Archive Response'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
