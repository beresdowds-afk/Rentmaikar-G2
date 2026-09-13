import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhoneForwarded, ArrowLeft, ArrowUpRight, ShieldCheck, Mail } from "lucide-react";
import Seo from "@/components/seo/Seo";
import { Link } from "react-router-dom";
import { InboundEmailRoutingEditor, INBOUND_DOMAIN } from "@/components/admin/InboundEmailRoutingEditor";

export default function AdminEmailRoutingPage() {
  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <Seo
        title="Inbound Forwarding | Rentmaikar Admin"
        description="Configure inbound forwarding, mailbox routing tables, and external distribution across all communication channels."
        path="/admin/inbound-forwarding"
      />

      {/* Breadcrumb & Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/admin?portal=support&tab=contacts" className="hover:text-foreground flex items-center gap-1 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Contact Settings
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Channel Control</span>
          <span>/</span>
          <span className="text-primary font-medium">Inbound Forwarding</span>
        </div>

        <Button variant="outline" size="sm" asChild className="h-8 text-xs gap-1.5">
          <a href="/admin?portal=support&tab=contacts#channel-control">
            <PhoneForwarded className="h-3.5 w-3.5 text-primary" /> View in Channel Control <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>

      {/* Header */}
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <PhoneForwarded className="h-6 w-6 text-primary" /> Inbound Forwarding
          </h1>
          <Badge variant="outline" className="text-xs">
            Channel Control
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Configure external delivery and distribution rules for inbound customer communications received on <strong>{INBOUND_DOMAIN}</strong> and regional platform numbers.
        </p>
      </header>

      {/* Overview Card */}
      <Card className="border border-border/80 bg-gradient-to-r from-card to-card/90">
        <CardHeader className="py-3.5 px-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-500" /> Multi-Channel Forwarding Status
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Channel master kill-switches and regional voice/SMS webhooks are synced directly with Channel Control in Contact Settings.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="secondary" className="text-xs">
                Voice · SMS · WhatsApp · Email
              </Badge>
              <Button variant="secondary" size="sm" asChild className="h-7 text-xs">
                <a href="/admin?portal=support&tab=contacts#channel-control">
                  Manage Channels
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Routing Editor */}
      <InboundEmailRoutingEditor />
    </div>
  );
}
