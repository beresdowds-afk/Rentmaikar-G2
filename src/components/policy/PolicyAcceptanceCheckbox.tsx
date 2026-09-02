import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { usePolicyVersions, usePolicyAcceptance } from '@/hooks/useFAQ';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Shield, ExternalLink, Check, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

interface PolicyAcceptanceCheckboxProps {
  onAcceptanceChange?: (accepted: { terms: boolean; privacy: boolean }) => void;
  required?: boolean;
  showVersion?: boolean;
}

export function PolicyAcceptanceCheckbox({ 
  onAcceptanceChange, 
  required = true,
  showVersion = true 
}: PolicyAcceptanceCheckboxProps) {
  const { user } = useAuth();
  const { country } = useRegion();
  const region = country === 'USA' ? 'USA' : 'Nigeria';
  
  const { getActivePolicy } = usePolicyVersions();
  const { acceptances, hasAcceptedPolicy, acceptPolicy, loading: acceptanceLoading } = usePolicyAcceptance(user?.id);
  
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [viewingPolicy, setViewingPolicy] = useState<'terms' | 'privacy' | null>(null);
  const [accepting, setAccepting] = useState(false);

  const activeTerms = getActivePolicy('terms', region);
  const activePrivacy = getActivePolicy('privacy', region);

  // Check if user has already accepted current versions
  useEffect(() => {
    if (user && !acceptanceLoading) {
      const termsAlreadyAccepted = activeTerms ? hasAcceptedPolicy(activeTerms.id) : false;
      const privacyAlreadyAccepted = activePrivacy ? hasAcceptedPolicy(activePrivacy.id) : false;
      
      setTermsAccepted(termsAlreadyAccepted);
      setPrivacyAccepted(privacyAlreadyAccepted);
    }
  }, [user, activeTerms, activePrivacy, acceptances, acceptanceLoading, hasAcceptedPolicy]);

  // Notify parent of acceptance state changes
  useEffect(() => {
    onAcceptanceChange?.({ terms: termsAccepted, privacy: privacyAccepted });
  }, [termsAccepted, privacyAccepted, onAcceptanceChange]);

  const handleAcceptPolicy = async (type: 'terms' | 'privacy') => {
    const policy = type === 'terms' ? activeTerms : activePrivacy;
    if (!policy || !user) return;

    setAccepting(true);
    try {
      await acceptPolicy(policy.id, type, region);
      if (type === 'terms') {
        setTermsAccepted(true);
      } else {
        setPrivacyAccepted(true);
      }
      setViewingPolicy(null);
    } catch (error) {
      console.error('Error accepting policy:', error);
    } finally {
      setAccepting(false);
    }
  };

  const renderPolicyCheckbox = (
    type: 'terms' | 'privacy',
    policy: typeof activeTerms,
    accepted: boolean,
    setAccepted: (val: boolean) => void
  ) => {
    const Icon = type === 'terms' ? FileText : Shield;
    const label = type === 'terms' ? 'Terms of Service' : 'Privacy Policy';
    const alreadyAccepted = policy ? hasAcceptedPolicy(policy.id) : false;

    return (
      <div className="flex items-start gap-3 p-3 border rounded-lg bg-card">
        <Checkbox
          id={`accept-${type}`}
          checked={accepted}
          onCheckedChange={(checked) => {
            if (!alreadyAccepted) {
              setAccepted(!!checked);
            }
          }}
          disabled={alreadyAccepted}
          className="mt-0.5"
        />
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Label 
              htmlFor={`accept-${type}`} 
              className="flex items-center gap-2 cursor-pointer font-medium"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Label>
            {alreadyAccepted && (
              <Badge variant="secondary" className="text-xs">
                <Check className="h-3 w-3 mr-1" />
                Accepted
              </Badge>
            )}
          </div>
          {policy && showVersion && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Version {policy.version}</span>
              <span>•</span>
              <span>Effective {format(new Date(policy.effective_date), 'MMM d, yyyy')}</span>
              <span>•</span>
              <span>{region}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto text-xs"
              onClick={() => setViewingPolicy(type)}
            >
              Read full {label.toLowerCase()}
              <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
            <Link to={type === 'terms' ? '/terms' : '/privacy'} target="_blank">
              <Button variant="link" size="sm" className="p-0 h-auto text-xs text-muted-foreground">
                Open in new tab
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {renderPolicyCheckbox('terms', activeTerms, termsAccepted, setTermsAccepted)}
      {renderPolicyCheckbox('privacy', activePrivacy, privacyAccepted, setPrivacyAccepted)}

      {required && (!termsAccepted || !privacyAccepted) && (
        <p className="text-xs text-muted-foreground">
          * You must accept both policies to continue
        </p>
      )}

      {/* Policy Viewer Dialog */}
      <Dialog open={!!viewingPolicy} onOpenChange={() => setViewingPolicy(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingPolicy === 'terms' ? (
                <>
                  <FileText className="h-5 w-5" />
                  Terms of Service
                </>
              ) : (
                <>
                  <Shield className="h-5 w-5" />
                  Privacy Policy
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {viewingPolicy === 'terms' && activeTerms && (
                <>Version {activeTerms.version} • Effective {format(new Date(activeTerms.effective_date), 'MMMM d, yyyy')} • {region}</>
              )}
              {viewingPolicy === 'privacy' && activePrivacy && (
                <>Version {activePrivacy.version} • Effective {format(new Date(activePrivacy.effective_date), 'MMMM d, yyyy')} • {region}</>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="prose prose-sm max-w-none">
              {viewingPolicy === 'terms' && activeTerms && (
                <div 
                  className="whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ 
                    __html: DOMPurify.sanitize(activeTerms.content.replace(/## /g, '<h2>').replace(/\n/g, '<br/>')) 
                  }}
                />
              )}
              {viewingPolicy === 'privacy' && activePrivacy && (
                <div 
                  className="whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ 
                    __html: DOMPurify.sanitize(activePrivacy.content.replace(/## /g, '<h2>').replace(/\n/g, '<br/>')) 
                  }}
                />
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingPolicy(null)}>
              Close
            </Button>
            {viewingPolicy && user && !hasAcceptedPolicy(
              viewingPolicy === 'terms' ? activeTerms?.id || '' : activePrivacy?.id || ''
            ) && (
              <Button onClick={() => handleAcceptPolicy(viewingPolicy)} disabled={accepting}>
                {accepting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Check className="h-4 w-4 mr-2" />
                I Accept
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
