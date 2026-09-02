import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRegion } from '@/contexts/RegionContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2, 
  Trash2, 
  Eye,
  AlertTriangle,
  Shield,
  Car
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { DocumentExportButton } from './DocumentExportButton';
import { UploadDropZone } from '@/components/ui/upload-drop-zone';

type DocumentType =
  | 'driver_license'
  | 'national_id'
  | 'police_report'
  | 'nin'
  | 'bvn'
  | 'passport'
  | 'vehicle_registration'
  | 'vehicle_insurance'
  | 'vin_inspection'
  | 'roadworthiness'
  | 'hackney_permit'
  | 'vehicle_license'
  | 'rideshare_approval';

type DocumentCategory = 'identification' | 'vehicle';

interface DocumentConfig {
  type: DocumentType;
  label: string;
  description: string;
  required: boolean;
  category: DocumentCategory;
  regionRequired?: 'usa' | 'nigeria' | 'all';
  vehicleSpecific?: boolean;
}

interface UserDocument {
  id: string;
  user_id: string;
  document_type: string;
  document_category: string;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  status: 'pending' | 'verified' | 'rejected';
  rejection_reason: string | null;
  vehicle_id: string | null;
  expires_at: string | null;
  created_at: string;
}

interface DocumentUploadProps {
  userType: 'driver' | 'owner';
  vehicleId?: string;
  vehicleName?: string;
}

const DRIVER_DOCUMENTS: DocumentConfig[] = [
  { type: 'driver_license', label: "Driver's License", description: 'Valid government-issued license', required: true, category: 'identification', regionRequired: 'all' },
  { type: 'national_id', label: 'National ID', description: 'Government-issued photo ID', required: true, category: 'identification', regionRequired: 'all' },
  { type: 'police_report', label: 'Police Clearance', description: 'Required for Nigerian drivers', required: true, category: 'identification', regionRequired: 'nigeria' },
  { type: 'nin', label: 'NIN Document', description: 'National Identification Number', required: true, category: 'identification', regionRequired: 'nigeria' },
  { type: 'bvn', label: 'BVN Verification', description: 'Bank Verification Number proof', required: true, category: 'identification', regionRequired: 'nigeria' },
  { type: 'rideshare_approval', label: 'Rideshare Approval', description: 'Uber/Lyft/Bolt approval letter', required: true, category: 'identification', regionRequired: 'all' },
];

const OWNER_IDENTIFICATION_DOCUMENTS: DocumentConfig[] = [
  { type: 'national_id', label: 'National ID', description: 'Government-issued photo ID', required: true, category: 'identification', regionRequired: 'all' },
  { type: 'passport', label: 'Passport', description: 'Valid passport (optional)', required: false, category: 'identification', regionRequired: 'all' },
  { type: 'nin', label: 'NIN Document', description: 'National Identification Number', required: true, category: 'identification', regionRequired: 'nigeria' },
  { type: 'bvn', label: 'BVN Verification', description: 'Bank Verification Number proof', required: true, category: 'identification', regionRequired: 'nigeria' },
];

const VEHICLE_DOCUMENTS: DocumentConfig[] = [
  { type: 'vehicle_registration', label: 'Vehicle Registration', description: 'Current vehicle registration document', required: true, category: 'vehicle', vehicleSpecific: true, regionRequired: 'all' },
  { type: 'vehicle_insurance', label: 'Vehicle Insurance', description: 'Insurance with rideshare coverage', required: true, category: 'vehicle', vehicleSpecific: true, regionRequired: 'all' },
  // USA-only
  { type: 'vin_inspection', label: 'VIN Inspection Report', description: 'State-issued VIN verification', required: true, category: 'vehicle', vehicleSpecific: true, regionRequired: 'usa' },
  // Nigeria-only (FRSC/LASRRA/VIO)
  { type: 'roadworthiness', label: 'Roadworthiness Certificate', description: 'Valid FRSC roadworthiness certificate', required: true, category: 'vehicle', vehicleSpecific: true, regionRequired: 'nigeria' },
  { type: 'hackney_permit', label: 'Hackney Permit', description: 'Commercial (hackney) permit for rideshare use', required: true, category: 'vehicle', vehicleSpecific: true, regionRequired: 'nigeria' },
  { type: 'vehicle_license', label: 'Vehicle License', description: 'Current vehicle license / proof of ownership', required: true, category: 'vehicle', vehicleSpecific: true, regionRequired: 'nigeria' },
];

const statusConfig = {
  pending: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="h-3 w-3" /> },
  verified: { label: 'Verified', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3 w-3" /> },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: <XCircle className="h-3 w-3" /> },
};

