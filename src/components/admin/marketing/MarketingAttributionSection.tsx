import React, { useState } from 'react';
import { 
  PieChart, 
  TrendingUp, 
  DollarSign, 
  Layers, 
  Share2, 
  Calendar, 
  ArrowUpRight, 
  Filter, 
  RefreshCw,
  Award,
  CheckCircle2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const MarketingAttributionSection: React.FC = () => {
  const [model, setModel] = useState<'last_touch' | 'first_touch' | 'linear'>('last_touch');
  const [timeframe, setTimeframe] = useState('30d');

  const attributionChannels = [
    {
      channel: 'Meta Ads (FB/IG)',
      firstTouchShare: '42%',
      lastTouchShare: '36%',
      linearShare: '39%',
      spend: 1450,
      conversions: 24,
      revenue: 20400,
      cpa: 60.42,
      roas: 14.1,
    },
    {
      channel: 'Google Search & PMax',
      firstTouchShare: '28%',
      lastTouchShare: '34%',
      linearShare: '31%',
      spend: 1100,
      conversions: 18,
      revenue: 15300,
      cpa: 61.11,
      roas: 13.9,
    },
    {
      channel: 'TikTok Video Ads',
      firstTouchShare: '18%',
      lastTouchShare: '10%',
      linearShare: '14%',
      spend: 600,
      conversions: 6,
      revenue: 5100,
      cpa: 100.0,
      roas: 8.5,
    },
    {
      channel: 'LinkedIn Ads (Corporate)',
      firstTouchShare: '6%',
      lastTouchShare: '12%',
      linearShare: '9%',
      spend: 300,
      conversions: 4,
      revenue: 3400,
      cpa: 75.0,
      roas: 11.3,
    },
    {
      channel: 'ManyChat (IG DM / Messenger)',
      firstTouchShare: '6%',
      lastTouchShare: '8%',
      linearShare: '7%',
      spend: 0,
      conversions: 2,
      revenue: 1700,
      cpa: 0,
      roas: 99.0,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            Multi-Touch Attribution & ROI
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
              Algorithmic Weighting
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Evaluate how initial ad impressions, social interactions, and closing touchpoints contribute to vehicle rentals and driver onboarding.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={model} onValueChange={(v: any) => setModel(v)}>
            <SelectTrigger className="h-9 text-xs w-[180px]">
              <SelectValue placeholder="Attribution Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_touch">Last-Touch Attribution</SelectItem>
              <SelectItem value="first_touch">First-Touch (Acquisition)</SelectItem>
              <SelectItem value="linear">Linear (Even Distribution)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="h-9 text-xs w-[130px]">
              <SelectValue placeholder="Timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Model Explainer Banner */}
      <div className="p-4 rounded-lg bg-card border border-border flex items-start gap-3">
        <Award className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <div className="font-semibold text-foreground">
            Current Model:{' '}
            {model === 'last_touch'
              ? 'Last-Touch Attribution (Credits final conversion interaction)'
              : model === 'first_touch'
              ? 'First-Touch Attribution (Credits initial discovery & click)'
              : 'Linear Attribution (Equal credit across all touches)'}
          </div>
          <p className="text-muted-foreground">
            Tracks user journeys across Meta Ads, Google Ads, TikTok, ManyChat DM automation, SENT.dm SMS reminders, and Twilio calls up to final rental agreement execution.
          </p>
        </div>
      </div>

      {/* Channel Attribution Table */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Attributed Spend, Conversions & ROAS</CardTitle>
          <CardDescription className="text-xs">
            Performance comparison across connected channels.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs font-semibold">Channel</TableHead>
                <TableHead className="text-xs font-semibold">Attribution Weight</TableHead>
                <TableHead className="text-xs font-semibold">Spend</TableHead>
                <TableHead className="text-xs font-semibold">Conversions</TableHead>
                <TableHead className="text-xs font-semibold">Attributed Revenue</TableHead>
                <TableHead className="text-xs font-semibold">Cost / Acquisition</TableHead>
                <TableHead className="text-xs font-semibold text-right">ROAS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attributionChannels.map((ch) => {
                const weight =
                  model === 'last_touch'
                    ? ch.lastTouchShare
                    : model === 'first_touch'
                    ? ch.firstTouchShare
                    : ch.linearShare;

                return (
                  <TableRow key={ch.channel} className="text-xs">
                    <TableCell className="font-medium text-foreground py-3">
                      {ch.channel}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {weight}
                      </Badge>
                    </TableCell>
                    <TableCell>${ch.spend.toLocaleString()}</TableCell>
                    <TableCell className="font-semibold text-foreground">{ch.conversions}</TableCell>
                    <TableCell className="font-semibold text-emerald-600">
                      ${ch.revenue.toLocaleString()}
                    </TableCell>
                    <TableCell>${ch.cpa.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      {ch.roas > 0 ? `${ch.roas}x` : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
