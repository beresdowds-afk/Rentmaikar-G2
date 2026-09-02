-- Create FAQ categories table
CREATE TABLE public.faq_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  region TEXT CHECK (region IN ('USA', 'Nigeria', 'all')) DEFAULT 'all',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create FAQ items table
CREATE TABLE public.faq_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES public.faq_categories(id) ON DELETE CASCADE NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  region TEXT CHECK (region IN ('USA', 'Nigeria', 'all')) DEFAULT 'all',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create policy versions table for versioned Terms/Privacy
CREATE TABLE public.policy_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('terms', 'privacy')),
  version TEXT NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('USA', 'Nigeria')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  effective_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (policy_type, version, region)
);

-- Create policy acceptance audit trail
CREATE TABLE public.policy_acceptances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  policy_version_id UUID REFERENCES public.policy_versions(id) NOT NULL,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('terms', 'privacy')),
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  region TEXT CHECK (region IN ('USA', 'Nigeria')),
  UNIQUE (user_id, policy_version_id)
);

-- Enable RLS on all tables
ALTER TABLE public.faq_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_acceptances ENABLE ROW LEVEL SECURITY;

-- FAQ Categories policies (public read, admin write)
CREATE POLICY "Anyone can view active FAQ categories"
ON public.faq_categories FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage FAQ categories"
ON public.faq_categories FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- FAQ Items policies (public read, admin write)
CREATE POLICY "Anyone can view active public FAQ items"
ON public.faq_items FOR SELECT
USING (is_active = true AND is_public = true);

CREATE POLICY "Authenticated users can view non-public FAQ items"
ON public.faq_items FOR SELECT
TO authenticated
USING (is_active = true);

CREATE POLICY "Admins can manage FAQ items"
ON public.faq_items FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Policy versions policies (public read, admin write)
CREATE POLICY "Anyone can view active policy versions"
ON public.policy_versions FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage policy versions"
ON public.policy_versions FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Policy acceptances policies (users manage own, admins view all)
CREATE POLICY "Users can view own policy acceptances"
ON public.policy_acceptances FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can create own policy acceptances"
ON public.policy_acceptances FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all policy acceptances"
ON public.policy_acceptances FOR SELECT
TO authenticated
USING (public.is_admin());

-- Create updated_at triggers
CREATE TRIGGER update_faq_categories_updated_at
BEFORE UPDATE ON public.faq_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_faq_items_updated_at
BEFORE UPDATE ON public.faq_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_policy_versions_updated_at
BEFORE UPDATE ON public.policy_versions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial FAQ data
INSERT INTO public.faq_categories (name, slug, description, display_order, region) VALUES
('General', 'general', 'General questions about Rentmaikar', 1, 'all'),
('Drivers', 'drivers', 'Questions for rideshare drivers', 2, 'all'),
('Car Owners', 'owners', 'Questions for vehicle owners', 3, 'all'),
('Payments & Finance', 'payments', 'Payment and financial questions', 4, 'all'),
('Verification & Compliance', 'verification', 'Identity verification and compliance', 5, 'all'),
('Admin & Policies', 'admin', 'Platform policies and administration', 6, 'all'),
('Support', 'support', 'Customer support information', 7, 'all'),
('Regional Information', 'regional', 'Region-specific information', 8, 'all');

