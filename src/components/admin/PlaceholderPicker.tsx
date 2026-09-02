import { Badge } from '@/components/ui/badge';
import { REPLY_PLACEHOLDERS } from '@/lib/reply-placeholders';

interface Props {
  onInsert: (token: string) => void;
  label?: string;
}

/** Clickable chips that insert {{token}} placeholders into a reply body. */
export const PlaceholderPicker = ({ onInsert, label = 'Insert a placeholder' }: Props) => (
  <div className="space-y-1.5">
    <p className="text-xs text-muted-foreground">
      {label} — values are filled in automatically when the reply is sent.
    </p>
    <div className="flex flex-wrap gap-1.5">
      {REPLY_PLACEHOLDERS.map((p) => (
        <Badge
          key={p.token}
          variant="outline"
          className="cursor-pointer hover:bg-accent text-[11px] font-normal"
          onClick={() => onInsert(`{{${p.token}}}`)}
          title={`Example: ${p.sample}`}
        >
          {p.label}
        </Badge>
      ))}
    </div>
  </div>
);

export default PlaceholderPicker;
