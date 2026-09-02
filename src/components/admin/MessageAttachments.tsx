import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, FileText, ImageIcon, Loader2, ExternalLink, AlertTriangle, ScanText, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  InboxAttachment,
  attachmentOcrKey,
  formatFileSize,
  isImageAttachment,
  parseMessageAttachments,
  resolveAttachmentUrl,
  supportsOcr,
} from '@/lib/inbox-attachments';
import { useAttachmentOcr } from '@/hooks/useAttachmentOcr';
import { HighlightedText } from '@/components/admin/HighlightedText';
import { logAttachmentAccess } from '@/lib/inbox-attachment-audit';

const ImageThumb = ({ attachment, onOpen }: { attachment: InboxAttachment; onOpen: () => void }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resolveAttachmentUrl(attachment).then(({ url }) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [attachment]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative h-24 w-24 overflow-hidden rounded-md border bg-muted"
      aria-label={`Open ${attachment.name}`}
    >
      {src ? (
        <img src={src} alt={attachment.name} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </span>
      )}
    </button>
  );
};

export const MessageAttachments = ({
  metadata,
  compact = false,
  messageId = null,
  conversationId = null,
  highlightQuery = '',
}: {
  metadata: unknown;
  compact?: boolean;
  messageId?: string | null;
  conversationId?: string | null;
  highlightQuery?: string;
}) => {
  const attachments = parseMessageAttachments(metadata);
  const [preview, setPreview] = useState<{ attachment: InboxAttachment; url: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { records, isRunning, run } = useAttachmentOcr(messageId, conversationId);

  if (attachments.length === 0) return null;

  const ocrFor = (a: InboxAttachment) => records[attachmentOcrKey(a)];

  const scan = async (a: InboxAttachment, force = false) => {
    const { error } = await run([a], force);
    void logAttachmentAccess({
      attachment: a,
      action: 'ocr',
      messageId,
      conversationId,
      succeeded: !error,
      error: error ?? null,
    });
    if (error) toast.error(error);
    else {
      setExpanded((prev) => ({ ...prev, [attachmentOcrKey(a)]: true }));
      toast.success(`Text extracted from ${a.name}`);
    }
  };

  const OcrPanel = ({ attachment }: { attachment: InboxAttachment }) => {
    if (!messageId || !supportsOcr(attachment)) return null;
    const key = attachmentOcrKey(attachment);
    const record = ocrFor(attachment);
    const open = expanded[key];

    return (
      <div className="mt-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={isRunning}
            onClick={() => (record?.status === 'completed' ? setExpanded((p) => ({ ...p, [key]: !open })) : scan(attachment))}
          >
            {isRunning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ScanText className="h-3 w-3" />
            )}
            {record?.status === 'completed'
              ? open
                ? 'Hide text'
                : `Show text (${record.char_count})`
              : 'Extract text (OCR)'}
          </Button>
          {record?.status === 'completed' && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-2 text-[11px]"
              disabled={isRunning}
              onClick={() => scan(attachment, true)}
            >
              <RefreshCw className="h-3 w-3" /> Re-scan
            </Button>
          )}
          {record?.status === 'failed' && (
            <Badge variant="outline" className="text-[10px] text-orange-600">
              {record.error || 'OCR failed'}
            </Badge>
          )}
        </div>

        {open && record?.status === 'completed' && (
          <div className="max-h-48 overflow-auto rounded-md border bg-background/70 p-2 text-[11px] leading-relaxed whitespace-pre-wrap text-foreground">
            {record.extracted_text ? (
              <HighlightedText text={record.extracted_text} query={highlightQuery} />
            ) : (
              <span className="text-muted-foreground">No text detected in this file.</span>
            )}
          </div>
        )}
      </div>
    );
  };

  const open = async (attachment: InboxAttachment, mode: 'view' | 'download') => {
    setBusyId(attachment.id);
    const { url, error } = await resolveAttachmentUrl(attachment);
    setBusyId(null);
    if (!url) {
      void logAttachmentAccess({
        attachment,
        action: mode === 'download' ? 'download' : 'view',
        messageId,
        conversationId,
        succeeded: false,
        error: error || 'Could not resolve attachment URL',
      });
      toast.error(error || 'Could not open attachment');
      return;
    }
    if (mode === 'view' && isImageAttachment(attachment)) {
      void logAttachmentAccess({ attachment, action: 'preview', messageId, conversationId });
      setPreview({ attachment, url });
      return;
    }
    if (mode === 'download') {
      void logAttachmentAccess({ attachment, action: 'download', messageId, conversationId });
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.name;
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    void logAttachmentAccess({ attachment, action: 'open_external', messageId, conversationId });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const accepted = attachments.filter((a) => a.status === 'accepted');
  const rejected = attachments.filter((a) => a.status === 'rejected');

  return (
    <div className={compact ? 'mt-1 space-y-1' : 'mt-2 space-y-2'}>
      {accepted.some(isImageAttachment) && (
        <div className="flex flex-wrap gap-2">
          {accepted.filter(isImageAttachment).map((a) => (
            <div key={a.id} className="space-y-1">
              <ImageThumb attachment={a} onOpen={() => open(a, 'view')} />
              <OcrPanel attachment={a} />
            </div>
          ))}
        </div>
      )}

      {accepted
        .filter((a) => !isImageAttachment(a))
        .map((a) => (
          <div key={a.id} className="rounded-md border bg-background/60 p-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{a.name}</p>
              {formatFileSize(a.size) && (
                <p className="text-[10px] text-muted-foreground">{formatFileSize(a.size)}</p>
              )}
            </div>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => open(a, 'view')}>
              {busyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => open(a, 'download')}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
          <OcrPanel attachment={a} />
          </div>
        ))}

      {rejected.map((a) => (
        <div key={a.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <AlertTriangle className="h-3 w-3 text-orange-500" />
          <span className="truncate">{a.name}</span>
          <Badge variant="outline" className="text-[10px]">{a.reason || 'Rejected'}</Badge>
        </div>
      ))}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4" />
              <span className="truncate">{preview?.attachment.name}</span>
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <img
                src={preview.url}
                alt={preview.attachment.name}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    void logAttachmentAccess({
                      attachment: preview.attachment,
                      action: 'open_external',
                      messageId,
                      conversationId,
                    });
                    window.open(preview.url, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <ExternalLink className="mr-1 h-4 w-4" /> Open in new tab
                </Button>
                <Button onClick={() => open(preview.attachment, 'download')}>
                  <Download className="mr-1 h-4 w-4" /> Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