-- Insert initial FAQ items
INSERT INTO public.faq_items (category_id, question, answer, display_order, region)
SELECT c.id, q.question, q.answer, q.display_order, q.region
FROM public.faq_categories c
CROSS JOIN (VALUES
  ('general', 'What is Rentmaikar?', 'Rentmaikar is a digital vehicle leasing and car rental platform that connects car owners, drivers, and administrators in a secure and structured way. We manage listings, bookings, negotiations, payments, and compliance — all in one system.', 1, 'all'),
  ('general', 'Where does Rentmaikar operate?', 'Rentmaikar currently operates in Nigeria and the United States, with support for multi-region expansion.', 2, 'all'),
  ('general', 'Who can use Rentmaikar?', 'Vehicle owners who want to earn income from their cars, drivers looking for cars for ride-share or personal use, and fleet operators and transport businesses.', 3, 'all'),
  ('general', 'Is Rentmaikar safe to use?', 'Yes. Rentmaikar uses verification, controlled communication, and secure payments to protect users.', 4, 'all'),
  ('drivers', 'How do I sign up as a driver?', 'Create an account, complete your profile, submit required verification documents, and wait for approval.', 1, 'all'),
  ('drivers', 'Can I negotiate rental prices?', 'Yes. Rentmaikar allows structured price negotiation between drivers and the platform. All negotiations are handled securely within the app.', 2, 'all'),
  ('drivers', 'Can I contact car owners directly?', 'No. To protect all parties, Rentmaikar does not allow direct communication between drivers and car owners. All communication is managed by the platform.', 3, 'all'),
  ('drivers', 'How do I make payments?', 'Payments are made securely through Rentmaikar using approved payment methods available in your region.', 4, 'all'),
  ('drivers', 'What happens if a car breaks down?', 'Report the issue immediately through the app. Our support team will guide you through the next steps based on the rental agreement.', 5, 'all'),
  ('drivers', 'Can I rent a car for ride-share work?', 'Yes. Many vehicles listed on Rentmaikar are suitable for ride-share and commercial use, subject to approval.', 6, 'all'),
  ('owners', 'How do I list my car?', 'After creating an owner account, submit your vehicle details, documents, and photos. Once approved, your car will be available for rental.', 1, 'all'),
  ('owners', 'Who sets the rental price?', 'Owners propose a base price. Final pricing may be adjusted through negotiations handled by the platform.', 2, 'all'),
  ('owners', 'How do I get paid?', 'Earnings are credited to your Rentmaikar wallet and can be withdrawn automatically or manually, depending on your settings.', 3, 'all'),
  ('owners', 'Can I track my vehicle?', 'Yes. Rentmaikar supports vehicle tracking and IoT integration where available.', 4, 'all'),
  ('owners', 'What if a driver damages my car?', 'All rentals are governed by platform policies and agreements. Damage reports and resolutions are handled through Rentmaikar''s support system.', 5, 'all'),
  ('owners', 'Does Rentmaikar support fleet owners?', 'Yes. Fleet operators can manage multiple vehicles, drivers, and payouts from one dashboard.', 6, 'all'),
  ('payments', 'Does Rentmaikar hold my money?', 'Yes. Rentmaikar acts as a trusted intermediary, holding funds until rental conditions are met, then releasing payments accordingly.', 1, 'all'),
  ('payments', 'Are there service fees?', 'Yes. Rentmaikar charges platform and service fees, which are clearly shown before any transaction is completed.', 2, 'all'),
  ('payments', 'Can I view transaction history?', 'Yes. All users have access to detailed transaction and payment history in their dashboard.', 3, 'all'),
  ('verification', 'Why do I need to verify my identity?', 'Verification ensures trust, safety, and regulatory compliance for all users on the platform.', 1, 'all'),
  ('verification', 'What documents are required?', 'Requirements vary by region but may include: Government-issued ID, Driver''s license, Vehicle registration, Insurance documents.', 2, 'all'),
  ('verification', 'Is my data secure?', 'Yes. Rentmaikar uses industry-standard security practices to protect user data and transactions.', 3, 'all'),
  ('admin', 'Who manages disputes?', 'All disputes are handled by Rentmaikar''s admin team to ensure fairness and transparency.', 1, 'all'),
  ('admin', 'Can my account be suspended?', 'Yes. Accounts may be suspended for policy violations, fraud, or non-compliance with platform rules.', 2, 'all'),
  ('admin', 'Does Rentmaikar support businesses and fleets?', 'Yes. Rentmaikar supports individual owners, fleet operators, and enterprise clients.', 3, 'all'),
  ('support', 'How do I contact support?', 'Use the in-app support feature or the official Rentmaikar contact channels listed on the website.', 1, 'all'),
  ('support', 'What are your support hours?', 'Support hours depend on region and are displayed in the app.', 2, 'all'),
  ('support', 'How long does approval take?', 'Approval timelines vary by region and completeness of submitted documents.', 3, 'all'),
  ('regional', 'What payment methods are supported in Nigeria?', 'Supported payment methods include local bank transfers and region-approved digital wallets via Paystack.', 1, 'Nigeria'),
  ('regional', 'What verification is required in Nigeria?', 'Verification may require National ID (NIN), BVN, or equivalent documents.', 2, 'Nigeria'),
  ('regional', 'What payment methods are supported in the USA?', 'Supported payment methods include debit/credit cards and bank transfers via PayPal.', 3, 'USA'),
  ('regional', 'What verification is required in the USA?', 'Verification may require a valid U.S. driver''s license and insurance documentation.', 4, 'USA')
) AS q(category_slug, question, answer, display_order, region)
WHERE c.slug = q.category_slug;

