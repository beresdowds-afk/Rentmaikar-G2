import { useEffect, useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getInboundAttachmentUrl,
  type InboundEmailAttachment,
} from "@/lib/inbound-email-api";

type ResolvedAttachment = {
  url: string;
  expiresAt: number;
};

const URL_CACHE = new Map<
  string,
  ResolvedAttachment
>();

const isImageAttachment = (
  attachment: InboundEmailAttachment,
): boolean => {
  const contentType =
    attachment.contentType?.toLowerCase() || "";

  const filename =
    attachment.filename.toLowerCase();

  return (
    contentType.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(
      filename,
    )
  );
};

const formatFileSize = (
  bytes: number | null,
): string => {
  if (!bytes || bytes <= 0) {
    return "";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
};

const resolveAttachment = async (
  attachmentId: string,
): Promise<{
  url: string | null;
  error?: string;
}> => {
  if (!attachmentId) {
    return {
      url: null,
      error: "Attachment ID is required",
    };
  }

  const cached =
    URL_CACHE.get(attachmentId);

  if (
    cached &&
    cached.expiresAt > Date.now() + 30_000
  ) {
    return {
      url: cached.url,
    };
  }

  try {
    const result =
      await getInboundAttachmentUrl(
        attachmentId,
      );

    if (
      result.error ||
      !result.data?.url
    ) {
      return {
        url: null,
        error:
          result.error?.message ||
          "Unable to retrieve attachment",
      };
    }

    const expiresIn =
      Number(
        result.data.expiresIn,
      ) || 300;

    URL_CACHE.set(attachmentId, {
      url: result.data.url,
      expiresAt:
        Date.now() +
        expiresIn * 1000,
    });

    return {
      url: result.data.url,
    };
  } catch (error: any) {
    return {
      url: null,
      error:
        error?.message ||
        "Unable to retrieve attachment",
    };
  }
};

const ImageThumb = ({
  attachment,
  onOpen,
}: {
  attachment: InboundEmailAttachment;
  onOpen: () => void;
}) => {
  const [src, setSrc] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setSrc(null);

    resolveAttachment(attachment.id)
      .then(({ url }) => {
        if (!active) return;

        setSrc(url);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [attachment.id]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative h-24 w-24 overflow-hidden rounded-md border bg-muted"
      aria-label={`Open ${attachment.filename}`}
    >
      {loading ? (
        <span className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </span>
      ) : src ? (
        <img
          src={src}
          alt={attachment.filename}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
          Unable to load
        </span>
      )}
    </button>
  );
};

export const InboundEmailAttachments = ({
  attachments,
  compact = false,
}: {
  attachments: InboundEmailAttachment[];
  compact?: boolean;
}) => {
  const [preview, setPreview] =
    useState<{
      attachment: InboundEmailAttachment;
      url: string;
    } | null>(null);

  const [busyId, setBusyId] =
    useState<string | null>(null);

  if (!attachments?.length) {
    return null;
  }

  const storedAttachments =
    attachments.filter(
      (attachment) =>
        attachment.storageStatus ===
        "stored",
    );

  const unavailableAttachments =
    attachments.filter(
      (attachment) =>
        attachment.storageStatus !==
        "stored",
    );

  const open = async (
    attachment: InboundEmailAttachment,
    mode: "view" | "download",
  ) => {
    setBusyId(attachment.id);

    const { url, error } =
      await resolveAttachment(
        attachment.id,
      );

    setBusyId(null);

    if (!url) {
      toast.error(
        error ||
          "Could not retrieve attachment",
      );
      return;
    }

    if (
      mode === "view" &&
      isImageAttachment(attachment)
    ) {
      setPreview({
        attachment,
        url,
      });
      return;
    }

    if (mode === "download") {
      const link =
        document.createElement("a");

      link.href = url;
      link.download =
        attachment.filename;
      link.rel =
        "noopener noreferrer";

      document.body.appendChild(link);
      link.click();
      link.remove();

      return;
    }

    window.open(
      url,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div
      className={
        compact
          ? "mt-1 space-y-1"
          : "mt-2 space-y-2"
      }
    >
      {storedAttachments.some(
        isImageAttachment,
      ) && (
        <div className="flex flex-wrap gap-2">
          {storedAttachments
            .filter(isImageAttachment)
            .map((attachment) => (
              <div
                key={attachment.id}
                className="space-y-1"
              >
                <ImageThumb
                  attachment={attachment}
                  onOpen={() =>
                    open(
                      attachment,
                      "view",
                    )
                  }
                />
              </div>
            ))}
        </div>
      )}

      {storedAttachments
        .filter(
          (attachment) =>
            !isImageAttachment(
              attachment,
            ),
        )
        .map((attachment) => (
          <div
            key={attachment.id}
            className="rounded-md border bg-background/60 p-2"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {attachment.filename}
                </p>

                {formatFileSize(
                  attachment.sizeBytes,
                ) && (
                  <p className="text-[10px] text-muted-foreground">
                    {formatFileSize(
                      attachment.sizeBytes,
                    )}
                  </p>
                )}
              </div>

              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() =>
                  open(
                    attachment,
                    "view",
                  )
                }
                disabled={
                  busyId ===
                  attachment.id
                }
                aria-label={`Open ${attachment.filename}`}
              >
                {busyId ===
                attachment.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() =>
                  open(
                    attachment,
                    "download",
                  )
                }
                disabled={
                  busyId ===
                  attachment.id
                }
                aria-label={`Download ${attachment.filename}`}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}

      {unavailableAttachments.map(
        (attachment) => (
          <div
            key={attachment.id}
            className="rounded-md border border-dashed p-2 text-[11px] text-muted-foreground"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5" />

              <span className="truncate">
                {attachment.filename}
              </span>

              <span className="ml-auto">
                {attachment.storageStatus}
              </span>
            </div>

            {attachment.downloadError && (
              <p className="mt-1 text-[10px] text-orange-600">
                {attachment.downloadError}
              </p>
            )}
          </div>
        ),
      )}

      <Dialog
        open={!!preview}
        onOpenChange={(openState) => {
          if (!openState) {
            setPreview(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4" />

              <span className="truncate">
                {preview?.attachment.filename}
              </span>
            </DialogTitle>
          </DialogHeader>

          {preview && (
            <div className="space-y-3">
              <img
                src={preview.url}
                alt={
                  preview.attachment
                    .filename
                }
                className="max-h-[70vh] w-full rounded-md object-contain"
              />

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      preview.url,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                >
                  <ExternalLink className="mr-1 h-4 w-4" />
                  Open in new tab
                </Button>

                <Button
                  onClick={() =>
                    open(
                      preview.attachment,
                      "download",
                    )
                  }
                >
                  <Download className="mr-1 h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
