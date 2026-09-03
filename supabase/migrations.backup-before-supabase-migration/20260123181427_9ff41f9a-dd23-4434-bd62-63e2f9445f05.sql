-- Create a PRIVATE storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false);

-- Allow authenticated users to upload their own attachments
CREATE POLICY "Users can upload chat attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to view their own attachments, and admins to view all
CREATE POLICY "Users can view own attachments, admins can view all"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-attachments' AND
  (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
);

-- Allow users to delete their own attachments
CREATE POLICY "Users can delete own attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'chat-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);