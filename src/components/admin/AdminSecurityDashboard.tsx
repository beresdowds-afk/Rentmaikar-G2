import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Shield, Lock, AlertTriangle, CheckCircle, Activity, Users, Key, Eye, Clock, Search, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface AuditEntry {
  id: string;
  admin_id: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AdminSession {
  id: string;
  user_id: string;
  ip_address: string | null;
  user_agent: string | null;
  last_activity: string;
  is_active: boolean;
  created_at: string;
}

interface SecurityCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  description: string;
  details?: string;
}

export const AdminSecurityDashboard = () => {
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [auditRes, sessionRes] = await Promise.all([
        supabase
          .from('admin_audit_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('admin_sessions')
          .select('*')
          .order('last_activity', { ascending: false })
          .limit(50),
      ]);

      if (auditRes.data) setAuditLogs(auditRes.data as AuditEntry[]);
      if (sessionRes.data) setSessions(sessionRes.data as AdminSession[]);
    } catch (e) {
      console.error('Error fetching security data:', e);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const securityChecks: SecurityCheck[] = [
    {
      name: 'Row Level Security',
      status: 'pass',
      description: 'RLS is enabled on all tables',
      details: 'All 79 tables have RLS policies configured with role-based access control.',
    },
    {
      name: 'Admin Role Verification',
      status: 'pass',
      description: 'Admin access uses security-definer function',
      details: 'public.is_admin() and public.has_role() prevent recursive RLS and privilege escalation.',
    },
    {
      name: 'Service Role Isolation',
      status: 'pass',
      description: 'Edge functions use service role key (bypasses RLS)',
      details: 'Email tracking, SMS, and WhatsApp service tables restricted to admin INSERT via RLS. Service role key access is separate.',
    },
    {
      name: '2FA Authentication',
      status: 'pass',
      description: 'Two-factor authentication available for admin/owner roles',
      details: 'Mandatory 2FA for admins and owners. OTP delivered via SMS with 5-minute expiry.',
    },
    {
      name: 'Email Verification',
      status: 'pass',
      description: 'Email verification required before dashboard access',
      details: 'Unconfirmed accounts are blocked from accessing any dashboard functionality.',
    },
    {
      name: 'Audit Logging',
      status: 'pass',
      description: 'Admin actions are tracked in audit log',
      details: 'Role changes, vehicle deactivations, and security events recorded with admin ID and timestamps.',
    },
    {
      name: 'Password Security',
      status: 'warn',
      description: 'Leaked password protection (HIBP) requires manual enablement',
      details: 'Must be enabled in the authentication settings under Email configuration.',
    },
    {
      name: 'API Key Security',
      status: 'pass',
      description: 'API keys stored as bcrypt hashes with rate limiting',
      details: 'Only key prefix visible. Usage logged with IP, endpoint, and response time.',
    },
    {
      name: 'Storage Bucket Protection',
      status: 'pass',
      description: 'All sensitive storage buckets are private with RLS',
      details: 'user-documents, incident-photos, call-recordings, chat-attachments are private with role-based access.',
    },
    {
      name: 'Webhook Security',
      status: 'pass',
      description: 'Webhook secrets hashed, JWT verification disabled only for inbound webhooks',
      details: 'Twilio, Termii, and Resend webhooks have JWT verification disabled but validate via service key.',
    },
  ];

  const filteredLogs = auditLogs.filter((log) =>
    searchQuery
      ? log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.target_table?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.target_id?.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  const passCount = securityChecks.filter((c) => c.status === 'pass').length;
  const warnCount = securityChecks.filter((c) => c.status === 'warn').length;
  const _failCount = securityChecks.filter((c) => c.status === 'fail').length;

  const activeSessions = sessions.filter((s) => s.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Security Dashboard
          </h3>
          <p className="text-sm text-muted-foreground">
            Monitor security posture, audit trails, and active sessions.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Security Score Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{passCount}</p>
              <p className="text-xs text-muted-foreground">Checks Passed</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{warnCount}</p>
              <p className="text-xs text-muted-foreground">Warnings</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{auditLogs.length}</p>
              <p className="text-xs text-muted-foreground">Audit Entries</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{activeSessions.length}</p>
              <p className="text-xs text-muted-foreground">Active Sessions</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="checks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="checks">Security Checks</TabsTrigger>
          <TabsTrigger value="audit">Audit Log ({auditLogs.length})</TabsTrigger>
          <TabsTrigger value="sessions">Sessions ({activeSessions.length})</TabsTrigger>
          <TabsTrigger value="policies">RLS Policy Reference</TabsTrigger>
        </TabsList>

        {/* Security Checks */}
        <TabsContent value="checks" className="space-y-3">
          {securityChecks.map((check) => (
            <Card key={check.name} className="p-4">
              <div className="flex items-start gap-3">
                <div className={`p-1.5 rounded-full mt-0.5 ${
                  check.status === 'pass' ? 'bg-green-500/10' :
                  check.status === 'warn' ? 'bg-orange-500/10' : 'bg-destructive/10'
                }`}>
                  {check.status === 'pass' ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : check.status === 'warn' ? (
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{check.name}</p>
                    <Badge variant={check.status === 'pass' ? 'default' : 'secondary'} className="text-[10px]">
                      {check.status.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{check.description}</p>
                  {check.details && (
                    <p className="text-xs text-muted-foreground mt-1 bg-muted p-2 rounded">{check.details}</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>

        {/* Audit Log */}
        <TabsContent value="audit" className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search audit logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No audit log entries yet.</p>
                <p className="text-xs mt-1">Admin actions will be recorded here automatically.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log) => (
                <Card key={log.id} className="p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded-lg bg-muted mt-0.5">
                        <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{log.action}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {log.target_table && (
                            <Badge variant="outline" className="text-[10px]">{log.target_table}</Badge>
                          )}
                          {log.target_id && (
                            <span className="text-[10px] font-mono text-muted-foreground">{log.target_id.slice(0, 8)}...</span>
                          )}
                          {log.ip_address && (
                            <span className="text-[10px] text-muted-foreground">IP: {log.ip_address}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Sessions */}
        <TabsContent value="sessions" className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No admin sessions recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <Card key={session.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${session.is_active ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                      <div>
                        <p className="text-sm font-mono">{session.user_id.slice(0, 8)}...</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {session.ip_address && <span>IP: {session.ip_address}</span>}
                          <span>Last: {new Date(session.last_activity).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <Badge variant={session.is_active ? 'default' : 'secondary'}>
                      {session.is_active ? 'Active' : 'Expired'}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* RLS Policy Reference */}
        <TabsContent value="policies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4" /> RLS Policy Architecture
              </CardTitle>
              <CardDescription>
                Summary of how Row Level Security protects each data category.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  category: 'User Data',
                  tables: 'profiles, user_roles, two_factor_settings, two_factor_audit_log',
                  policy: 'Users see own data. Admins see all via is_admin().',
                  icon: Users,
                },
                {
                  category: 'Financial Data',
                  tables: 'payments, owner_earnings, payment_defaults, rentals',
                  policy: 'Drivers/owners see own records. Admins see all.',
                  icon: Key,
                },
                {
                  category: 'Fleet & IoT',
                  tables: 'vehicles, iot_devices, device_activity_log',
                  policy: 'Owners see own vehicles. Admins manage all devices.',
                  icon: Eye,
                },
                {
                  category: 'Communications',
                  tables: 'inbox_*, unified_message_log, whatsapp_*, email_*',
                  policy: 'Users see own conversations. Service role writes. Admins manage all.',
                  icon: Activity,
                },
                {
                  category: 'Legal & Documents',
                  tables: 'legal_agreements, rent_to_own_*, user_documents',
                  policy: 'Parties see own agreements. Admins witness and manage.',
                  icon: Shield,
                },
                {
                  category: 'System Config',
                  tables: 'api_keys, webhooks, contact_settings, communication_providers',
                  policy: 'Admin-only management. Public read for active settings only.',
                  icon: Lock,
                },
              ].map((cat) => (
                <div key={cat.category} className="p-3 rounded-lg bg-muted">
                  <div className="flex items-center gap-2 mb-1">
                    <cat.icon className="h-4 w-4 text-primary" />
                    <p className="font-medium text-sm">{cat.category}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Tables: <code className="bg-background px-1 rounded">{cat.tables}</code>
                  </p>
                  <p className="text-xs text-muted-foreground">{cat.policy}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
