import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Mail, MessageSquare, Phone, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import {
  renderPlaceholders,
  unknownPlaceholders,
  usedPlaceholders,
  SAMPLE_PLACEHOLDER_VALUES,
  type PlaceholderValues,
} from '@/lib/reply-placeholders';

type MatchType = 'any' | 'all' | 'exact';

export const matchesKeywords = (
  keywords: string[],
  matchType: MatchType,
  text: string,
): boolean => {
  const haystack = (text || '').toLowerCase().trim();
  if (!haystack) return false;
  const list = (keywords || []).map((k) => (k || '').toLowerCase().trim()).filter(Boolean);
  if (list.length === 0) return false;
  switch (matchType) {
    case 'exact':
      return list.some((k) => haystack === k);
    case 'all':
      return list.every((k) => haystack.includes(k));
    default:
      return list.some((k) => haystack.includes(k));
  }
};

interface Props {
  body: string;
  channel?: string | null;
  region?: string | null;
  /** When provided, renders the keyword match tester for auto-reply rules. */
  keywords?: string[];
  matchType?: MatchType;
  /** Real values to preview with. Falls back to sample data. */
  placeholderValues?: PlaceholderValues;
}

const CHANNEL_META: Record<string, { label: string; icon: typeof Mail }> = {
  sms: { label: 'SMS', icon: MessageSquare },
  whatsapp: { label: 'WhatsApp', icon: Phone },
  email: { label: 'Email', icon: Mail },
};

export const AutoReplyPreview = ({
  body,
  channel,
  region,
  keywords,
  matchType = 'any',
  placeholderValues,
}: Props) => {
  const [testMessage, setTestMessage] = useState('');
  const effectiveChannel = channel || 'sms';
  const meta = CHANNEL_META[effectiveChannel] ?? CHANNEL_META.sms;
  const Icon = meta.icon;

  const isMatch = useMemo(
    () => (keywords ? matchesKeywords(keywords, matchType, testMessage) : false),
    [keywords, matchType, testMessage],
  );

  const values = placeholderValues ?? SAMPLE_PLACEHOLDER_VALUES;
  const rendered = useMemo(
    () => renderPlaceholders(body || '', values, { keepUnknown: true }),
    [body, values],
  );
  const tokens = useMemo(() => usedPlaceholders(body || ''), [body]);
  const invalidTokens = useMemo(() => unknownPlaceholders(body || ''), [body]);

  const smsSegments = Math.max(1, Math.ceil((rendered?.length || 0) / 160));

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Live preview</span>
        <Badge variant="secondary">{channel ? meta.label : 'Any channel (SMS view)'}</Badge>
        {region && <Badge variant="outline">{region}</Badge>}
        {effectiveChannel !== 'email' && (
          <Badge variant="outline">
            {rendered?.length || 0} chars · {smsSegments} segment{smsSegments > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {tokens.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Placeholders resolved with {placeholderValues ? 'this conversation’s data' : 'sample data'}:{' '}
          {tokens.map((t) => `{{${t}}}`).join(', ')}
        </p>
      )}

      {invalidTokens.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
          <span>
            Unknown placeholder{invalidTokens.length > 1 ? 's' : ''}:{' '}
            {invalidTokens.map((t) => `{{${t}}}`).join(', ')} — these are sent as-is.
          </span>
        </div>
      )}

      {keywords && (
        <div className="space-y-1.5">
          <Label className="text-xs">Test an inbound message</Label>
          <Input
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            placeholder="e.g. how much do I owe?"
          />
          {testMessage.trim() && (
            <div
              className={`flex items-center gap-1.5 text-xs ${
                isMatch ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {isMatch ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {isMatch
                ? `Rule matches (${matchType}) — the reply below is sent.`
                : `No match (${matchType}) — nothing is sent.`}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {keywords && testMessage.trim() && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-background border px-3 py-2 text-sm whitespace-pre-wrap">
              {testMessage}
            </div>
          </div>
        )}

        {effectiveChannel === 'email' ? (
          <div className="rounded-md border bg-background p-3 text-sm">
            <div className="border-b pb-2 mb-2 text-xs text-muted-foreground">
              From: Rentmaikar Support · Subject: Re: your message
            </div>
            <p className="whitespace-pre-wrap leading-relaxed">
              {rendered?.trim() || <span className="italic text-muted-foreground">No message content yet.</span>}
            </p>
          </div>
        ) : (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-primary/10 border border-primary/20 px-3 py-2 text-sm whitespace-pre-wrap">
              {rendered?.trim() || <span className="italic text-muted-foreground">No message content yet.</span>}
            </div>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Sent as “Rentmaikar Auto-Reply” on the same channel the message arrived on.
        </p>
      </div>
    </div>
  );
};

export default AutoReplyPreview;
