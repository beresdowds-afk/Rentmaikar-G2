import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Webhook, Trash2, RefreshCw, Eye, Send, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface WebhookConfig {
  id: string;
  name: string;
  description: string | null;
  url: string;
  secret: string | null;
  events: string[];
  is_active: boolean;
  retry_count: number;
  timeout_seconds: number;
  headers: Record<string, string>;
  created_at: string;
  last_triggered_at: string | null;
  success_count: number;
  failure_count: number;
}

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  attempt_number: number;
  duration_ms: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const AVAILABLE_EVENTS = [
  { id: 'application.created', label: 'Application Created', description: 'When a new driver/owner application is submitted' },
  { id: 'application.approved', label: 'Application Approved', description: 'When an application is approved' },
  { id: 'application.rejected', label: 'Application Rejected', description: 'When an application is rejected' },
  { id: 'vehicle.registered', label: 'Vehicle Registered', description: 'When a new vehicle is registered' },
  { id: 'vehicle.status_changed', label: 'Vehicle Status Changed', description: 'When vehicle status changes' },
  { id: 'payment.received', label: 'Payment Received', description: 'When a payment is received' },
  { id: 'payment.failed', label: 'Payment Failed', description: 'When a payment fails' },
  { id: 'payment.default', label: 'Payment Default', description: 'When a payment goes into default' },
  { id: 'incident.reported', label: 'Incident Reported', description: 'When an incident is reported' },
  { id: 'incident.resolved', label: 'Incident Resolved', description: 'When an incident is resolved' },
  { id: 'agreement.signed', label: 'Agreement Signed', description: 'When an agreement is fully signed' },
  { id: 'iot.device_offline', label: 'IoT Device Offline', description: 'When an IoT device goes offline' },
  { id: 'iot.accident_detected', label: 'Accident Detected', description: 'When IoT detects an accident' },
  { id: 'negotiation.created', label: 'Negotiation Created', description: 'When a new price negotiation request is submitted' },
  { id: 'negotiation.approved', label: 'Negotiation Approved', description: 'When a price negotiation is approved' },
  { id: 'negotiation.rejected', label: 'Negotiation Rejected', description: 'When a price negotiation is rejected' },
  { id: 'negotiation.counter_offer', label: 'Counter Offer Sent', description: 'When admin sends a counter offer' },
  { id: 'negotiation.locked', label: 'Price Locked', description: 'When a negotiated price is locked' },
  { id: 'negotiation.modification_requested', label: 'Modification Requested', description: 'When a locked price modification is requested' },
  { id: 'negotiation.modification_processed', label: 'Modification Processed', description: 'When a modification request is approved or rejected' },
];

