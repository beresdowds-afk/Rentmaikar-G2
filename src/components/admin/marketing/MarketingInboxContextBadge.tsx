import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Share2, 
  Users, 
  ExternalLink, 
  ShieldCheck, 
  Sparkles,
  ChevronRight 
} from 'lucide-react';
import { UnifiedLead } from '@/server/marketing/types';
import { MarketingLeadDetailModal } from './MarketingLeadDetailModal';

interface MarketingInboxContextBadgeProps {
  email?: string | null;
  phone?: string | null;
  userId?: string | null;
}

export const MarketingInboxContextBadge: React.FC<MarketingInboxContextBadgeProps> = ({
  email,
  phone,
  userId,
}) => {
  const [lead, setLead] = useState<UnifiedLead | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const query = email || phone || userId;
    if (!query) {
      setLead(null);
      return;
    }

    const fetchLead = async () => {
      try {
        const res = await fetch(`/api/marketing/leads?search=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.leads && data.leads.length > 0) {
            // Find closest match
            const match = data.leads.find(
              (l: UnifiedLead) =>
                (email && l.email?.toLowerCase() === email.toLowerCase()) ||
                (phone && l.phone === phone) ||
                (userId && l.user_id === userId)
            ) || data.leads[0];
            setLead(match);
          } else if (isMounted) {
            setLead(null);
          }
        }
      } catch {
        if (isMounted) setLead(null);
      }
    };

    fetchLead();
    return () => {
      isMounted = false;
    };
  }, [email, phone, userId]);

  if (!lead) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-2 p-2 px-3 rounded-md bg-primary/5 border border-primary/15 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-primary flex items-center gap-1 text-[11px] uppercase tracking-wider">
            <Share2 className="h-3 w-3" /> Marketing Context:
          </span>
          <Badge variant="outline" className="text-[10px] uppercase font-bold py-0 bg-background text-foreground">
            {lead.acquisition_source}
          </Badge>
          {lead.campaign_name && (
            <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
              Campaign: <strong className="text-foreground">{lead.campaign_name}</strong>
            </span>
          )}
          <Badge variant="secondary" className="text-[10px] font-semibold py-0">
            Stage: {lead.stage.replace('_', ' ')}
          </Badge>
          <Badge variant="outline" className="text-[10px] uppercase py-0">
            Role: {lead.target_role}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] px-2 text-primary font-medium hover:text-primary"
          onClick={() => setModalOpen(true)}
        >
          View Lead Dossier
          <ChevronRight className="h-3 w-3 ml-0.5" />
        </Button>
      </div>

      <MarketingLeadDetailModal
        leadId={lead.id}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
};
