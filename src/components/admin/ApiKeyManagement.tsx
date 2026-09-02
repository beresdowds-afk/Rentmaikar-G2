import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Key, Plus, Copy, Trash2, RefreshCw, AlertTriangle, Check, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ApiKey {
  id: string;
  name: string;
  description: string | null;
  key_prefix: string;
  permissions: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  usage_count: number;
  rate_limit_per_hour: number;
  allowed_origins: string[];
}

const AVAILABLE_PERMISSIONS = [
  { id: 'read', label: 'Read', description: 'Read access to API endpoints' },
  { id: 'write', label: 'Write', description: 'Create and update resources' },
  { id: 'delete', label: 'Delete', description: 'Delete resources' },
  { id: 'vehicles', label: 'Vehicles', description: 'Access vehicle data' },
  { id: 'users', label: 'Users', description: 'Access user data' },
  { id: 'payments', label: 'Payments', description: 'Access payment data' },
];

export const ApiKeyManagement = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKeyDialogOpen, setNewKeyDialogOpen] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [keyName, setKeyName] = useState('');
  const [keyDescription, setKeyDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(['read']);
  const [expiresAt, setExpiresAt] = useState('');
  const [rateLimitPerHour, setRateLimitPerHour] = useState(1000);
  const [allowedOrigins, setAllowedOrigins] = useState('');

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Parse permissions if they're strings
      const parsedKeys = (data || []).map(key => ({
        ...key,
        permissions: Array.isArray(key.permissions) ? key.permissions : JSON.parse(key.permissions as string || '["read"]'),
        allowed_origins: Array.isArray(key.allowed_origins) ? key.allowed_origins : [],
      }));
      
      setApiKeys(parsedKeys);
    } catch (error) {
      console.error('Error fetching API keys:', error);
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async () => {
    if (!keyName.trim()) {
      toast.error('API key name is required');
      return;
    }

    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not authenticated');
        return;
      }

      const response = await supabase.functions.invoke('generate-api-key', {
        body: {
          name: keyName.trim(),
          description: keyDescription.trim() || null,
          permissions: selectedPermissions,
          expiresAt: expiresAt || null,
          rateLimitPerHour,
          allowedOrigins: allowedOrigins.split('\n').filter(o => o.trim()),
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.apiKey) {
        setGeneratedKey(response.data.apiKey);
        setCreateDialogOpen(false);
        setNewKeyDialogOpen(true);
        fetchApiKeys();
        
        // Reset form
        setKeyName('');
        setKeyDescription('');
        setSelectedPermissions(['read']);
        setExpiresAt('');
        setRateLimitPerHour(1000);
        setAllowedOrigins('');
      }
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error('Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyKey = async () => {
    if (generatedKey) {
      await navigator.clipboard.writeText(generatedKey);
      setKeyCopied(true);
      toast.success('API key copied to clipboard');
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const handleToggleActive = async (keyId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: !currentStatus })
        .eq('id', keyId);

      if (error) throw error;
      
      toast.success(`API key ${!currentStatus ? 'activated' : 'deactivated'}`);
      fetchApiKeys();
    } catch (error) {
      console.error('Error toggling API key:', error);
      toast.error('Failed to update API key');
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;
      
      toast.success('API key deleted');
      fetchApiKeys();
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error('Failed to delete API key');
    }
  };

  const togglePermission = (permissionId: string) => {
    setSelectedPermissions(prev =>
      prev.includes(permissionId)
        ? prev.filter(p => p !== permissionId)
        : [...prev, permissionId]
    );
  };

  const getStatusBadge = (key: ApiKey) => {
    if (!key.is_active) {
      return <Badge variant="secondary">Inactive</Badge>;
    }
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    return <Badge className="bg-success text-success-foreground">Active</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Key Management
            </CardTitle>
            <CardDescription>
              Generate and manage API keys for third-party integrations
            </CardDescription>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Generate New Key
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Generate New API Key</DialogTitle>
                <DialogDescription>
                  Create a new API key for third-party access. The key will only be shown once.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="keyName">Key Name *</Label>
                  <Input
                    id="keyName"
                    placeholder="e.g., Production API"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="keyDescription">Description</Label>
                  <Textarea
                    id="keyDescription"
                    placeholder="What is this key used for?"
                    value={keyDescription}
                    onChange={(e) => setKeyDescription(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Permissions</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {AVAILABLE_PERMISSIONS.map((permission) => (
                      <div
                        key={permission.id}
                        className="flex items-center space-x-2 p-2 rounded border"
                      >
                        <Checkbox
                          id={permission.id}
                          checked={selectedPermissions.includes(permission.id)}
                          onCheckedChange={() => togglePermission(permission.id)}
                        />
                        <Label htmlFor={permission.id} className="text-sm cursor-pointer">
                          {permission.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="expiresAt">Expires At (Optional)</Label>
                    <Input
                      id="expiresAt"
                      type="datetime-local"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rateLimit">Rate Limit (per hour)</Label>
                    <Input
                      id="rateLimit"
                      type="number"
                      min={1}
                      max={100000}
                      value={rateLimitPerHour}
                      onChange={(e) => setRateLimitPerHour(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="allowedOrigins">Allowed Origins (one per line)</Label>
                  <Textarea
                    id="allowedOrigins"
                    placeholder="https://example.com&#10;https://api.example.com"
                    value={allowedOrigins}
                    onChange={(e) => setAllowedOrigins(e.target.value)}
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to allow all origins
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateKey} disabled={creating || !keyName.trim()}>
                  {creating ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4 mr-2" />
                  )}
                  Generate Key
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No API keys created yet</p>
              <p className="text-sm">Generate your first API key to enable third-party integrations</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key Prefix</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{key.name}</p>
                        {key.description && (
                          <p className="text-xs text-muted-foreground">{key.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {key.key_prefix}...
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {key.permissions.map((perm) => (
                          <Badge key={perm} variant="outline" className="text-xs">
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(key)}</TableCell>
                    <TableCell>
                      <span className="text-sm">{key.usage_count.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground ml-1">
                        / {key.rate_limit_per_hour}/hr
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(key.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-sm">
                      {key.last_used_at
                        ? format(new Date(key.last_used_at), 'MMM d, yyyy HH:mm')
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Switch
                          checked={key.is_active}
                          onCheckedChange={() => handleToggleActive(key.id, key.is_active)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteKey(key.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Key Generated Dialog */}
      <Dialog open={newKeyDialogOpen} onOpenChange={setNewKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              API Key Generated
            </DialogTitle>
            <DialogDescription>
              Copy your API key now. You won't be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-muted p-4 rounded-lg relative">
              <code className="text-sm break-all">{generatedKey}</code>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2"
                onClick={handleCopyKey}
              >
                {keyCopied ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              Store this key securely. It provides access to your API based on the permissions you selected.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => {
              setNewKeyDialogOpen(false);
              setGeneratedKey(null);
            }}>
              I've Saved My Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
