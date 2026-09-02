import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Building2, Globe, AlertTriangle, TrendingUp, Shield,
  Receipt, MapPin, DollarSign, RefreshCw, Plus, ArrowRight
} from "lucide-react";
import {
  type TaxRule,
  type NexusStatus,
  getAllNexusStatuses,
  getNigeriaIncomeTaxBracket,
  formatTaxAmount,
} from "@/lib/tax-engine";

export function TaxManagement() {
  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);
  const [nexusStatuses, setNexusStatuses] = useState<NexusStatus[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [rulesRes, entitiesRes, nexusData] = await Promise.all([
      supabase.from('tax_rules').select('*').eq('is_active', true).order('jurisdiction_code'),
      supabase.from('tax_entities').select('*').eq('is_active', true),
      getAllNexusStatuses(),
    ]);

    if (rulesRes.data) setTaxRules(rulesRes.data as unknown as TaxRule[]);
    if (entitiesRes.data) setEntities(entitiesRes.data);
    setNexusStatuses(nexusData);
    setLoading(false);
  };

  const nigeriaRules = taxRules.filter(r => r.jurisdiction_code.startsWith('NG'));
  const usRules = taxRules.filter(r => r.jurisdiction_code.startsWith('US'));

  // Mock annual revenue for bracket display
  const incomeBracket = getNigeriaIncomeTaxBracket(18_000_000);

  return (
    <div className="space-y-6">
      {/* Global SaaS Structure Overview */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Global Tax Structure
          </CardTitle>
          <CardDescription>
            Dual-entity model: Nigerian operating company + US LLC payment entity.
            Income tax follows company residence, sales/VAT tax follows customer location.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center gap-4 text-sm">
            {entities.map((entity, i) => (
              <div key={entity.id} className="flex items-center gap-3">
                <Card className="p-3 flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{entity.entity_name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>Type: <Badge variant="outline" className="text-[10px]">{entity.role}</Badge></div>
                    <div>Country: {entity.country_code === 'NG' ? '🇳🇬 Nigeria' : '🇺🇸 United States'}</div>
                  </div>
                </Card>
                {i === 0 && <ArrowRight className="h-5 w-5 text-muted-foreground hidden md:block" />}
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-md bg-muted text-xs text-muted-foreground">
            <strong>Flow:</strong> US Customers → US LLC (payment collection) → Nigeria Company (operations & development)
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="rules" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rules">Tax Rules</TabsTrigger>
          <TabsTrigger value="nexus">US Nexus Tracking</TabsTrigger>
          <TabsTrigger value="income">Company Income Tax</TabsTrigger>
          <TabsTrigger value="reporting">Reporting</TabsTrigger>
        </TabsList>

        {/* Tax Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nigeria Rules */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  🇳🇬 Nigeria Tax Rules
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nigeriaRules.map(rule => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium text-sm">
                          {rule.tax_type === 'vat' ? 'VAT' : 'Income Tax'}
                          {rule.notes && (
                            <div className="text-xs text-muted-foreground mt-0.5">{rule.notes}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {rule.rate_percent}%
                        </TableCell>
                        <TableCell>
                          {rule.is_exempt ? (
                            <Badge variant="secondary" className="text-xs">Exempt</Badge>
                          ) : (
                            <Badge variant="default" className="text-xs">Active</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* US State Rules */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  🇺🇸 US State Sales Tax Rules
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>State</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Nexus Threshold</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usRules.map(rule => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium text-sm">
                          {rule.jurisdiction_name}
                        </TableCell>
                        <TableCell>{rule.rate_percent}%</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {rule.threshold_amount ? `$${(rule.threshold_amount / 1000).toFixed(0)}k` : '—'}
                          {rule.threshold_transactions ? ` / ${rule.threshold_transactions} txns` : ''}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Nexus Tracking Tab */}
        <TabsContent value="nexus" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Economic Nexus Monitoring — {new Date().getFullYear()}
              </CardTitle>
              <CardDescription>
                Track cumulative revenue and transactions per US state.
                Sales tax collection is required once thresholds are exceeded.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {nexusStatuses.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No nexus tracking data yet. Revenue will be tracked as transactions are processed.
                </div>
              ) : (
                nexusStatuses.map(nexus => (
                  <div key={nexus.jurisdictionCode} className="space-y-2 p-3 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm flex items-center gap-2">
                        {nexus.jurisdictionName}
                        <Badge variant="outline" className="text-xs">{nexus.jurisdictionCode}</Badge>
                      </div>
                      {nexus.nexusTriggered ? (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Nexus Triggered
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Below Threshold</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Revenue</span>
                          <span>{formatTaxAmount(nexus.cumulativeRevenue, 'USD')} / {formatTaxAmount(nexus.thresholdRevenue || 0, 'USD')}</span>
                        </div>
                        <Progress value={nexus.revenuePercent} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Transactions</span>
                          <span>{nexus.cumulativeTransactions} / {nexus.thresholdTransactions}</span>
                        </div>
                        <Progress value={nexus.transactionPercent} className="h-2" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Company Income Tax Tab */}
        <TabsContent value="income" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">🇳🇬 Nigeria Company Income Tax</CardTitle>
                <CardDescription>FIRS tiered CIT structure</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {[
                    { bracket: 'Small', range: '< ₦25M', rate: '0%', active: incomeBracket.bracket === 'Small' },
                    { bracket: 'Medium', range: '₦25M – ₦100M', rate: '20%', active: incomeBracket.bracket === 'Medium' },
                    { bracket: 'Large', range: '> ₦100M', rate: '30%', active: incomeBracket.bracket === 'Large' },
                  ].map(b => (
                    <div key={b.bracket} className={`flex justify-between items-center p-2 rounded-md ${b.active ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'}`}>
                      <div>
                        <span className="font-medium text-sm">{b.bracket}</span>
                        <span className="text-xs text-muted-foreground ml-2">{b.range}</span>
                      </div>
                      <Badge variant={b.active ? 'default' : 'outline'}>{b.rate}</Badge>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground p-2 bg-muted rounded-md">
                  Current bracket: <strong>{incomeBracket.description}</strong>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">🌍 Key Tax Principles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 text-primary mt-0.5" />
                  <div>
                    <div className="font-medium">Income Tax</div>
                    <div className="text-xs text-muted-foreground">Follows company residence (Nigeria)</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Receipt className="h-4 w-4 text-primary mt-0.5" />
                  <div>
                    <div className="font-medium">VAT / Sales Tax</div>
                    <div className="text-xs text-muted-foreground">Follows customer location (US states / Nigeria)</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Globe className="h-4 w-4 text-primary mt-0.5" />
                  <div>
                    <div className="font-medium">Export Exemption</div>
                    <div className="text-xs text-muted-foreground">Services to US customers are VAT-exempt in Nigeria</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 text-primary mt-0.5" />
                  <div>
                    <div className="font-medium">Optimized Structure</div>
                    <div className="text-xs text-muted-foreground">Dual-entity model targets effective 9–15% total tax rate</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Reporting Tab */}
        <TabsContent value="reporting" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Quarterly Tax Summary
              </CardTitle>
              <CardDescription>
                Tax collected and owed per jurisdiction per quarter
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center text-sm text-muted-foreground py-8">
                Reporting data will populate as transactions are processed through the tax engine.
                <div className="mt-2 text-xs">
                  Tax line items are recorded per payment and aggregated quarterly for filing.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