-- Insert initial policy versions
INSERT INTO public.policy_versions (policy_type, version, region, title, content, summary, effective_date, is_active) VALUES
('terms', '1.0', 'USA', 'Terms of Service - United States', 
'## 1. Introduction
These Terms of Service ("Terms") govern access to and use of the Rentmaikar platform, including the website, mobile applications, and all related services (collectively, the "Platform"). By accessing or using Rentmaikar, you agree to be bound by these Terms.

## 2. Platform Role & Nature of Service
Rentmaikar operates strictly as a technology-enabled marketplace and administrative platform. Rentmaikar does not own vehicles, does not employ drivers, and does not provide transportation services. Vehicle owners and drivers act independently and are solely responsible for their actions.

## 3. Eligibility & Account Registration
Users must be legally eligible in their jurisdiction, provide accurate information, and maintain one account per role unless expressly authorized. Rentmaikar reserves the right to verify identity and documentation at any time.

## 4. Verification & Compliance
All users must complete required verification processes. Failure to maintain valid documentation may result in suspension or termination. Verification requirements may vary by region.

## 5. Use of the Platform
All negotiations, rentals, communications, and payments must occur within Rentmaikar. Circumventing the platform, engaging in off-platform transactions, or attempting direct contact where restricted is strictly prohibited.

## 6. Fees & Payments
Rentmaikar charges platform, service, and administrative fees. Fees are disclosed before transaction confirmation. Rentmaikar may hold and disburse funds in accordance with rental milestones and dispute resolution processes.

## 7. Vehicle Listings & Responsibilities
Owners are responsible for ensuring vehicles are roadworthy, insured, and legally registered. Drivers are responsible for lawful and proper vehicle use during rentals.

## 8. Disputes & Resolution
All disputes arising from platform use must be submitted through Rentmaikar''s dispute resolution process. Rentmaikar''s decision shall be final, subject to applicable law.

## 9. Suspension & Termination
Rentmaikar may suspend or terminate accounts for policy violations, fraud, risk exposure, or legal non-compliance, with or without prior notice where permitted by law.

## 10. Limitation of Liability
To the maximum extent permitted by law, Rentmaikar shall not be liable for indirect, incidental, or consequential damages, loss of income, vehicle damage, or third-party actions.

## 11. Indemnification
Users agree to indemnify and hold Rentmaikar harmless from claims, damages, losses, and expenses arising from their use of the Platform or violation of these Terms.

## 12. Modifications to Terms
Rentmaikar may update these Terms from time to time. Continued use of the Platform constitutes acceptance of updated Terms.

## 13. Governing Law
These Terms are governed by the laws of the State of Maryland, USA, without regard to conflict of law principles.',
'Key updates: Platform role clarification, comprehensive liability terms, IoT tracking consent requirements.', '2026-01-23', true),

('terms', '1.0', 'Nigeria', 'Terms of Service - Nigeria',
'## 1. Introduction
These Terms of Service ("Terms") govern access to and use of the Rentmaikar platform, including the website, mobile applications, and all related services (collectively, the "Platform"). By accessing or using Rentmaikar, you agree to be bound by these Terms.

## 2. Platform Role & Nature of Service
Rentmaikar operates strictly as a technology-enabled marketplace and administrative platform. Rentmaikar does not own vehicles, does not employ drivers, and does not provide transportation services. Vehicle owners and drivers act independently and are solely responsible for their actions.

## 3. Eligibility & Account Registration
Users must be legally eligible under Nigerian law, provide accurate information, and maintain one account per role unless expressly authorized. Rentmaikar reserves the right to verify identity and documentation at any time using NIN, BVN, and other verification methods.

## 4. Verification & Compliance
All users must complete required verification processes including NIN verification. Failure to maintain valid documentation may result in suspension or termination. Requirements comply with NITDA and CBN regulations.

## 5. Use of the Platform
All negotiations, rentals, communications, and payments must occur within Rentmaikar. Circumventing the platform, engaging in off-platform transactions, or attempting direct contact where restricted is strictly prohibited.

## 6. Fees & Payments
Rentmaikar charges platform, service, and administrative fees in Nigerian Naira. Fees are disclosed before transaction confirmation. Payments are processed through Paystack.

## 7. Vehicle Listings & Responsibilities
Owners are responsible for ensuring vehicles are roadworthy, insured, and legally registered with FRSC. Drivers are responsible for lawful and proper vehicle use during rentals.

## 8. Disputes & Resolution
All disputes arising from platform use must be submitted through Rentmaikar''s dispute resolution process. Rentmaikar''s decision shall be final, subject to Nigerian law.

## 9. Suspension & Termination
Rentmaikar may suspend or terminate accounts for policy violations, fraud, risk exposure, or legal non-compliance, with or without prior notice where permitted by law.

## 10. Limitation of Liability
To the maximum extent permitted by Nigerian law, Rentmaikar shall not be liable for indirect, incidental, or consequential damages, loss of income, vehicle damage, or third-party actions.

## 11. Indemnification
Users agree to indemnify and hold Rentmaikar harmless from claims, damages, losses, and expenses arising from their use of the Platform or violation of these Terms.

## 12. Modifications to Terms
Rentmaikar may update these Terms from time to time. Continued use of the Platform constitutes acceptance of updated Terms.

## 13. Governing Law
These Terms are governed by the laws of the Federal Republic of Nigeria.',
'Key updates: NDPA compliance, NIN/BVN verification requirements, Paystack payments, FRSC compliance.', '2026-01-23', true),

