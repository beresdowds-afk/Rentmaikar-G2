import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Cpu, Download, Smartphone, ChevronDown, ChevronUp, Wrench, Zap, ZapOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PersonaVerificationSettings } from '@/components/admin/PersonaVerificationSettings';
import { FrontendBackendDisconnectSwitch } from '@/components/admin/FrontendBackendDisconnectSwitch';
import { StaffOnboardingDownloads } from '@/components/staff/StaffOnboardingDownloads';
import { InstallAppBanner } from '@/components/pwa/InstallAppBanner';
import { useBackendBridge } from '@/hooks/useBackendBridge';

interface AdminOperationsBarProps {
  appName?: string;
  showDisconnectSwitch?: boolean;
}

export function AdminOperationsBar({
  appName = 'Rentmaikar Admin',
  showDisconnectSwitch = true,
}: AdminOperationsBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('bridge');
  const { statusInfo } = useBackendBridge();
  const isBridgeConnected = !statusInfo.isDisconnected;

  return (
    <div className="space-y-3 mb-6">
      {/* Sleek Operations Status & Quick Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 sm:px-4 rounded-xl border bg-card text-card-foreground shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Persona Verification Embedded Status */}
          <div className="flex items-center gap-2 pr-3 border-r border-border/60">
            <PersonaVerificationSettings compact />
          </div>

          {/* Backend Direct Bridge Status Badge */}
          {showDisconnectSwitch && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground font-medium hidden md:inline">Bridge:</span>
              <Badge
                variant={isBridgeConnected ? 'outline' : 'destructive'}
                className={`text-[11px] gap-1 font-mono py-0.5 ${
                  isBridgeConnected
                    ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : 'bg-destructive text-destructive-foreground'
                }`}
              >
                {isBridgeConnected ? (
                  <Zap className="h-3 w-3 text-emerald-500" />
                ) : (
                  <ZapOff className="h-3 w-3 text-destructive-foreground" />
                )}
                {isBridgeConnected ? 'Live Bridge Connected' : 'Decoupled (Offline Mode)'}
              </Badge>
            </div>
          )}
        </div>

        {/* Expand Diagnostics Drawer Toggle */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 px-3 text-xs gap-1.5 font-medium border-border/80 hover:bg-accent"
            aria-label={isExpanded ? 'Hide system tools and diagnostics' : 'Show system tools and diagnostics'}
          >
            <Wrench className="h-3.5 w-3.5 text-primary" />
            <span className="hidden xs:inline">Diagnostics & Packs</span>
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] ml-0.5">
              {showDisconnectSwitch ? '3' : '2'}
            </Badge>
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5 ml-0.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 ml-0.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Expandable Technical Panel */}
      {isExpanded && (
        <Card className="border border-border/80 shadow-sm overflow-hidden bg-card">
          <CardContent className="p-4 space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center justify-between pb-2 border-b border-border/60 mb-4 flex-wrap gap-2">
                <TabsList className="bg-muted/60 p-0.5 h-8">
                  {showDisconnectSwitch && (
                    <TabsTrigger value="bridge" className="text-xs gap-1.5 h-7 px-3">
                      <Cpu className="h-3.5 w-3.5" />
                      Bridge Diagnostics & ZIP
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="downloads" className="text-xs gap-1.5 h-7 px-3">
                    <Download className="h-3.5 w-3.5" />
                    Onboarding Pack
                  </TabsTrigger>
                  <TabsTrigger value="pwa" className="text-xs gap-1.5 h-7 px-3">
                    <Smartphone className="h-3.5 w-3.5" />
                    App Install Banner
                  </TabsTrigger>
                </TabsList>
                <span className="text-[11px] text-muted-foreground">
                  Advanced developer & administrative tooling
                </span>
              </div>

              {showDisconnectSwitch && (
                <TabsContent value="bridge" className="mt-0 focus-visible:outline-none">
                  <FrontendBackendDisconnectSwitch />
                </TabsContent>
              )}

              <TabsContent value="downloads" className="mt-0 focus-visible:outline-none">
                <StaffOnboardingDownloads defaultCollapsed={false} />
              </TabsContent>

              <TabsContent value="pwa" className="mt-0 focus-visible:outline-none">
                <InstallAppBanner appName={appName} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
