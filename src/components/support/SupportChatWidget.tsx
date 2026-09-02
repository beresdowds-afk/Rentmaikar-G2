import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, Loader2, MinusCircle, Paperclip, FileIcon, ImageIcon, XCircle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useSupportChat, MessageAttachment } from '@/hooks/useSupportChat';
import { format } from 'date-fns';
import { toast } from 'sonner';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/csv'
];

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImageType = (type: string) => type.startsWith('image/');

const AttachmentPreview = ({ 
  attachment, 
  onRemove 
}: { 
  attachment: MessageAttachment; 
  onRemove?: () => void;
}) => (
  <div className="relative group inline-flex items-center gap-2 bg-muted rounded-lg p-2 text-xs">
    {isImageType(attachment.type) ? (
      <ImageIcon className="w-4 h-4 text-primary" />
    ) : (
      <FileIcon className="w-4 h-4 text-muted-foreground" />
    )}
    <span className="max-w-[120px] truncate">{attachment.name}</span>
    <span className="text-muted-foreground">({formatFileSize(attachment.size)})</span>
    {onRemove && (
      <button
        onClick={onRemove}
        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <XCircle className="w-3 h-3" />
      </button>
    )}
  </div>
);

const MessageAttachments = ({ attachments }: { attachments: MessageAttachment[] }) => (
  <div className="flex flex-wrap gap-2 mt-2">
    {attachments.map((att, idx) => (
      <a
        key={idx}
        href={att.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 bg-background/50 hover:bg-background rounded-lg p-2 text-xs transition-colors border border-border"
      >
        {isImageType(att.type) ? (
          <img 
            src={att.url} 
            alt={att.name} 
            className="w-16 h-16 object-cover rounded"
          />
        ) : (
          <>
            <FileIcon className="w-4 h-4 text-muted-foreground" />
            <span className="max-w-[100px] truncate">{att.name}</span>
          </>
        )}
      </a>
    ))}
  </div>
);

const SupportChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isLoading,
    isSending,
    isUploading,
    unreadCount,
    sendMessage,
    uploadAttachment,
  } = useSupportChat();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current && isOpen && !isMinimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen, isMinimized]);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`File "${file.name}" is too large. Maximum size is 10MB.`);
        continue;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`File type "${file.type}" is not supported.`);
        continue;
      }

      const attachment = await uploadAttachment(file);
      if (attachment) {
        setPendingAttachments(prev => [...prev, attachment]);
      }
    }
  }, [uploadAttachment]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    await processFiles(files);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only set isDragging to false if we're leaving the drop zone entirely
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFiles(files);
    }
  }, [processFiles]);

  const handleRemoveAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if ((!message.trim() && pendingAttachments.length === 0) || isSending || isUploading) return;
    
    const content = message;
    const attachments = [...pendingAttachments];
    
    setMessage('');
    setPendingAttachments([]);
    
    await sendMessage(content, attachments.length > 0 ? attachments : undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleOpen = () => {
    if (isOpen && !isMinimized) {
      setIsOpen(false);
    } else if (isOpen && isMinimized) {
      setIsMinimized(false);
    } else {
      setIsOpen(true);
      setIsMinimized(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleFileSelect}
      />

      {/* Chat Window */}
      {isOpen && (
        <div
          ref={dropZoneRef}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={cn(
            "bg-card border border-border rounded-xl shadow-2xl transition-all duration-300 overflow-hidden relative",
            isMinimized ? "w-64 h-12" : "w-80 sm:w-96 h-[32rem]"
          )}
        >
          {/* Drag overlay */}
          {isDragging && !isMinimized && (
            <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-xl flex flex-col items-center justify-center">
              <Upload className="w-12 h-12 text-primary mb-2 animate-bounce" />
              <p className="text-sm font-medium text-primary">Drop files here</p>
              <p className="text-xs text-muted-foreground mt-1">Images, PDFs, documents</p>
            </div>
          )}

          {/* Header */}
          <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              <span className="font-semibold text-sm">Support Chat</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                <MinusCircle className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          {!isMinimized && (
            <>
              {/* Messages */}
              <ScrollArea className="h-[calc(100%-10rem)] p-4" ref={scrollRef}>
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <MessageCircle className="w-12 h-12 text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Need help? Send us a message and we'll get back to you as soon as possible.
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Drag & drop files or click <Paperclip className="inline w-3 h-3" /> to attach.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex flex-col max-w-[85%]",
                          msg.sender_type === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                        )}
                      >
                        <div
                          className={cn(
                            "rounded-2xl px-3 py-2 text-sm",
                            msg.sender_type === 'user'
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted text-foreground rounded-bl-md"
                          )}
                        >
                          {msg.content}
                          {msg.metadata?.attachments && msg.metadata.attachments.length > 0 && (
                            <MessageAttachments attachments={msg.metadata.attachments} />
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1 px-1">
                          {format(new Date(msg.created_at), 'h:mm a')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Pending Attachments */}
              {pendingAttachments.length > 0 && (
                <div className="px-3 py-2 border-t border-border bg-muted/30">
                  <div className="flex flex-wrap gap-2">
                    {pendingAttachments.map((att, idx) => (
                      <AttachmentPreview
                        key={idx}
                        attachment={att}
                        onRemove={() => handleRemoveAttachment(idx)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="p-3 border-t border-border bg-background/50">
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Paperclip className="w-4 h-4" />
                    )}
                  </Button>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your message..."
                    className="min-h-[2.5rem] max-h-20 resize-none text-sm"
                    rows={1}
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={(!message.trim() && pendingAttachments.length === 0) || isSending || isUploading}
                    className="shrink-0"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 text-center">
                  Ctrl+Enter to send • Drag & drop files
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating Button */}
      <Button
        onClick={toggleOpen}
        size="icon"
        className={cn(
          "h-14 w-14 rounded-full shadow-lg transition-transform hover:scale-105",
          isOpen ? "bg-muted hover:bg-muted/80 text-foreground" : "bg-primary hover:bg-primary/90"
        )}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <div className="relative">
            <MessageCircle className="w-6 h-6" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </div>
        )}
      </Button>
    </div>
  );
};

export default SupportChatWidget;