('privacy', '1.0', 'USA', 'Privacy Policy - United States',
'## 1. Introduction
This Privacy Policy explains how Rentmaikar collects, uses, stores, and protects personal data in compliance with U.S. federal and state privacy laws, including CCPA.

## 2. Information We Collect
- Identity and verification information (name, DOB, SSN last 4, driver''s license)
- Contact details (email, phone, address)
- Vehicle and transaction data
- Usage logs, device, and interaction data
- IoT and telematics data (GPS, speed, accident detection)

## 3. How We Use Information
- To operate, maintain, and improve the Platform
- To process payments and rentals
- To perform verification and compliance checks
- To communicate platform updates and support
- To enable safety features including accident detection

## 4. Legal Basis for Processing
Data processing is based on contractual necessity, legal obligations, legitimate interests, and user consent where required.

## 5. Data Sharing & Disclosure
Data may be shared with payment processors (PayPal), verification partners, cloud infrastructure providers, and regulatory authorities as required by law.

## 6. Data Retention
Personal data is retained only as long as necessary to fulfill platform purposes or legal obligations. Location data retained for 90 days after rental termination.

## 7. Data Security
Rentmaikar applies TLS 1.3 encryption, AES-256 encryption at rest, Row-Level Security, and regular security audits.

## 8. User Rights (CCPA)
California residents have rights to know, delete, opt-out, and non-discrimination under CCPA. Contact privacy@rentmaikar.com.

## 9. International Data Transfers
Data may be processed in multiple jurisdictions using appropriate safeguards.

## 10. Cookies & Tracking
Rentmaikar uses cookies and similar technologies to enhance user experience and platform functionality.

## 11. Changes to This Policy
Rentmaikar may update this Privacy Policy periodically. Continued use of the Platform constitutes acceptance of changes.

## 12. Contact
Privacy-related inquiries: privacy@rentmaikar.com | +1 (240) 393-0081',
'Key updates: CCPA rights, IoT data disclosure, 90-day location retention, security measures.', '2026-01-23', true),

('privacy', '1.0', 'Nigeria', 'Privacy Policy - Nigeria',
'## 1. Introduction
This Privacy Policy explains how Rentmaikar Nigeria Limited collects, uses, stores, and protects personal data in compliance with the Nigeria Data Protection Regulation (NDPR) 2019 and Nigeria Data Protection Act (NDPA) 2023.

## 2. Information We Collect
- Identity and verification information (name, DOB, NIN, BVN, driver''s license)
- Contact details (email, phone, address, state, LGA)
- Guarantor information
- Vehicle and transaction data
- Usage logs, device, and interaction data
- IoT and telematics data (GPS, speed, accident detection)

## 3. How We Use Information
- To operate, maintain, and improve the Platform
- To process payments via Paystack in Naira
- To perform verification and compliance checks (NIN, BVN)
- To communicate platform updates via SMS, WhatsApp, and email
- To enable safety features including accident detection

## 4. Legal Basis for Processing (NDPR/NDPA)
- Consent: Explicit consent for processing
- Contract: Necessary to perform services
- Legal Obligation: Required by Nigerian law
- Legitimate Interest: Necessary for business interests

## 5. Data Sharing & Disclosure
Data may be shared with Paystack, verification partners, cloud infrastructure providers, and regulatory authorities (NITDA, Police, FRSC) as required by law.

## 6. Data Retention
Personal data is retained only as long as necessary to fulfill platform purposes or legal obligations. Location data retained for 90 days after rental termination.

## 7. Data Security
Rentmaikar applies TLS 1.3 encryption, AES-256 encryption at rest, Row-Level Security, and regular security audits.

## 8. User Rights (NDPR/NDPA)
Nigerian users have rights to access, rectification, erasure, restriction, portability, and objection. Contact privacy@rentmaikar.com.ng.

## 9. International Data Transfers
Data may be processed in multiple jurisdictions using NDPR-approved safeguards.

## 10. Cookies & Tracking
Rentmaikar uses cookies and similar technologies to enhance user experience and platform functionality.

## 11. Changes to This Policy
Rentmaikar may update this Privacy Policy periodically. Continued use of the Platform constitutes acceptance of changes.

## 12. Contact
Privacy-related inquiries: privacy@rentmaikar.com.ng | +234 (803) 000-0000',
'Key updates: NDPR/NDPA compliance, NIN/BVN data collection, guarantor info, WhatsApp communications.', '2026-01-23', true);