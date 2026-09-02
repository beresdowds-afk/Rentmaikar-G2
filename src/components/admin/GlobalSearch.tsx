import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { 
  Search, 
  User, 
  Car, 
  ClipboardList, 
  FileText, 
  Inbox,
  HandshakeIcon,
  Package,
  Wrench,
  UserPlus,
  Shield,
  Headphones,
  Phone,
  Cpu,
  Keyboard,
} from 'lucide-react';
import { type PortalType } from './PortalNavigation';

interface GlobalSearchProps {
  onNavigate: (portal: PortalType, tab: string) => void;
}

interface SearchResult {
  id: string;
  type: 'user' | 'vehicle' | 'task' | 'application' | 'agreement' | 'negotiation' | 'incident' | 'order';
  title: string;
  subtitle?: string;
  portal: PortalType;
  tab: string;
  icon: React.ReactNode;
}

const portalShortcuts = [
  { key: '1', portal: 'crm' as PortalType, tab: 'applications', label: 'CRM - Applications' },
  { key: '2', portal: 'crm' as PortalType, tab: 'accounts', label: 'CRM - User Accounts' },
  { key: '3', portal: 'crm' as PortalType, tab: 'roles', label: 'CRM - Role Management' },
  { key: '4', portal: 'erp' as PortalType, tab: 'tracking', label: 'ERP - Vehicle Tracking' },
  { key: '5', portal: 'erp' as PortalType, tab: 'assets', label: 'ERP - Assets Registry' },
  { key: '6', portal: 'erp' as PortalType, tab: 'hardware', label: 'ERP - Hardware' },
  { key: '7', portal: 'support' as PortalType, tab: 'task-portal', label: 'Support - Task Portal' },
  { key: '8', portal: 'support' as PortalType, tab: 'inbox', label: 'Support - Unified Inbox' },
  { key: '9', portal: 'support' as PortalType, tab: 'call-center', label: 'Support - Call Center' },
];

