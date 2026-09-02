import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MESSAGE_USE_CASES,
  useCaseBody,
  useCaseGroups,
  useCaseSubject,
  type MessageUseCase,
  type UseCaseChannel,
} from '@/lib/message-use-cases';
import {
  SAMPLE_PLACEHOLDER_VALUES,
  missingPlaceholders,
  renderPlaceholders,
  type PlaceholderValues,
} from '@/lib/reply-placeholders';

const CHANNEL_LABEL: Record<UseCaseChannel, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  email: 'Email',
};

interface UseCaseDraftPickerProps {
  /** Channel the draft is written for. */
  channel: UseCaseChannel;
  /** Live placeholder values; sample values are used for anything missing. */
  placeholderValues?: PlaceholderValues;
  onApply: (draft: { body: string; subject: string; keywords: string[] }) => void;
  label?: string;
}

/**
 * Offers ready-made SMS / WhatsApp / email drafts per business use case and
 * previews them with placeholders already resolved, so nothing with an
 * unresolved {{token}} is ever inserted into a message.
 */
export function UseCaseDraftPicker({
  channel,
  placeholderValues,
  onApply,
  label = 'Start from a use case',
}: UseCaseDraftPickerProps) {
  const [selectedId, setSelectedId] = useState<string>('');

  const selected: MessageUseCase | undefined = useMemo(
    () => MESSAGE_USE_CASES.find((u) => u.id === selectedId),
    [selectedId],
  );

  const values = useMemo<PlaceholderValues>(
    () => ({ ...SAMPLE_PLACEHOLDER_VALUES, ...(placeholderValues || {}) }),
    [placeholderValues],
  );

  const rawBody = selected ? useCaseBody(selected, channel) : '';
  const rendered = renderPlaceholders(rawBody, values, { keepUnknown: false });
  const stillMissing = selected ? missingPlaceholders(rawBody, values) : [];
  const usingSamples = !placeholderValues || Object.keys(placeholderValues).length === 0;

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <Label className="flex items-center gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-primary" /> {label}
      </Label>
      <Select value={selectedId} onValueChange={setSelectedId}>
        <SelectTrigger>
          <SelectValue placeholder={`Pick a ${CHANNEL_LABEL[channel]} draft…`} />
        </SelectTrigger>
        <SelectContent>
          {useCaseGroups().map((group) => (
            <SelectGroup key={group}>
              <SelectLabel>{group}</SelectLabel>
              {MESSAGE_USE_CASES.filter((u) => u.group === group).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {selected && (
        <div className="space-y-2">
          {channel === 'email' && (
            <p className="text-xs font-medium">
              Subject: {renderPlaceholders(useCaseSubject(selected), values, { keepUnknown: false })}
            </p>
          )}
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-muted/60 p-2 text-xs">
            {rendered}
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase">
              {CHANNEL_LABEL[channel]}
            </Badge>
            {usingSamples && (
              <span className="text-[11px] text-muted-foreground">
                Preview uses sample values; real recipient details are filled in before sending.
              </span>
            )}
            {!!stillMissing.length && (
              <span className="text-[11px] text-destructive">
                Missing data: {stillMissing.join(', ')}
              </span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              onApply({
                body: useCaseBody(selected, channel),
                subject: useCaseSubject(selected),
                keywords: selected.keywords,
              })
            }
          >
            Use this draft
          </Button>
        </div>
      )}
    </div>
  );
}

export default UseCaseDraftPicker;
