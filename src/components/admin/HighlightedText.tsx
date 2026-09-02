import { ReactNode } from 'react';

/** Renders text with all case-insensitive occurrences of `query` highlighted. */
export const HighlightedText = ({
  text,
  query,
  className,
}: {
  text: string;
  query?: string;
  className?: string;
}) => {
  const q = (query || '').trim();
  if (!q) return <span className={className}>{text}</span>;

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  const nodes: ReactNode[] = parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded bg-primary/25 px-0.5 text-foreground">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );

  return <span className={className}>{nodes}</span>;
};