export function GlobalSearch({ onNavigate }: GlobalSearchProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open search
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      
      // Escape to close
      if (e.key === 'Escape') {
        setOpen(false);
        setShowShortcuts(false);
      }

      // ? to show shortcuts
      if (e.key === '?' && !open) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }

      // Number keys for quick navigation (when not in search)
      if (!open && !showShortcuts && e.key >= '1' && e.key <= '9' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const shortcut = portalShortcuts.find(s => s.key === e.key);
        if (shortcut) {
          onNavigate(shortcut.portal, shortcut.tab);
        }
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, showShortcuts, onNavigate]);

  // Search queries
  const { data: searchResults = [], isLoading } = useQuery({
    queryKey: ['global-search', search],
    queryFn: async () => {
      if (search.length < 2) return [];

      const results: SearchResult[] = [];

      // Search profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email')
        .or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(5);

      profiles?.forEach(profile => {
        results.push({
          id: profile.id,
          type: 'user',
          title: profile.full_name || 'No name',
          subtitle: profile.email || undefined,
          portal: 'crm',
          tab: 'accounts',
          icon: <User className="h-4 w-4" />,
        });
      });

      // Search vehicles
      const { data: vehicles } = await supabase
        .from('vehicles')
        .select('id, make, model, year, license_plate, status')
        .or(`make.ilike.%${search}%,model.ilike.%${search}%,license_plate.ilike.%${search}%`)
        .limit(5);

      vehicles?.forEach(vehicle => {
        results.push({
          id: vehicle.id,
          type: 'vehicle',
          title: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          subtitle: `${vehicle.license_plate} • ${vehicle.status}`,
          portal: 'erp',
          tab: 'assets',
          icon: <Car className="h-4 w-4" />,
        });
      });

      // Search support tasks
      const { data: tasks } = await supabase
        .from('support_tasks')
        .select('id, title, task_type, legal_status')
        .ilike('title', `%${search}%`)
        .limit(5);

      tasks?.forEach(task => {
        results.push({
          id: task.id,
          type: 'task',
          title: task.title,
          subtitle: `${task.task_type} • ${task.legal_status}`,
          portal: 'support',
          tab: 'support-tasks',
          icon: <ClipboardList className="h-4 w-4" />,
        });
      });

      // Search applications (using first_name and last_name)
      const { data: applications } = await supabase
        .from('applications')
        .select('id, first_name, last_name, email, application_type, status')
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(5);

      applications?.forEach(app => {
        const fullName = [app.first_name, app.last_name].filter(Boolean).join(' ') || 'No name';
        results.push({
          id: app.id,
          type: 'application',
          title: fullName,
          subtitle: `${app.application_type} • ${app.status}`,
          portal: 'crm',
          tab: 'applications',
          icon: <UserPlus className="h-4 w-4" />,
        });
      });

      // Search incidents
      const { data: incidents } = await supabase
        .from('vehicle_incidents')
        .select('id, incident_type, description, status')
        .or(`incident_type.ilike.%${search}%,description.ilike.%${search}%`)
        .limit(3);

      incidents?.forEach(incident => {
        results.push({
          id: incident.id,
          type: 'incident',
          title: incident.incident_type,
          subtitle: incident.status,
          portal: 'erp',
          tab: 'incidents',
          icon: <Wrench className="h-4 w-4" />,
        });
      });

      return results;
    },
    enabled: search.length >= 2,
    staleTime: 10000,
  });

  const handleSelect = useCallback((result: SearchResult) => {
    onNavigate(result.portal, result.tab);
    setOpen(false);
    setSearch('');
  }, [onNavigate]);

  const handleQuickNav = useCallback((portal: PortalType, tab: string) => {
    onNavigate(portal, tab);
    setOpen(false);
    setSearch('');
  }, [onNavigate]);

  const getTypeColor = (type: SearchResult['type']) => {
    switch (type) {
      case 'user': return 'bg-blue-100 text-blue-700';
      case 'vehicle': return 'bg-emerald-100 text-emerald-700';
      case 'task': return 'bg-purple-100 text-purple-700';
      case 'application': return 'bg-sky-100 text-sky-700';
      case 'incident': return 'bg-rose-100 text-rose-700';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <>
      {/* Search Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground bg-muted/50 border rounded-lg hover:bg-muted transition-colors w-full md:w-64"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Keyboard Shortcuts Help */}
      <button
        onClick={() => setShowShortcuts(true)}
        className="hidden md:flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        title="Keyboard shortcuts"
      >
        <Keyboard className="h-3 w-3" />
        <span>?</span>
      </button>

      {/* Search Dialog */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder="Search users, vehicles, tasks..." 
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          {search.length < 2 ? (
            <>
              <CommandEmpty>Type at least 2 characters to search...</CommandEmpty>
              <CommandGroup heading="Quick Navigation">
                <CommandItem onSelect={() => handleQuickNav('crm', 'applications')}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  <span>Applications</span>
                  <Badge variant="outline" className="ml-auto">CRM</Badge>
                </CommandItem>
                <CommandItem onSelect={() => handleQuickNav('crm', 'accounts')}>
                  <User className="mr-2 h-4 w-4" />
                  <span>User Accounts</span>
                  <Badge variant="outline" className="ml-auto">CRM</Badge>
                </CommandItem>
                <CommandItem onSelect={() => handleQuickNav('crm', 'roles')}>
                  <Shield className="mr-2 h-4 w-4" />
                  <span>Role Management</span>
                  <Badge variant="outline" className="ml-auto">CRM</Badge>
                </CommandItem>
                <CommandItem onSelect={() => handleQuickNav('crm', 'negotiations')}>
                  <HandshakeIcon className="mr-2 h-4 w-4" />
                  <span>Negotiations</span>
                  <Badge variant="outline" className="ml-auto">CRM</Badge>
                </CommandItem>
                <CommandItem onSelect={() => handleQuickNav('crm', 'legal-agreements')}>
                  <FileText className="mr-2 h-4 w-4" />
                  <span>Legal Agreements</span>
                  <Badge variant="outline" className="ml-auto">CRM</Badge>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Operations">
                <CommandItem onSelect={() => handleQuickNav('erp', 'tracking')}>
                  <Car className="mr-2 h-4 w-4" />
                  <span>Vehicle Tracking</span>
                  <Badge variant="outline" className="ml-auto">ERP</Badge>
                </CommandItem>
                <CommandItem onSelect={() => handleQuickNav('erp', 'assets')}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  <span>Assets Registry</span>
                  <Badge variant="outline" className="ml-auto">ERP</Badge>
                </CommandItem>
                <CommandItem onSelect={() => handleQuickNav('erp', 'hardware')}>
                  <Cpu className="mr-2 h-4 w-4" />
                  <span>Hardware Management</span>
                  <Badge variant="outline" className="ml-auto">ERP</Badge>
                </CommandItem>
                <CommandItem onSelect={() => handleQuickNav('erp', 'incidents')}>
                  <Wrench className="mr-2 h-4 w-4" />
                  <span>Incidents</span>
                  <Badge variant="outline" className="ml-auto">ERP</Badge>
                </CommandItem>
                <CommandItem onSelect={() => handleQuickNav('erp', 'device-orders')}>
                  <Package className="mr-2 h-4 w-4" />
                  <span>Device Orders</span>
                  <Badge variant="outline" className="ml-auto">ERP</Badge>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Support">
                <CommandItem onSelect={() => handleQuickNav('support', 'task-portal')}>
                  <Headphones className="mr-2 h-4 w-4" />
                  <span>Task Portal</span>
                  <Badge variant="outline" className="ml-auto">Support</Badge>
                </CommandItem>
                <CommandItem onSelect={() => handleQuickNav('support', 'inbox')}>
                  <Inbox className="mr-2 h-4 w-4" />
                  <span>Unified Inbox</span>
                  <Badge variant="outline" className="ml-auto">Support</Badge>
                </CommandItem>
                <CommandItem onSelect={() => handleQuickNav('support', 'call-center')}>
                  <Phone className="mr-2 h-4 w-4" />
                  <span>Call Center</span>
                  <Badge variant="outline" className="ml-auto">Support</Badge>
                </CommandItem>
              </CommandGroup>
            </>
          ) : isLoading ? (
            <CommandEmpty>Searching...</CommandEmpty>
          ) : searchResults.length === 0 ? (
            <CommandEmpty>No results found for "{search}"</CommandEmpty>
          ) : (
            <CommandGroup heading={`Results (${searchResults.length})`}>
              {searchResults.map((result) => (
                <CommandItem 
                  key={`${result.type}-${result.id}`} 
                  onSelect={() => handleSelect(result)}
                  className="flex items-center gap-3"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getTypeColor(result.type)}`}>
                    {result.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{result.title}</p>
                    {result.subtitle && (
                      <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="capitalize">{result.type}</Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>

      {/* Keyboard Shortcuts Modal */}
      <CommandDialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </h3>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Global</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Open search</span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 text-xs rounded border bg-muted">⌘</kbd>
                    <kbd className="px-2 py-1 text-xs rounded border bg-muted">K</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Show shortcuts</span>
                  <kbd className="px-2 py-1 text-xs rounded border bg-muted">?</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Close dialogs</span>
                  <kbd className="px-2 py-1 text-xs rounded border bg-muted">Esc</kbd>
                </div>
              </div>
            </div>
            <CommandSeparator />
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Quick Navigation (⌘ + Number)</h4>
              <div className="grid grid-cols-1 gap-1.5 text-sm">
                {portalShortcuts.map((shortcut) => (
                  <div key={shortcut.key} className="flex items-center justify-between">
                    <span>{shortcut.label}</span>
                    <div className="flex gap-1">
                      <kbd className="px-2 py-0.5 text-xs rounded border bg-muted">⌘</kbd>
                      <kbd className="px-2 py-0.5 text-xs rounded border bg-muted">{shortcut.key}</kbd>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CommandDialog>
    </>
  );
}
