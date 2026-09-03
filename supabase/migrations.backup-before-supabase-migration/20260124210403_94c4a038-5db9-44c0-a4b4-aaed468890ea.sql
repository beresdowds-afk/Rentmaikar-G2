-- Create storage bucket for user documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-documents', 
  'user-documents', 
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
);

-- Create table to track document uploads
CREATE TABLE public.user_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  document_type TEXT NOT NULL, -- driver_license, insurance, police_report, nin, bvn, vehicle_registration, vehicle_insurance, etc.
  document_category TEXT NOT NULL, -- 'identification' or 'vehicle'
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, verified, rejected
  verified_by UUID,
  verified_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  expires_at DATE, -- For documents that expire
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;

-- Users can view their own documents
CREATE POLICY "Users can view their own documents"
ON public.user_documents
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can upload their own documents
CREATE POLICY "Users can upload their own documents"
ON public.user_documents
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own pending documents
CREATE POLICY "Users can update their own pending documents"
ON public.user_documents
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status = 'pending');

-- Admins can manage all documents
CREATE POLICY "Admins can manage all documents"
ON public.user_documents
FOR ALL
TO authenticated
USING (public.is_admin());

-- Storage policies for user-documents bucket
CREATE POLICY "Users can upload their own documents to storage"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own documents in storage"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own documents in storage"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'user-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own documents in storage"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'user-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can manage all documents in storage"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'user-documents' 
  AND public.is_admin()
);

-- Add trigger for updated_at
CREATE TRIGGER update_user_documents_updated_at
BEFORE UPDATE ON public.user_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes
CREATE INDEX idx_user_documents_user_id ON public.user_documents(user_id);
CREATE INDEX idx_user_documents_status ON public.user_documents(status);
CREATE INDEX idx_user_documents_type ON public.user_documents(document_type);

-- Add email_verified column to profiles if not exists
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;