export const DocumentUpload = ({ userType, vehicleId, vehicleName }: DocumentUploadProps) => {
  const { user } = useAuth();
  const { country } = useRegion();
  const queryClient = useQueryClient();
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const isNigeria = country === 'Nigeria';

  // Get appropriate document list
  const getDocumentConfigs = (): DocumentConfig[] => {
    let docs: DocumentConfig[] = [];
    
    if (userType === 'driver') {
      docs = DRIVER_DOCUMENTS;
    } else {
      docs = vehicleId ? VEHICLE_DOCUMENTS : OWNER_IDENTIFICATION_DOCUMENTS;
    }
    
    // Filter by region — treat missing regionRequired as 'all' so future entries fail open, not closed.
    return docs.filter(doc => {
      const scope = doc.regionRequired ?? 'all';
      if (scope === 'all') return true;
      if (scope === 'nigeria' && isNigeria) return true;
      if (scope === 'usa' && !isNigeria) return true;
      return false;
    });
  };

  const documentConfigs = getDocumentConfigs();

  // Fetch existing documents
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['user-documents', user?.id, vehicleId],
    queryFn: async () => {
      if (!user) return [];
      
      let query = supabase
        .from('user_documents')
        .select('*')
        .eq('user_id', user.id);
      
      if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data as UserDocument[];
    },
    enabled: !!user,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ file, documentType, category }: { file: File; documentType: DocumentType; category: DocumentCategory }) => {
      if (!user) throw new Error('Not authenticated');
      
      setUploadProgress(10);
      
      // Create file path: userId/documentType/filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${documentType}_${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${documentType}/${fileName}`;
      
      setUploadProgress(30);
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('user-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });
      
      if (uploadError) throw uploadError;
      
      setUploadProgress(70);
      
      // Create database record
      const { error: dbError } = await supabase
        .from('user_documents')
        .insert({
          user_id: user.id,
          document_type: documentType,
          document_category: category,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          vehicle_id: vehicleId || null,
        });
      
      if (dbError) throw dbError;
      
      setUploadProgress(100);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-documents'] });
      toast.success('Document uploaded successfully');
      setUploadingType(null);
      setUploadProgress(0);
    },
    onError: (error) => {
      toast.error('Upload failed: ' + (error as Error).message);
      setUploadProgress(0);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (doc: UserDocument) => {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('user-documents')
        .remove([doc.file_path]);
      
      if (storageError) throw storageError;
      
      // Delete from database
      const { error: dbError } = await supabase
        .from('user_documents')
        .delete()
        .eq('id', doc.id);
      
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-documents'] });
      toast.success('Document deleted');
    },
    onError: (error) => {
      toast.error('Delete failed: ' + (error as Error).message);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, docType: DocumentType, category: DocumentCategory) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file, docType, category);
  };

  const processFile = (file: File, docType: DocumentType, category: DocumentCategory) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPG, PNG, WebP, and PDF files are allowed');
      return;
    }
    setUploadingType(docType);
    uploadMutation.mutate({ file, documentType: docType, category });
  };

  const getDocumentByType = (type: DocumentType): UserDocument | undefined => {
    return documents.find(d => d.document_type === type);
  };

  const getDocumentUrl = async (filePath: string): Promise<string | null> => {
    const { data } = await supabase.storage
      .from('user-documents')
      .createSignedUrl(filePath, 3600);
    return data?.signedUrl || null;
  };

  const handleViewDocument = async (doc: UserDocument) => {
    const url = await getDocumentUrl(doc.file_path);
    if (url) {
      if (typeof window !== 'undefined' && url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
    } else {
      toast.error('Could not load document');
    }
  };

  // Calculate completion percentage
  const requiredDocs = documentConfigs.filter(d => d.required);
  const completedDocs = requiredDocs.filter(d => {
    const doc = getDocumentByType(d.type);
    return doc && doc.status !== 'rejected';
  });
  const completionPercent = requiredDocs.length > 0 
    ? Math.round((completedDocs.length / requiredDocs.length) * 100) 
    : 0;

  // Auto-submit for admin review when all required identification docs are uploaded.
  // Only fires for drivers, on the identification tab (no vehicleId), and only once per session.
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    if (userType !== 'driver' || vehicleId) return;
    if (completionPercent !== 100) return;
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    setSubmitState('submitting');
    setSubmitError(null);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('auto-submit-for-review', { body: {} });
        if (error) throw error;
        // Server-side validation failures (e.g. missing docs) surface as { error, missing }
        if (data && (data as any).error) {
          const missing = (data as any).missing;
          throw new Error(
            missing?.length
              ? `${(data as any).error}: ${missing.join(', ')}`
              : (data as any).error
          );
        }
        setSubmitState('submitted');
        if (!data?.already_submitted) {
          toast.success('Application submitted for admin review');
        }
      } catch (e: any) {
        setSubmitState('error');
        setSubmitError(e?.message ?? 'Could not submit for review');
      }
    })();
  }, [completionPercent, userType, vehicleId, retryToken]);

  // In-app notification: when an admin marks any of this user's documents as
  // rejected, surface a toast + refetch so the rejection reason renders inline.
  // The DB trigger `trg_log_document_rejection` also writes to admin_audit_log.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-documents-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'user_documents', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const next = payload.new as UserDocument;
          const prev = payload.old as UserDocument;
          if (next.status === 'rejected' && prev?.status !== 'rejected') {
            toast.error(
              `Document rejected: ${next.document_type.replace(/_/g, ' ')}`,
              { description: next.rejection_reason ?? 'Please re-upload a valid document.' }
            );
            queryClient.invalidateQueries({ queryKey: ['user-documents'] });
          }
        }
      )
      .subscribe((status) => {
  if (status === 'CHANNEL_ERROR') {
    console.error('Realtime subscription failed');
  }
});;
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {vehicleId ? <Car className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
              {vehicleId ? `Vehicle Documents${vehicleName ? ` - ${vehicleName}` : ''}` : 'Identification Documents'}
            </CardTitle>
            <CardDescription>
              {vehicleId 
                ? 'Upload vehicle registration and insurance documents'
                : 'Upload your identification documents for verification'
              }
            </CardDescription>
          </div>
          {completionPercent === 100 ? (
            <Badge className="bg-green-500">
              <CheckCircle className="h-3 w-3 mr-1" />
              Complete
            </Badge>
          ) : (
            <Badge variant="outline">{completionPercent}% Complete</Badge>
          )}
        </div>
        <Progress value={completionPercent} className="mt-3" />
      </CardHeader>
      <CardContent className="space-y-4">
        {documentConfigs.map((config) => {
          const existingDoc = getDocumentByType(config.type);
          const status = existingDoc ? statusConfig[existingDoc.status] : null;
          const isUploading = uploadingType === config.type;
          
          return (
            <div 
              key={config.type}
              className="flex items-center justify-between p-4 border rounded-lg hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="p-2 rounded-lg bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{config.label}</p>
                    {config.required && (
                      <Badge variant="outline" className="text-xs">Required</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{config.description}</p>
                  {existingDoc && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Uploaded: {format(new Date(existingDoc.created_at), 'MMM dd, yyyy')}
                    </p>
                  )}
                  {existingDoc?.status === 'rejected' && existingDoc.rejection_reason && (
                    <Alert className="mt-2 py-2 border-red-200 bg-red-50">
                      <AlertTriangle className="h-3 w-3 text-red-600" />
                      <AlertDescription className="text-xs text-red-600">
                        {existingDoc.rejection_reason}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {status && (
                  <Badge className={`text-xs ${status.color}`}>
                    {status.icon}
                    <span className="ml-1">{status.label}</span>
                  </Badge>
                )}
                
                {existingDoc && (
                  <>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => handleViewDocument(existingDoc)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {existingDoc.status !== 'verified' && (
                      <Button 
                        size="sm" 
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteMutation.mutate(existingDoc)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}
                
                {(!existingDoc || existingDoc.status === 'rejected') && (
                  <UploadDropZone
                    compact
                    isUploading={isUploading}
                    progress={uploadProgress}
                    disabled={isUploading}
                    onFileSelected={(file) => processFile(file, config.type, config.category)}
                  />
                )}
              </div>
            </div>
          );
        })}
        
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertDescription>
            Accepted formats: JPG, PNG, WebP, PDF • Max size: 10MB • Documents are reviewed within 24-48 hours
          </AlertDescription>
        </Alert>

        {userType === 'driver' && !vehicleId && completionPercent === 100 && (
          <Alert
            data-testid="auto-submit-status"
            className={
              submitState === 'error'
                ? 'border-red-200 bg-red-50'
                : submitState === 'submitted'
                ? 'border-green-200 bg-green-50'
                : 'border-blue-200 bg-blue-50'
            }
          >
            {submitState === 'submitting' && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitState === 'submitted' && <CheckCircle className="h-4 w-4 text-green-600" />}
            {submitState === 'error' && <AlertTriangle className="h-4 w-4 text-red-600" />}
            <AlertDescription>
              {submitState === 'submitting' && 'Submitting your application for admin review…'}
              {submitState === 'submitted' && 'All required documents received. Your verification report has been submitted for admin review.'}
              {submitState === 'error' && (
                <span className="flex items-center justify-between gap-2">
                  <span data-testid="auto-submit-error">Auto-submit failed: {submitError}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="auto-submit-retry"
                    onClick={() => {
                      autoSubmittedRef.current = false;
                      setSubmitState('idle');
                      setSubmitError(null);
                      setRetryToken((n) => n + 1);
                    }}
                  >
                    Retry
                  </Button>
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {user && documents.length > 0 && (
          <div className="flex justify-end pt-2">
            <DocumentExportButton
              userId={user.id}
              vehicleId={vehicleId}
              label={vehicleId ? `vehicle-${vehicleId.slice(0, 8)}` : `${userType}-${user.id.slice(0, 8)}`}
              docs={documents as any}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DocumentUpload;
