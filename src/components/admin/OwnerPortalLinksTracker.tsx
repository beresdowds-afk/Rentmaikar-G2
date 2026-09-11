import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Link2,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  Ban,
  Copy,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { ownerPortalLinkService, OwnerPortalTokenRecord } from '@/services/ownerPortalLinkService';

export function OwnerPortalLinksTracker() {
  const [tokens, setTokens] = useState<OwnerPortalTokenRecord[]>([]);
  const [search, setSearch] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadTokens = () => {
    setTokens(ownerPortalLinkService.getIssuedTokens());
  };

  useEffect(() => {
    loadTokens();
  }, []);

  const handleCopyLink = (token: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/owner/portal-access?token=${encodeURIComponent(token)}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success('Portal link copied to clipboard');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleRevoke = (token: string) => {
    const success = ownerPortalLinkService.revokeToken(token);
    if (success) {
      toast.success('Portal link revoked');
      loadTokens();
    }
  };

  const handleTestLink = (token: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/owner/portal-access?token=${encodeURIComponent(token)}`;
    window.open(url, '_blank');
  };

  const filtered = tokens.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.owner_name.toLowerCase().includes(q) ||
      (t.owner_email && t.owner_email.toLowerCase().includes(q)) ||
      (t.owner_phone && t.owner_phone.includes(q)) ||
      t.token.toLowerCase().includes(q) ||
      (t.channel && t.channel.toLowerCase().includes(q))
    );
  });

  return (
    <Card className="shadow-sm border-border/80">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Issued One-Time Owner Portal Links
            </CardTitle>
            <CardDescription className="text-xs">
              Audit single-use portal tokens created for vehicle onboarding, compliance, and phone verification.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-48 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search owner or token..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs bg-background"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={loadTokens}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground space-y-1">
            <ShieldCheck className="h-8 w-8 text-muted-foreground/50 mx-auto" />
            <p className="font-medium text-foreground">No one-time portal links found</p>
            <p>
              Generate single-use links directly from any template in the Canned Messages list above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table className="text-xs">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-semibold">Recipient Owner</TableHead>
                  <TableHead className="font-semibold">Channel</TableHead>
                  <TableHead className="font-semibold">Token ID</TableHead>
                  <TableHead className="font-semibold">Issued Date</TableHead>
                  <TableHead className="font-semibold">Expiry</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => {
                  const isExpired = new Date(t.expires_at) < new Date();
                  return (
                    <TableRow key={t.token}>
                      <TableCell>
                        <div className="font-medium text-foreground">{t.owner_name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {t.owner_phone || t.owner_email || 'No contact provided'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-[10px]">
                          {t.channel || 'generic'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        {t.token.slice(0, 10)}…{t.token.slice(-4)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(t.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {t.is_used ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Redeemed
                          </Badge>
                        ) : isExpired ? (
                          <Badge
                            variant="secondary"
                            className="text-[10px] gap-1 bg-destructive/10 text-destructive border-destructive/20"
                          >
                            <Clock className="h-3 w-3" />
                            Expired
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                          >
                            <Clock className="h-3 w-3" />
                            Active (Unused)
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleCopyLink(t.token)}
                            title="Copy full portal link"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleTestLink(t.token)}
                            title="Open link in new tab"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                          {!t.is_used && !isExpired && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleRevoke(t.token)}
                              title="Revoke link"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default OwnerPortalLinksTracker;
