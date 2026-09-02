import Seo from "@/components/seo/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Shield } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EMAIL_CONFIG, COMPANY_INFO } from "@/lib/email-config";
const Privacy = () => {
  const { country } = useRegion();

  const USAPrivacy = () => (
    <div className="prose prose-lg max-w-none space-y-8">
      <p className="text-muted-foreground text-lg">
        Last updated: February 12, 2026
      </p>
      
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">1. Introduction</h2>
        <p className="text-muted-foreground">
          Rentmaikar LLC ("Rentmaikar", "we", "our", or "us") is committed to protecting your privacy. This Privacy Policy 
          explains how we collect, use, disclose, and safeguard your information when you use our platform in the United States.
          This policy complies with applicable U.S. federal and state privacy laws, including the California Consumer Privacy Act (CCPA) 
          where applicable.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">2. Information We Collect</h2>
        
        <h3 className="text-xl font-medium">Personal Identification Information</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Full legal name and date of birth</li>
          <li>Email address and phone number</li>
          <li>Residential address</li>
          <li>Driver's license number and state of issuance</li>
          <li>Social Security Number (last 4 digits for verification)</li>
          <li>Profile photographs and verification selfies</li>
        </ul>
        
        <h3 className="text-xl font-medium mt-4">Vehicle Information (Owners)</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Vehicle Identification Number (VIN)</li>
          <li>Make, model, year, and color</li>
          <li>License plate number and state registration</li>
          <li>Vehicle title and ownership documents</li>
          <li>Insurance policy details and coverage information</li>
          <li>Vehicle photographs for listings</li>
        </ul>
        
        <h3 className="text-xl font-medium mt-4">Financial Information</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>PayPal account information for payment processing</li>
          <li>Transaction history and payment records</li>
          <li>Bank account information for payouts (Owners)</li>
        </ul>
        
        <h3 className="text-xl font-medium mt-4">IoT and Telematics Data</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Real-time GPS location coordinates (latitude/longitude)</li>
          <li>Vehicle speed and acceleration data</li>
          <li>Device battery level and signal strength</li>
          <li>Accident detection data (impact severity, deceleration G-force)</li>
          <li>Device health and connectivity status</li>
          <li>Geofencing violation alerts</li>
        </ul>
        
        <h3 className="text-xl font-medium mt-4">Usage Data</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Login timestamps and session duration</li>
          <li>Features accessed and actions taken on the Platform</li>
          <li>Device type, browser, and operating system</li>
          <li>IP address and approximate location</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">3. How We Use Your Information</h2>
        <p className="text-muted-foreground">We use the information we collect to:</p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Facilitate Rentals:</strong> Match Drivers with Owners, process applications, and manage rental agreements</li>
          <li><strong>Verify Identity:</strong> Confirm user identities, validate driver's licenses, and prevent fraud</li>
          <li><strong>Process Payments:</strong> Handle rental payments through PayPal and manage financial transactions</li>
          <li><strong>Vehicle Tracking:</strong> Provide real-time location tracking for safety, security, and fleet management</li>
          <li><strong>Safety Features:</strong> Enable accident detection, emergency alerts, and remote vehicle deactivation</li>
          <li><strong>Driver Training & Insurance:</strong> Track mandatory training completion and refresh status to determine eligibility for group insurance coverage</li>
          <li><strong>Communications:</strong> Send notifications about rentals, payments, inspections, training deadlines, and Platform updates</li>
          <li><strong>Compliance:</strong> Meet legal obligations and respond to law enforcement requests</li>
          <li><strong>Improvement:</strong> Analyze usage patterns to enhance Platform features and user experience</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">4. Information Sharing</h2>
        <p className="text-muted-foreground">We may share your information with:</p>
        
        <h3 className="text-xl font-medium">Other Platform Users</h3>
        <p className="text-muted-foreground">
          During active rentals, limited profile information is shared between matched Owners and Drivers. 
          Direct contact information is <strong>never</strong> shared to maintain Platform integrity.
        </p>
        
        <h3 className="text-xl font-medium mt-4">Service Providers</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>PayPal:</strong> Payment processing</li>
          <li><strong>Resend:</strong> Email notifications</li>
          <li><strong>SMS Providers:</strong> Text message notifications</li>
          <li><strong>Cloud Infrastructure:</strong> Secure data storage and processing</li>
        </ul>
        
        <h3 className="text-xl font-medium mt-4">Legal & Safety Disclosures</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Law enforcement agencies with valid legal process</li>
          <li>Insurance companies in the event of accidents or claims</li>
          <li>Emergency responders when accidents are detected</li>
          <li>Regulatory or legal authorities when required by applicable law</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">5. IoT Tracking Disclosure</h2>
        <p className="text-muted-foreground">
          <strong>Important Notice:</strong> All vehicles on the Rentmaikar platform are equipped with IoT tracking devices that continuously monitor:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Real-time location 24/7</li>
          <li>Driving patterns and behavior</li>
          <li>Vehicle status and health</li>
        </ul>
        <p className="text-muted-foreground">
          By using the Platform as a Driver, you explicitly consent to this continuous tracking. This data is used for 
          safety, security, payment enforcement, and fleet management purposes. Location data is retained for 90 days 
          after rental termination.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">6. Data Security</h2>
        <p className="text-muted-foreground">
          We implement industry-standard security measures to protect your information:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>TLS 1.3 encryption for data in transit</li>
          <li>AES-256 encryption for data at rest</li>
          <li>Row-Level Security (RLS) for database access control</li>
          <li>Multi-factor authentication for administrative access</li>
          <li>Regular security audits and penetration testing</li>
          <li>SOC 2 Type II compliant infrastructure</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">7. Data Retention</h2>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Account Data:</strong> Retained while account is active plus 7 years for legal compliance</li>
          <li><strong>Transaction Records:</strong> 7 years for tax and legal purposes</li>
          <li><strong>Location Data:</strong> 90 days after rental termination</li>
          <li><strong>Incident Reports:</strong> 10 years for insurance and legal purposes</li>
          <li><strong>Inspection Photos:</strong> 2 years after submission</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">8. Your Rights (CCPA)</h2>
        <p className="text-muted-foreground">
          California residents have the following rights under the CCPA:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Right to Know:</strong> Request disclosure of personal information collected</li>
          <li><strong>Right to Delete:</strong> Request deletion of personal information (subject to exceptions)</li>
          <li><strong>Right to Opt-Out:</strong> Opt out of sale of personal information (we do not sell personal information)</li>
          <li><strong>Right to Non-Discrimination:</strong> Equal service regardless of privacy choices</li>
        </ul>
        <p className="text-muted-foreground">
          To exercise these rights, contact {EMAIL_CONFIG.privacy} with "CCPA Request" in the subject line.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">9. Cookies & Tracking Technologies</h2>
        <p className="text-muted-foreground">
          We use cookies and similar technologies to:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Maintain your login session</li>
          <li>Remember your preferences (region, notification settings)</li>
          <li>Analyze Platform usage and performance</li>
          <li>Provide personalized content based on your role (Driver/Owner)</li>
        </ul>
        <p className="text-muted-foreground">
          You can manage cookie preferences through your browser settings or our cookie consent banner.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">10. Children's Privacy</h2>
        <p className="text-muted-foreground">
          Our Platform is not intended for users under 21 years of age. We do not knowingly collect personal information 
          from individuals under 21. If we become aware of such collection, we will delete the information immediately.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">11. Changes to This Policy</h2>
        <p className="text-muted-foreground">
          We may update this Privacy Policy periodically. Material changes will be communicated via email and/or 
          prominent notice on the Platform. Continued use after changes constitutes acceptance.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">12. SMS / Text Message Program</h2>
        <p className="text-muted-foreground">
          Rentmaikar offers optional SMS (text message) communications. You may opt in during
          registration or at any time from your account communication preferences. SMS consent is
          optional, is collected with a separate unchecked checkbox, and is never a condition of
          creating an account, submitting an application, renting a vehicle or using any Rentmaikar service.
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Message types:</strong> account notifications, account verification, onboarding and application updates, rental and reservation notifications, payment notifications, customer support replies and service reminders. Promotional messages are a separate, additional opt-in.</li>
          <li><strong>Message frequency:</strong> message frequency varies based on your account and rental activity.</li>
          <li><strong>Rates:</strong> message and data rates may apply.</li>
          <li><strong>Opt out:</strong> reply STOP to any message to stop receiving texts, or turn the setting off in your account preferences.</li>
          <li><strong>Help:</strong> reply HELP for help, or contact Rentmaikar customer support.</li>
          <li><strong>Records:</strong> we record each opt-in and opt-out with the mobile number, the exact disclosure shown, the page it was given on and the date and time.</li>
        </ul>
        <p className="text-muted-foreground">
          <strong>Rentmaikar does not sell, rent, or share mobile phone numbers or SMS consent information
          with third parties or affiliates for their own marketing or promotional purposes.</strong> Mobile
          numbers are shared only with our messaging service providers strictly for the purpose of
          delivering the messages you requested.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">13. Contact Us</h2>
        <p className="text-muted-foreground">
          For privacy-related inquiries or to exercise your rights:<br />
          Email: {EMAIL_CONFIG.privacy}<br />
          Phone: {COMPANY_INFO.USA.phone}
        </p>
      </section>
    </div>
  );

  const NigeriaPrivacy = () => (
    <div className="prose prose-lg max-w-none space-y-8">
      <p className="text-muted-foreground text-lg">
        Last updated: February 12, 2026
      </p>
      
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">1. Introduction</h2>
        <p className="text-muted-foreground">
          Rentmaikar Nigeria Limited ("Rentmaikar", "we", "our", or "us") is committed to protecting your privacy. This Privacy Policy 
          explains how we collect, use, disclose, and safeguard your information when you use our platform in Nigeria.
          This policy complies with the Nigeria Data Protection Regulation (NDPR) 2019 and the Nigeria Data Protection Act (NDPA) 2023.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">2. Information We Collect</h2>
        
        <h3 className="text-xl font-medium">Personal Identification Information</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Full legal name and date of birth</li>
          <li>Email address and phone number</li>
          <li>Residential address (state and LGA)</li>
          <li>Nigerian driver's license number</li>
          <li>National Identification Number (NIN)</li>
          <li>Bank Verification Number (BVN) for payment verification</li>
          <li>Profile photographs and verification selfies</li>
          <li>Guarantor information (name, phone, address, relationship)</li>
        </ul>
        
        <h3 className="text-xl font-medium mt-4">Vehicle Information (Owners)</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Vehicle chassis number</li>
          <li>Make, model, year, and colour</li>
          <li>Number plate and state of registration</li>
          <li>Vehicle particulars and proof of ownership</li>
          <li>Insurance policy details and coverage information</li>
          <li>Vehicle photographs for listings</li>
        </ul>
        
        <h3 className="text-xl font-medium mt-4">Financial Information</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Bank account details for Paystack payments</li>
          <li>Transaction history and payment records</li>
          <li>Bank account information for payouts (Owners)</li>
        </ul>
        
        <h3 className="text-xl font-medium mt-4">IoT and Telematics Data</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Real-time GPS location coordinates</li>
          <li>Vehicle speed and acceleration data</li>
          <li>Device battery level and signal strength</li>
          <li>Accident detection data (impact severity, deceleration)</li>
          <li>Device health and connectivity status</li>
          <li>State boundary crossing alerts</li>
        </ul>
        
        <h3 className="text-xl font-medium mt-4">Usage Data</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Login timestamps and session duration</li>
          <li>Features accessed and actions taken on the Platform</li>
          <li>Device type, browser, and operating system</li>
          <li>IP address and approximate location</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">3. Legal Basis for Processing (NDPR/NDPA)</h2>
        <p className="text-muted-foreground">
          Under the NDPR and NDPA, we process your personal data based on:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Consent:</strong> You have given explicit consent for processing</li>
          <li><strong>Contract:</strong> Processing is necessary to perform our services</li>
          <li><strong>Legal Obligation:</strong> Processing is required by Nigerian law</li>
          <li><strong>Legitimate Interest:</strong> Processing is necessary for our legitimate business interests</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">4. How We Use Your Information</h2>
        <p className="text-muted-foreground">We use the information we collect to:</p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Facilitate Rentals:</strong> Match Drivers with Owners, process applications, and manage rental agreements</li>
          <li><strong>Verify Identity:</strong> Confirm user identities using NIN, BVN, and driver's license verification</li>
          <li><strong>Process Payments:</strong> Handle rental payments through Paystack and manage financial transactions in Naira</li>
          <li><strong>Vehicle Tracking:</strong> Provide real-time location tracking for safety, security, and fleet management</li>
          <li><strong>Safety Features:</strong> Enable accident detection, emergency alerts, and remote vehicle deactivation</li>
          <li><strong>Driver Training & Insurance:</strong> Track mandatory training completion and refresh status to determine eligibility for group insurance coverage</li>
          <li><strong>Communications:</strong> Send notifications about rentals, payments, inspections, training deadlines, and Platform updates via SMS, WhatsApp, and email</li>
          <li><strong>Compliance:</strong> Meet legal obligations and respond to requests from regulatory authorities (NITDA, Police, FRSC)</li>
          <li><strong>Improvement:</strong> Analyse usage patterns to enhance Platform features and user experience</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">5. Information Sharing</h2>
        <p className="text-muted-foreground">We may share your information with:</p>
        
        <h3 className="text-xl font-medium">Other Platform Users</h3>
        <p className="text-muted-foreground">
          During active rentals, limited profile information is shared between matched Owners and Drivers. 
          Direct contact information is <strong>never</strong> shared to maintain Platform integrity.
        </p>
        
        <h3 className="text-xl font-medium mt-4">Service Providers</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Paystack:</strong> Payment processing</li>
          <li><strong>Resend:</strong> Email notifications</li>
          <li><strong>SMS Providers:</strong> Text message and WhatsApp notifications</li>
          <li><strong>Cloud Infrastructure:</strong> Secure data storage and processing</li>
        </ul>
        
        <h3 className="text-xl font-medium mt-4">Legal & Safety Disclosures</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Nigeria Police Force with valid legal process</li>
          <li>NITDA for regulatory compliance</li>
          <li>Insurance companies in the event of accidents or claims</li>
          <li>Emergency responders when accidents are detected</li>
          <li>FRSC, LASTMA, VIO when legally required</li>
        </ul>
        
        <h3 className="text-xl font-medium mt-4">Cross-Border Data Transfer</h3>
        <p className="text-muted-foreground">
          Some of our service providers are located outside Nigeria (USA). We ensure that such transfers comply with 
          NDPR requirements through appropriate contractual safeguards and data protection agreements.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">6. IoT Tracking Disclosure</h2>
        <p className="text-muted-foreground">
          <strong>Important Notice:</strong> All vehicles on the Rentmaikar platform are equipped with IoT tracking devices that continuously monitor:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Real-time location 24/7</li>
          <li>Driving patterns and behaviour</li>
          <li>Vehicle status and health</li>
          <li>State boundary crossings</li>
        </ul>
        <p className="text-muted-foreground">
          By using the Platform as a Driver, you explicitly consent to this continuous tracking. This data is used for 
          safety, security, payment enforcement, and fleet management purposes. Location data is retained for 90 days 
          after rental termination.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">7. Data Security</h2>
        <p className="text-muted-foreground">
          We implement security measures that meet NDPR requirements:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>SSL/TLS encryption for data in transit</li>
          <li>Encryption for data at rest</li>
          <li>Access controls and authentication</li>
          <li>Regular security assessments</li>
          <li>Employee training on data protection</li>
          <li>Incident response procedures</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">8. Data Retention</h2>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Account Data:</strong> Retained while account is active plus 6 years for legal compliance</li>
          <li><strong>Transaction Records:</strong> 6 years for tax and legal purposes</li>
          <li><strong>Location Data:</strong> 90 days after rental termination</li>
          <li><strong>Incident Reports:</strong> 10 years for insurance and legal purposes</li>
          <li><strong>Inspection Photos:</strong> 2 years after submission</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">9. Your Rights Under NDPR/NDPA</h2>
        <p className="text-muted-foreground">
          Under Nigerian data protection law, you have the right to:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Right of Access:</strong> Request a copy of your personal data</li>
          <li><strong>Right to Rectification:</strong> Request correction of inaccurate data</li>
          <li><strong>Right to Erasure:</strong> Request deletion of your data (subject to legal exceptions)</li>
          <li><strong>Right to Restrict Processing:</strong> Limit how we use your data</li>
          <li><strong>Right to Data Portability:</strong> Receive your data in a portable format</li>
          <li><strong>Right to Object:</strong> Object to certain processing activities</li>
          <li><strong>Right to Withdraw Consent:</strong> Withdraw previously given consent</li>
          <li><strong>Right to Lodge Complaint:</strong> File a complaint with NITDA</li>
        </ul>
        <p className="text-muted-foreground">
          To exercise these rights, contact {EMAIL_CONFIG.privacy} with "NDPR Request" in the subject line. 
          We will respond within 30 days as required by law.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">10. Cookies & Tracking Technologies</h2>
        <p className="text-muted-foreground">
          We use cookies and similar technologies to:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Maintain your login session</li>
          <li>Remember your preferences (region, notification settings)</li>
          <li>Analyse Platform usage and performance</li>
          <li>Provide personalised content based on your role (Driver/Owner)</li>
        </ul>
        <p className="text-muted-foreground">
          You can manage cookie preferences through your browser settings or our cookie consent banner.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">11. Children's Privacy</h2>
        <p className="text-muted-foreground">
          Our Platform is not intended for users under 21 years of age. We do not knowingly collect personal information 
          from individuals under 21. If we become aware of such collection, we will delete the information immediately.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">12. Data Protection Officer</h2>
        <p className="text-muted-foreground">
          In compliance with NDPR, we have appointed a Data Protection Officer (DPO). For data protection enquiries:<br />
          Email: {EMAIL_CONFIG.dpo}<br />
          Phone: +234 803 555 0123
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">13. Changes to This Policy</h2>
        <p className="text-muted-foreground">
          We may update this Privacy Policy periodically. Material changes will be communicated via email, SMS, and/or 
          prominent notice on the Platform. Continued use after changes constitutes acceptance.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">14. SMS / Text Message Program</h2>
        <p className="text-muted-foreground">
          Rentmaikar offers optional SMS (text message) communications. You may opt in during
          registration or at any time from your account communication preferences. SMS consent is
          optional, is collected with a separate unchecked checkbox, and is never a condition of
          creating an account, submitting an application, renting a vehicle or using any Rentmaikar service.
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Message types:</strong> account notifications, account verification, onboarding and application updates, rental and reservation notifications, payment notifications, customer support replies and service reminders. Promotional messages are a separate, additional opt-in.</li>
          <li><strong>Message frequency:</strong> message frequency varies based on your account and rental activity.</li>
          <li><strong>Rates:</strong> message and data rates may apply.</li>
          <li><strong>Opt out:</strong> reply STOP to any message to stop receiving texts, or turn the setting off in your account preferences.</li>
          <li><strong>Help:</strong> reply HELP for help, or contact Rentmaikar customer support.</li>
          <li><strong>Records:</strong> we record each opt-in and opt-out with the mobile number, the exact disclosure shown, the page it was given on and the date and time.</li>
        </ul>
        <p className="text-muted-foreground">
          <strong>Rentmaikar does not sell, rent, or share mobile phone numbers or SMS consent information
          with third parties or affiliates for their own marketing or promotional purposes.</strong> Mobile
          numbers are shared only with our messaging service providers strictly for the purpose of
          delivering the messages you requested.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">15. Contact Us</h2>
        <p className="text-muted-foreground">
          For privacy-related enquiries or to exercise your rights:<br />
          Email: {EMAIL_CONFIG.privacy}<br />
          Phone: +234 803 555 0123<br />
          Address: Rentmaikar Nigeria Limited, Lagos, Nigeria
        </p>
        <p className="text-muted-foreground mt-4">
          <strong>Regulatory Authority:</strong><br />
          National Information Technology Development Agency (NITDA)<br />
          No. 28, Port Harcourt Crescent, Off Gimbiya Street, Area 11, Garki, Abuja
        </p>
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Privacy Policy — Rentmaikar"
        description="How Rentmaikar collects, uses and protects personal data, identity documents and payment information for drivers and vehicle owners."
        path="/privacy"
      />
      <Header />
      
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center gap-3 mb-8">
            <Shield className="w-8 h-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-display font-bold">Privacy Policy</h1>
          </div>

          <Tabs defaultValue={country === 'Nigeria' ? 'nigeria' : 'usa'} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="usa">🇺🇸 United States</TabsTrigger>
              <TabsTrigger value="nigeria">🇳🇬 Nigeria</TabsTrigger>
            </TabsList>
            
            <TabsContent value="usa">
              <USAPrivacy />
            </TabsContent>
            
            <TabsContent value="nigeria">
              <NigeriaPrivacy />
            </TabsContent>
          </Tabs>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Privacy;
