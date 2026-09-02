import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DataPagination } from '@/components/ui/data-pagination';
import { supabase } from '@/integrations/supabase/client';
import { Eye, Search, Users, Car, User, Loader2, Phone, Mail, FileText, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { OwnerDashboardPreview } from './previews/OwnerDashboardPreview';
import { DriverDashboardPreview } from './previews/DriverDashboardPreview';
import { CreateAgreementDialog } from './CreateAgreementDialog';
import { AdminDocumentExportButton } from './AdminDocumentExportButton';

interface UserWithRole {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  phone_verified: boolean;
  created_at: string;
  role: 'owner' | 'driver';
}

export function UserAccountsView() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [createAgreementOpen, setCreateAgreementOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      // Fetch all profiles with their roles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*');

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Combine profiles with roles
      const usersWithRoles: UserWithRole[] = (profiles || [])
        .map(profile => {
          const userRole = roles?.find(r => r.user_id === profile.user_id);
          if (!userRole || userRole.role === 'admin') return null;
          return {
            id: profile.id,
            user_id: profile.user_id,
            full_name: profile.full_name,
            email: profile.email,
            phone: profile.phone,
            phone_verified: profile.phone_verified || false,
            created_at: profile.created_at || '',
            role: userRole.role as 'owner' | 'driver'
          };
        })
        .filter((u): u is UserWithRole => u !== null);

      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const query = searchQuery.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query) ||
      user.phone?.includes(query)
    );
  });

  const owners = filteredUsers.filter(u => u.role === 'owner');
  const drivers = filteredUsers.filter(u => u.role === 'driver');

  const handleViewDashboard = (user: UserWithRole) => {
    setSelectedUser(user);
    setViewDialogOpen(true);
  };

  const UserCard = ({ user }: { user: UserWithRole }) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              user.role === 'owner' ? 'bg-primary/10' : 'bg-accent/10'
            }`}>
              {user.role === 'owner' ? (
                <Car className={`h-6 w-6 text-primary`} />
              ) : (
                <User className={`h-6 w-6 text-accent`} />
              )}
            </div>
            <div>
              <h3 className="font-semibold">{user.full_name || 'No name'}</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3 w-3" />
                {user.email || 'No email'}
              </div>
              {user.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {user.phone}
                  {user.phone_verified && (
                    <Badge variant="outline" className="text-xs">Verified</Badge>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={user.role === 'owner' ? 'default' : 'secondary'}>
              {user.role === 'owner' ? 'Owner' : 'Driver'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleViewDashboard(user)}
              className="gap-1"
            >
              <Eye className="h-4 w-4" />
              View Dashboard
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading user accounts...</p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Accounts
              </CardTitle>
              <CardDescription>
                View individual owner and driver dashboards (read-only)
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => setCreateAgreementOpen(true)} className="gap-2">
                <FileText className="h-4 w-4" />
                <Plus className="h-3 w-3" />
                New Agreement
              </Button>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">All ({filteredUsers.length})</TabsTrigger>
              <TabsTrigger value="owners">Owners ({owners.length})</TabsTrigger>
              <TabsTrigger value="drivers">Drivers ({drivers.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-3">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No users found</p>
                </div>
              ) : (
                (() => {
                  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
                  const paginatedUsers = filteredUsers.slice(
                    (currentPage - 1) * itemsPerPage,
                    currentPage * itemsPerPage
                  );
                  return (
                    <>
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-3 pr-4">
                          {paginatedUsers.map(user => (
                            <UserCard key={user.id} user={user} />
                          ))}
                        </div>
                      </ScrollArea>
                      <DataPagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        className="mt-4"
                      />
                    </>
                  );
                })()
              )}
            </TabsContent>

            <TabsContent value="owners" className="space-y-3">
              {owners.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Car className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No owners found</p>
                </div>
              ) : (
                (() => {
                  const totalPages = Math.ceil(owners.length / itemsPerPage);
                  const paginatedOwners = owners.slice(
                    (currentPage - 1) * itemsPerPage,
                    currentPage * itemsPerPage
                  );
                  return (
                    <>
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-3 pr-4">
                          {paginatedOwners.map(user => (
                            <UserCard key={user.id} user={user} />
                          ))}
                        </div>
                      </ScrollArea>
                      <DataPagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        className="mt-4"
                      />
                    </>
                  );
                })()
              )}
            </TabsContent>

            <TabsContent value="drivers" className="space-y-3">
              {drivers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No drivers found</p>
                </div>
              ) : (
                (() => {
                  const totalPages = Math.ceil(drivers.length / itemsPerPage);
                  const paginatedDrivers = drivers.slice(
                    (currentPage - 1) * itemsPerPage,
                    currentPage * itemsPerPage
                  );
                  return (
                    <>
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-3 pr-4">
                          {paginatedDrivers.map(user => (
                            <UserCard key={user.id} user={user} />
                          ))}
                        </div>
                      </ScrollArea>
                      <DataPagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        className="mt-4"
                      />
                    </>
                  );
                })()
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* View Dashboard Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Eye className="h-5 w-5" />
              <span>
                {selectedUser?.role === 'owner' ? 'Owner' : 'Driver'} Dashboard - {selectedUser?.full_name || 'User'}
              </span>
              <Badge variant="outline" className="ml-2">View Only</Badge>
              {selectedUser && (
                <div className="ml-auto">
                  <AdminDocumentExportButton
                    targetUserId={selectedUser.user_id}
                    label={`${selectedUser.role ?? 'user'}-${(selectedUser.full_name || selectedUser.user_id).toString().toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`}
                  />
                </div>
              )}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[calc(90vh-100px)]">
            {selectedUser?.role === 'owner' ? (
              <OwnerDashboardPreview userId={selectedUser.user_id} userProfile={selectedUser} />
            ) : selectedUser?.role === 'driver' ? (
              <DriverDashboardPreview userId={selectedUser.user_id} userProfile={selectedUser} />
            ) : null}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Create Agreement Dialog */}
      <CreateAgreementDialog
        open={createAgreementOpen}
        onOpenChange={setCreateAgreementOpen}
      />
    </>
  );
}