export const WebhookManagement = () => {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDeliveriesDialogOpen, setViewDeliveriesDialogOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookConfig | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    url: '',
    secret: '',
    events: [] as string[],
    retry_count: 3,
    timeout_seconds: 30,
  });

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('webhooks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to fetch webhooks');
      console.error(error);
    } else {
      setWebhooks((data || []).map(w => ({
        ...w,
        events: w.events || [],
        headers: (w.headers as Record<string, string>) || {},
      })));
    }
    setLoading(false);
  };

  const fetchDeliveries = async (webhookId: string) => {
    const { data, error } = await supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      toast.error('Failed to fetch deliveries');
    } else {
      setDeliveries((data || []).map(d => ({
        ...d,
        payload: (d.payload as Record<string, unknown>) || {},
      })));
    }
  };

  const handleCreateWebhook = async () => {
    if (!formData.name || !formData.url || formData.events.length === 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Not authenticated');
      return;
    }

    const { error } = await supabase.from('webhooks').insert({
      name: formData.name,
      description: formData.description || null,
      url: formData.url,
      secret: formData.secret || null,
      events: formData.events,
      retry_count: formData.retry_count,
      timeout_seconds: formData.timeout_seconds,
      created_by: user.id,
    });

    if (error) {
      toast.error('Failed to create webhook');
      console.error(error);
    } else {
      toast.success('Webhook created successfully');
      setCreateDialogOpen(false);
      resetForm();
      fetchWebhooks();
    }
  };

  const handleToggleActive = async (webhook: WebhookConfig) => {
    const { error } = await supabase
      .from('webhooks')
      .update({ is_active: !webhook.is_active })
      .eq('id', webhook.id);

    if (error) {
      toast.error('Failed to update webhook');
    } else {
      toast.success(`Webhook ${webhook.is_active ? 'disabled' : 'enabled'}`);
      fetchWebhooks();
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    const { error } = await supabase
      .from('webhooks')
      .delete()
      .eq('id', webhookId);

    if (error) {
      toast.error('Failed to delete webhook');
    } else {
      toast.success('Webhook deleted');
      fetchWebhooks();
    }
  };

  const handleTestWebhook = async (webhook: WebhookConfig) => {
    toast.info('Sending test webhook...');
    
    try {
      const testPayload = {
        event: 'test.ping',
        timestamp: new Date().toISOString(),
        data: {
          message: 'This is a test webhook from Rentmaikar',
          webhook_id: webhook.id,
          webhook_name: webhook.name,
        },
      };

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhook.secret ? { 'X-Webhook-Secret': webhook.secret } : {}),
        },
        body: JSON.stringify(testPayload),
      });

      if (response.ok) {
        toast.success('Test webhook sent successfully');
      } else {
        toast.error(`Test failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      toast.error('Failed to send test webhook');
      console.error(error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      url: '',
      secret: '',
      events: [],
      retry_count: 3,
      timeout_seconds: 30,
    });
  };

  const toggleEvent = (eventId: string) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter(e => e !== eventId)
        : [...prev.events, eventId],
    }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Success</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case 'retrying':
        return <Badge className="bg-yellow-500"><RefreshCw className="h-3 w-3 mr-1" />Retrying</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Webhook Management</h2>
          <p className="text-muted-foreground">Configure webhooks to receive real-time event notifications</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Webhook
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Webhook</DialogTitle>
              <DialogDescription>Configure a webhook endpoint to receive event notifications</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="My Webhook"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">Endpoint URL *</Label>
                  <Input
                    id="url"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    placeholder="https://example.com/webhook"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="secret">Webhook Secret</Label>
                <Input
                  id="secret"
                  type="password"
                  value={formData.secret}
                  onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                  placeholder="Optional secret for signature verification"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="retry_count">Retry Count</Label>
                  <Input
                    id="retry_count"
                    type="number"
                    min="0"
                    max="10"
                    value={formData.retry_count}
                    onChange={(e) => setFormData({ ...formData, retry_count: parseInt(e.target.value) || 3 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timeout">Timeout (seconds)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    min="5"
                    max="120"
                    value={formData.timeout_seconds}
                    onChange={(e) => setFormData({ ...formData, timeout_seconds: parseInt(e.target.value) || 30 })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Events to Subscribe *</Label>
                <ScrollArea className="h-48 border rounded-md p-3">
                  <div className="space-y-2">
                    {AVAILABLE_EVENTS.map((event) => (
                      <div key={event.id} className="flex items-start space-x-3 p-2 hover:bg-muted rounded">
                        <Checkbox
                          id={event.id}
                          checked={formData.events.includes(event.id)}
                          onCheckedChange={() => toggleEvent(event.id)}
                        />
                        <div className="flex-1">
                          <label htmlFor={event.id} className="text-sm font-medium cursor-pointer">
                            {event.label}
                          </label>
                          <p className="text-xs text-muted-foreground">{event.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateWebhook}>Create Webhook</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {webhooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Webhook className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No Webhooks Configured</h3>
            <p className="text-muted-foreground text-center max-w-md mt-2">
              Create webhooks to receive real-time notifications when events occur in your platform.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Success/Fail</TableHead>
                <TableHead>Last Triggered</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell className="font-medium">{webhook.name}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {webhook.url}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{webhook.events.length} events</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={webhook.is_active}
                        onCheckedChange={() => handleToggleActive(webhook)}
                      />
                      <span className="text-sm">{webhook.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-green-600">{webhook.success_count}</span>
                      <span>/</span>
                      <span className="text-red-600">{webhook.failure_count}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {webhook.last_triggered_at 
                      ? format(new Date(webhook.last_triggered_at), 'MMM d, HH:mm')
                      : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleTestWebhook(webhook)}
                        title="Test Webhook"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedWebhook(webhook);
                          fetchDeliveries(webhook.id);
                          setViewDeliveriesDialogOpen(true);
                        }}
                        title="View Deliveries"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteWebhook(webhook.id)}
                        title="Delete Webhook"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Deliveries Dialog */}
      <Dialog open={viewDeliveriesDialogOpen} onOpenChange={setViewDeliveriesDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Delivery History - {selectedWebhook?.name}</DialogTitle>
            <DialogDescription>Recent webhook delivery attempts and their status</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[500px]">
            {deliveries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No deliveries yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Response</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell className="font-mono text-sm">{delivery.event_type}</TableCell>
                      <TableCell>{getStatusBadge(delivery.status)}</TableCell>
                      <TableCell>
                        {delivery.response_status ? (
                          <Badge variant={delivery.response_status < 400 ? "default" : "destructive"}>
                            {delivery.response_status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {delivery.duration_ms ? `${delivery.duration_ms}ms` : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(delivery.created_at), 'MMM d, HH:mm:ss')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
