-- Create storage buckets for vehicle photos, signatures, and agreement PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('vehicle-photos', 'vehicle-photos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('agreement-pdfs', 'agreement-pdfs', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-photos', 'profile-photos', true) ON CONFLICT (id) DO NOTHING;

-- RLS policies for vehicle-photos bucket (public read, authenticated upload)
CREATE POLICY "Anyone can view vehicle photos" ON storage.objects FOR SELECT USING (bucket_id = 'vehicle-photos');
CREATE POLICY "Authenticated users can upload vehicle photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vehicle-photos' AND auth.role() = 'authenticated');
CREATE POLICY "Users can update own vehicle photos" ON storage.objects FOR UPDATE USING (bucket_id = 'vehicle-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own vehicle photos" ON storage.objects FOR DELETE USING (bucket_id = 'vehicle-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS policies for agreement-pdfs bucket (private, admin + parties)
CREATE POLICY "Admins can manage agreement PDFs" ON storage.objects FOR ALL USING (bucket_id = 'agreement-pdfs' AND public.is_admin());
CREATE POLICY "Authenticated users can read own agreement PDFs" ON storage.objects FOR SELECT USING (bucket_id = 'agreement-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS policies for signatures bucket
CREATE POLICY "Admins can manage signatures" ON storage.objects FOR ALL USING (bucket_id = 'signatures' AND public.is_admin());
CREATE POLICY "Users can upload own signatures" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can read own signatures" ON storage.objects FOR SELECT USING (bucket_id = 'signatures' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS policies for profile-photos bucket
CREATE POLICY "Anyone can view profile photos" ON storage.objects FOR SELECT USING (bucket_id = 'profile-photos');
CREATE POLICY "Users can upload own profile photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own profile photos" ON storage.objects FOR UPDATE USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own profile photos" ON storage.objects FOR DELETE USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);