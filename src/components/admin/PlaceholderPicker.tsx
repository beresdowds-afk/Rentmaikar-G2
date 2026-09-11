import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  REPLY_PLACEHOLDERS,
  type PlaceholderDefinition,
  type PlaceholderCategory,
} from '@/lib/reply-placeholders';
import {
  Car,
  Calendar,
  User,
  Link2,
  Building2,
  Sparkles,
  Search,
  Check,
  Brackets,
} from 'lucide-react';

interface Props {
  onInsert: (token: string) => void;
  label?: string;
  defaultFormat?: 'bracket' | 'curly';
  compact?: boolean;
}

const CATEGORY_TABS: { key: PlaceholderCategory | 'all'; label: string; icon: React.ElementType }[] = [
  { key: 'all', label: 'All', icon: Sparkles },
  { key: 'vehicle', label: 'Vehicle', icon: Car },
  { key: 'billing', label: 'Billing & Dates', icon: Calendar },
  { key: 'recipient', label: 'Recipient', icon: User },
  { key: 'links', label: 'Portal Links', icon: Link2 },
  { key: 'company', label: 'Company', icon: Building2 },
];

/** Rich dynamic variable picker for templates (SMS, Email, WhatsApp) */
export const PlaceholderPicker = ({
  onInsert,
  label = 'Dynamic Variables',
  defaultFormat = 'bracket',
  compact = false,
}: Props) => {
  const [format, setFormat] = useState<'bracket' | 'curly'>(defaultFormat);
  const [activeCategory, setActiveCategory] = useState<PlaceholderCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const filteredPlaceholders = useMemo(() => {
    return REPLY_PLACEHOLDERS.filter((p) => {
      const matchesCat = activeCategory === 'all' || p.category === activeCategory;
      if (!matchesCat) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        p.label.toLowerCase().includes(q) ||
        p.token.toLowerCase().includes(q) ||
        p.bracketToken.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    });
  }, [activeCategory, search]);

  const handleTokenClick = (p: PlaceholderDefinition) => {
    const textToInsert = format === 'bracket' ? p.bracketToken : `{{${p.token}}}`;
    onInsert(textToInsert);
    setCopiedToken(textToInsert);
    setTimeout(() => setCopiedToken(null), 1500);
  };

  // Quick primary highlights requested by admins: [VEHICLE_MAKE], [VEHICLE_MODEL], [DUE_DATE]
  const quickHighlights = useMemo(() => {
    return REPLY_PLACEHOLDERS.filter((p) =>
      ['vehicle_make', 'vehicle_model', 'due_date', 'individual_portal_link'].includes(p.token)
    );
  }, []);

  return (
    <div className="rounded-lg border bg-card/60 p-3 space-y-2.5 text-left">
      {/* Header and format selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold tracking-tight">{label}</span>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            (auto-populates when sent)
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground mr-1">Syntax:</span>
          <div className="inline-flex rounded-md border p-0.5 bg-muted/40 text-[11px]">
            <button
              type="button"
              onClick={() => setFormat('bracket')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-colors ${
                format === 'bracket'
                  ? 'bg-background shadow-xs text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Bracket syntax: [VARIABLE_NAME]"
            >
              [VARIABLE]
            </button>
            <button
              type="button"
              onClick={() => setFormat('curly')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-colors ${
                format === 'curly'
                  ? 'bg-background shadow-xs text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Mustache syntax: {{variable_name}}"
            >
              {`{{variable}}`}
            </button>
          </div>
        </div>
      </div>

      {/* Quick shortcuts for requested vehicle & due date variables */}
      <div className="bg-primary/5 border border-primary/20 rounded-md p-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-primary flex items-center gap-1 mr-1">
          <Car className="h-3 w-3" /> Quick Insert:
        </span>
        {quickHighlights.map((p) => {
          const tokenStr = format === 'bracket' ? p.bracketToken : `{{${p.token}}}`;
          return (
            <button
              key={p.token}
              type="button"
              onClick={() => handleTokenClick(p)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-background border border-primary/30 text-[11px] font-mono font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors shadow-xs active:scale-95"
              title={`Click to insert ${tokenStr} (Example: ${p.sample})`}
            >
              {copiedToken === tokenStr ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Brackets className="h-3 w-3 opacity-60" />
              )}
              <span>{tokenStr}</span>
            </button>
          );
        })}
      </div>

      {!compact && (
        <>
          {/* Category Tabs & Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {CATEGORY_TABS.map((tab) => {
                const Icon = tab.icon;
                const isSelected = activeCategory === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveCategory(tab.key)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors ${
                      isSelected
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="relative w-36 sm:w-44">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search variables..."
                className="h-7 pl-7 text-[11px]"
              />
            </div>
          </div>
        </>
      )}

      {/* Placeholders Grid / List */}
      <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
        {filteredPlaceholders.map((p) => {
          const displayToken = format === 'bracket' ? p.bracketToken : `{{${p.token}}}`;
          const isJustInserted = copiedToken === displayToken;

          return (
            <Badge
              key={p.token}
              variant="outline"
              onClick={() => handleTokenClick(p)}
              className={`cursor-pointer transition-all hover:bg-accent hover:border-primary/50 text-[11px] py-1 px-2 font-normal flex items-center gap-1.5 select-none ${
                isJustInserted ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : ''
              }`}
              title={`${p.label}: ${p.description || ''} (Sample: ${p.sample})`}
            >
              <span className="font-mono font-medium text-foreground">{displayToken}</span>
              <span className="text-[10px] text-muted-foreground font-sans border-l pl-1.5">
                {p.label}
              </span>
              {isJustInserted && <Check className="h-3 w-3 text-emerald-500 ml-0.5" />}
            </Badge>
          );
        })}
        {filteredPlaceholders.length === 0 && (
          <p className="text-xs text-muted-foreground py-2 italic">
            No dynamic variables matching "{search}".
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t">
        <span>Click any badge to insert at cursor. Resolved automatically on dispatch.</span>
        <span className="hidden sm:inline">Supported on SMS, Email & WhatsApp</span>
      </div>
    </div>
  );
};

export default PlaceholderPicker;
