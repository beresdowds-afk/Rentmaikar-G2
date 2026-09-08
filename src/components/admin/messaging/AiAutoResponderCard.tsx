import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  ShieldCheck,
  FileText,
  HelpCircle,
  CheckCircle2,
  ListTodo,
  Bookmark,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Copy,
  Check,
  Zap,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  analyzeInboundMessage,
  queueDraftToAdminTodoList,
  saveToTemplateArchives,
  type AiAutoResponseResult,
  type MatchedCitation,
} from '@/lib/ai-auto-responder';
import type { PlaceholderValues } from '@/lib/reply-placeholders';

interface AiAutoResponderCardProps {
  conversationId: string;
  customerName: string;
  channel: 'email' | 'sms' | 'whatsapp';
  latestInboundContent: string;
  conversationSubject?: string;
  placeholderValues?: PlaceholderValues;
  onApplyDraft: (draft: { subject?: string; body: string }) => void;
  onRefreshTodoList?: () => void;
}

export function AiAutoResponderCard({
  conversationId,
  customerName,
  channel,
  latestInboundContent,
  conversationSubject = '',
  placeholderValues = {},
  onApplyDraft,
  onRefreshTodoList,
}: AiAutoResponderCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isQueuingTodo, setIsQueuingTodo] = useState(false);
  const [isSavedToArchive, setIsSavedToArchive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [todoQueued, setTodoQueued] = useState(false);

  // Analyze inbound message content against knowledge base (Terms, Legal, FAQ)
  const analysis: AiAutoResponseResult = useMemo(() => {
    return analyzeInboundMessage(latestInboundContent, conversationSubject, placeholderValues);
  }, [latestInboundContent, conversationSubject, placeholderValues]);

  // Selected channel body
  const channelDraft = useMemo(() => {
    if (channel === 'whatsapp') return analysis.draftBody.whatsapp;
    if (channel === 'sms') return analysis.draftBody.sms;
    return analysis.draftBody.email;
  }, [analysis, channel]);

  // Reset states if conversation changes
  useEffect(() => {
    setIsSavedToArchive(false);
    setTodoQueued(false);
  }, [conversationId]);

  const handleApply = () => {
    onApplyDraft({
      subject: channel === 'email' ? analysis.recommendedSubject : undefined,
      body: channelDraft,
    });
    toast.success('AI Draft applied to message composer with regulatory citations!');
  };

  const handleQueueTodo = async () => {
    setIsQueuingTodo(true);
    const result = await queueDraftToAdminTodoList({
      conversationId,
      customerName,
      channel,
      topic: analysis.topic,
      priority: analysis.suggestedPriority,
      draftSubject: analysis.recommendedSubject,
      draftContent: channelDraft,
      matchedCitations: analysis.matchedCitations,
    });

    setIsQueuingTodo(false);
    if (result.success) {
      setTodoQueued(true);
      toast.success(result.message);
      if (onRefreshTodoList) onRefreshTodoList();
    } else {
      toast.error(result.message);
    }
  };

  const handleSaveToArchive = async () => {
    const result = await saveToTemplateArchives({
      title: `${analysis.topic.toUpperCase()}: ${analysis.recommendedSubject || 'Standard Response'}`,
      category: analysis.topic === 'terms_compliance' ? 'Terms & Legal' : 'General',
      channel,
      body: channelDraft,
      keywords: analysis.detectedKeywords,
    });

    if (result.success) {
      setIsSavedToArchive(true);
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(channelDraft);
    setCopied(true);
    toast.success('Draft copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const priorityColor =
    analysis.suggestedPriority === 'urgent'
      ? 'bg-red-500/10 text-red-600 border-red-500/30'
      : analysis.suggestedPriority === 'high'
      ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
      : 'bg-blue-500/10 text-blue-600 border-blue-500/30';

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-primary/[0.02] to-background p-3.5 shadow-sm space-y-3">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-tight text-foreground flex items-center gap-1.5">
                AI Auto-Responder
                <Badge variant="outline" className={`text-[10px] h-4 px-1.5 font-medium ${priorityColor}`}>
                  {analysis.suggestedPriority.toUpperCase()} PRIORITY
                </Badge>
                {todoQueued && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-0.5" /> In Admin TODO List
                  </Badge>
                )}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Detected key words matched against Terms of Use, Legal Agreements, and FAQ pages.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-3 pt-1 border-t border-primary/10">
          {/* Key Words & Grounding Badges */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] font-medium text-muted-foreground">Key Words:</span>
            {analysis.detectedKeywords.map((kw) => (
              <Badge key={kw} variant="secondary" className="text-[10px] h-4 px-1.5 bg-muted text-foreground">
                #{kw}
              </Badge>
            ))}

            <span className="text-[11px] font-medium text-muted-foreground ml-2">Grounded In:</span>
            {analysis.matchedCitations.slice(0, 2).map((cit, idx) => (
              <Badge key={idx} variant="outline" className="text-[10px] h-4 px-1.5 gap-1 border-primary/30 text-primary">
                <ShieldCheck className="h-2.5 w-2.5" />
                {cit.source}: {cit.section}
              </Badge>
            ))}
          </div>

          {/* AI Response Preview Card */}
          <div className="p-3 rounded-lg border bg-background/80 space-y-2 text-xs">
            {channel === 'email' && (
              <div className="font-semibold text-foreground flex items-center justify-between pb-1 border-b">
                <span>Subject: {analysis.recommendedSubject}</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  Confidence: {Math.round(analysis.confidence * 100)}%
                </span>
              </div>
            )}
            <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {channelDraft}
            </p>
          </div>

          {/* Legal / FAQ Reference Citations Accordion Excerpt */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {analysis.matchedCitations.map((cit, idx) => (
              <div key={idx} className="p-2 rounded-md bg-muted/40 border text-[11px] space-y-1">
                <div className="flex items-center justify-between font-semibold text-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3 text-primary" />
                    {cit.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase">{cit.source}</span>
                </div>
                <p className="text-muted-foreground line-clamp-2 italic">
                  "{cit.excerpt}"
                </p>
              </div>
            ))}
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={handleApply}
                className="h-7 text-xs gap-1.5 shadow-sm"
              >
                <ArrowRight className="h-3 w-3" />
                Apply to Message Composer
              </Button>

              <Button
                size="sm"
                variant={todoQueued ? 'secondary' : 'outline'}
                onClick={handleQueueTodo}
                disabled={isQueuingTodo || todoQueued}
                className="h-7 text-xs gap-1.5"
              >
                <ListTodo className="h-3 w-3 text-primary" />
                {isQueuingTodo ? 'Queuing...' : todoQueued ? 'Queued to TODO' : 'Update Admin TODO List'}
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSaveToArchive}
                disabled={isSavedToArchive}
                className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                title="Save this response to Template Archives so it is stored for future automated matching"
              >
                <Bookmark className="h-3 w-3" />
                {isSavedToArchive ? 'Archived' : 'Archive as Template'}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopy}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
