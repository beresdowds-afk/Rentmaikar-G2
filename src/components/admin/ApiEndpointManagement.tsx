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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, Edit, Globe, Lock, Code, Copy } from "lucide-react";

interface ApiEndpoint {
  id: string;
  name: string;
  description: string | null;
  path: string;
  method: string;
  request_schema: Record<string, unknown> | null;
  response_schema: Record<string, unknown> | null;
  rate_limit_per_minute: number | null;
  requires_auth: boolean;
  required_permissions: string[];
  is_active: boolean;
  version: string;
  created_at: string;
  updated_at: string;
}

const AVAILABLE_PERMISSIONS = [
  { id: 'read', label: 'Read' },
  { id: 'write', label: 'Write' },
  { id: 'delete', label: 'Delete' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'users', label: 'Users' },
  { id: 'payments', label: 'Payments' },
  { id: 'agreements', label: 'Agreements' },
  { id: 'iot', label: 'IoT Devices' },
];

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export const ApiEndpointManagement = () => {
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<ApiEndpoint | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    path: '',
    method: 'GET',
    rate_limit_per_minute: 60,
    requires_auth: true,
    required_permissions: [] as string[],
    version: 'v1',
    request_schema: '',
    response_schema: '',
  });

  useEffect(() => {
    fetchEndpoints();
  }, []);

  const fetchEndpoints = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('api_validation_endpoints')
      .select('*')
      .order('path', { ascending: true });

    if (error) {
      toast.error('Failed to fetch API endpoints');
      console.error(error);
    } else {
      setEndpoints((data || []).map(e => ({
        ...e,
        request_schema: e.request_schema as Record<string, unknown> | null,
        response_schema: e.response_schema as Record<string, unknown> | null,
        required_permissions: e.required_permissions || [],
      })));
    }
    setLoading(false);
  };

  const handleCreateEndpoint = async () => {
    if (!formData.name || !formData.path) {
      toast.error('Please fill in all required fields');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Not authenticated');
      return;
    }

    let requestSchema = null;
    let responseSchema = null;

    try {
      if (formData.request_schema) {
        requestSchema = JSON.parse(formData.request_schema);
      }
      if (formData.response_schema) {
        responseSchema = JSON.parse(formData.response_schema);
      }
    } catch {
      toast.error('Invalid JSON schema');
      return;
    }

    const { error } = await supabase.from('api_validation_endpoints').insert({
      name: formData.name,
      description: formData.description || null,
      path: formData.path,
      method: formData.method,
      rate_limit_per_minute: formData.rate_limit_per_minute,
      requires_auth: formData.requires_auth,
      required_permissions: formData.required_permissions,
      version: formData.version,
      request_schema: requestSchema,
      response_schema: responseSchema,
      created_by: user.id,
    });

    if (error) {
      toast.error('Failed to create endpoint');
      console.error(error);
    } else {
      toast.success('API endpoint created successfully');
      setCreateDialogOpen(false);
      resetForm();
      fetchEndpoints();
    }
  };

  const handleUpdateEndpoint = async () => {
    if (!editingEndpoint) return;

    let requestSchema = null;
    let responseSchema = null;

    try {
      if (formData.request_schema) {
        requestSchema = JSON.parse(formData.request_schema);
      }
      if (formData.response_schema) {
        responseSchema = JSON.parse(formData.response_schema);
      }
    } catch {
      toast.error('Invalid JSON schema');
      return;
    }

    const { error } = await supabase
      .from('api_validation_endpoints')
      .update({
        name: formData.name,
        description: formData.description || null,
        path: formData.path,
        method: formData.method,
        rate_limit_per_minute: formData.rate_limit_per_minute,
        requires_auth: formData.requires_auth,
        required_permissions: formData.required_permissions,
        version: formData.version,
        request_schema: requestSchema,
        response_schema: responseSchema,
      })
      .eq('id', editingEndpoint.id);

    if (error) {
      toast.error('Failed to update endpoint');
    } else {
      toast.success('Endpoint updated');
      setEditingEndpoint(null);
      resetForm();
      fetchEndpoints();
    }
  };

  const handleToggleActive = async (endpoint: ApiEndpoint) => {
    const { error } = await supabase
      .from('api_validation_endpoints')
      .update({ is_active: !endpoint.is_active })
      .eq('id', endpoint.id);

    if (error) {
      toast.error('Failed to update endpoint');
    } else {
      toast.success(`Endpoint ${endpoint.is_active ? 'disabled' : 'enabled'}`);
      fetchEndpoints();
    }
  };

  const handleDeleteEndpoint = async (endpointId: string) => {
    const { error } = await supabase
      .from('api_validation_endpoints')
      .delete()
      .eq('id', endpointId);

    if (error) {
      toast.error('Failed to delete endpoint');
    } else {
      toast.success('Endpoint deleted');
      fetchEndpoints();
    }
  };

  const openEditDialog = (endpoint: ApiEndpoint) => {
    setEditingEndpoint(endpoint);
    setFormData({
      name: endpoint.name,
      description: endpoint.description || '',
      path: endpoint.path,
      method: endpoint.method,
      rate_limit_per_minute: endpoint.rate_limit_per_minute || 60,
      requires_auth: endpoint.requires_auth,
      required_permissions: endpoint.required_permissions,
      version: endpoint.version,
      request_schema: endpoint.request_schema ? JSON.stringify(endpoint.request_schema, null, 2) : '',
      response_schema: endpoint.response_schema ? JSON.stringify(endpoint.response_schema, null, 2) : '',
    });
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      path: '',
      method: 'GET',
      rate_limit_per_minute: 60,
      requires_auth: true,
      required_permissions: [],
      version: 'v1',
      request_schema: '',
      response_schema: '',
    });
  };

  const togglePermission = (permissionId: string) => {
    setFormData(prev => ({
      ...prev,
      required_permissions: prev.required_permissions.includes(permissionId)
        ? prev.required_permissions.filter(p => p !== permissionId)
        : [...prev.required_permissions, permissionId],
    }));
  };

  const copyEndpointPath = (endpoint: ApiEndpoint) => {
    const fullPath = `/api/${endpoint.version}${endpoint.path}`;
    navigator.clipboard.writeText(fullPath);
    toast.success('Path copied to clipboard');
  };

  const getMethodBadge = (method: string) => {
    const colors: Record<string, string> = {
      GET: 'bg-green-500',
      POST: 'bg-blue-500',
      PUT: 'bg-yellow-500',
      PATCH: 'bg-orange-500',
      DELETE: 'bg-red-500',
    };
    return <Badge className={colors[method] || 'bg-gray-500'}>{method}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const EndpointForm = () => (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Get Vehicle Details"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="version">API Version</Label>
          <Select
            value={formData.version}
            onValueChange={(value) => setFormData({ ...formData, version: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="v1">v1</SelectItem>
              <SelectItem value="v2">v2</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="method">HTTP Method *</Label>
          <Select
            value={formData.method}
            onValueChange={(value) => setFormData({ ...formData, method: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((method) => (
                <SelectItem key={method} value={method}>{method}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="path">Path *</Label>
          <Input
            id="path"
            value={formData.path}
            onChange={(e) => setFormData({ ...formData, path: e.target.value })}
            placeholder="/vehicles/:id"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe what this endpoint does..."
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="rate_limit">Rate Limit (requests/minute)</Label>
          <Input
            id="rate_limit"
            type="number"
            min="1"
            max="1000"
            value={formData.rate_limit_per_minute}
            onChange={(e) => setFormData({ ...formData, rate_limit_per_minute: parseInt(e.target.value) || 60 })}
          />
        </div>
        <div className="space-y-2 flex items-end pb-2">
          <div className="flex items-center space-x-2">
            <Switch
              id="requires_auth"
              checked={formData.requires_auth}
              onCheckedChange={(checked) => setFormData({ ...formData, requires_auth: checked })}
            />
            <Label htmlFor="requires_auth">Requires Authentication</Label>
          </div>
        </div>
      </div>
      {formData.requires_auth && (
        <div className="space-y-2">
          <Label>Required Permissions</Label>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_PERMISSIONS.map((perm) => (
              <div key={perm.id} className="flex items-center space-x-2">
                <Checkbox
                  id={perm.id}
                  checked={formData.required_permissions.includes(perm.id)}
                  onCheckedChange={() => togglePermission(perm.id)}
                />
                <Label htmlFor={perm.id} className="text-sm">{perm.label}</Label>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="request_schema">Request Schema (JSON)</Label>
        <Textarea
          id="request_schema"
          value={formData.request_schema}
          onChange={(e) => setFormData({ ...formData, request_schema: e.target.value })}
          placeholder='{"type": "object", "properties": {...}}'
          className="font-mono text-sm"
          rows={4}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="response_schema">Response Schema (JSON)</Label>
        <Textarea
          id="response_schema"
          value={formData.response_schema}
          onChange={(e) => setFormData({ ...formData, response_schema: e.target.value })}
          placeholder='{"type": "object", "properties": {...}}'
          className="font-mono text-sm"
          rows={4}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">API Validation Endpoints</h2>
          <p className="text-muted-foreground">Define and manage API endpoint specifications</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Endpoint
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create API Endpoint</DialogTitle>
              <DialogDescription>Define a new API endpoint with validation rules</DialogDescription>
            </DialogHeader>
            <EndpointForm />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateEndpoint}>Create Endpoint</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {endpoints.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Code className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No API Endpoints Defined</h3>
            <p className="text-muted-foreground text-center max-w-md mt-2">
              Create API endpoint definitions to document and validate your API.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Method</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead>Rate Limit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.map((endpoint) => (
                <TableRow key={endpoint.id}>
                  <TableCell>{getMethodBadge(endpoint.method)}</TableCell>
                  <TableCell className="font-mono text-sm">
                    /{endpoint.version}{endpoint.path}
                  </TableCell>
                  <TableCell className="font-medium">{endpoint.name}</TableCell>
                  <TableCell>
                    {endpoint.requires_auth ? (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Globe className="h-4 w-4 text-green-500" />
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {endpoint.rate_limit_per_minute}/min
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={endpoint.is_active}
                        onCheckedChange={() => handleToggleActive(endpoint)}
                      />
                      <span className="text-sm">{endpoint.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyEndpointPath(endpoint)}
                        title="Copy Path"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(endpoint)}
                        title="Edit Endpoint"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteEndpoint(endpoint.id)}
                        title="Delete Endpoint"
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

      {/* Edit Dialog */}
      <Dialog open={!!editingEndpoint} onOpenChange={(open) => !open && setEditingEndpoint(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit API Endpoint</DialogTitle>
            <DialogDescription>Update endpoint configuration and validation rules</DialogDescription>
          </DialogHeader>
          <EndpointForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEndpoint(null)}>Cancel</Button>
            <Button onClick={handleUpdateEndpoint}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
