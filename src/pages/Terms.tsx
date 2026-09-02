import Seo from "@/components/seo/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { FileText } from "lucide-react";
import { useRegion } from "@/contexts/RegionContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EMAIL_CONFIG, COMPANY_INFO } from "@/lib/email-config";

const Terms = () => {
  const { country } = useRegion();

  const USATerms = () => (
    <div className="prose prose-lg max-w-none space-y-8">
      <p className="text-muted-foreground text-lg">
        Last updated: February 12, 2026
      </p>
      
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">1. Acceptance of Terms</h2>
        <p className="text-muted-foreground">
          By accessing or using the Rentmaikar platform ("Platform"), you agree to be bound by these Terms of Use ("Terms"). 
          These Terms constitute a legally binding agreement between you and Rentmaikar LLC, a company registered in the United States.
          If you do not agree to these Terms, please do not use our services.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">2. Description of Services</h2>
        <p className="text-muted-foreground">
          Rentmaikar is a vehicle rental marketplace that connects vehicle owners ("Owners") with rideshare drivers ("Drivers") 
          for Uber, Lyft, and similar transportation network companies (TNCs) in the Washington DC, Maryland, and Virginia metropolitan areas.
        </p>
        <p className="text-muted-foreground">
          <strong>Important:</strong> Rentmaikar acts solely as an intermediary platform. We are not a party to rental agreements 
          between Owners and Drivers, nor are we a transportation company, car rental agency, or insurance provider.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">3. User Registration & Eligibility</h2>
        <h3 className="text-xl font-medium">Driver Requirements</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Must be at least 21 years of age</li>
          <li>Must possess a valid U.S. driver's license</li>
          <li>Must be approved to drive for Uber, Lyft, or similar TNCs</li>
          <li>Must pass identity verification and background check</li>
          <li>Must maintain active rideshare insurance coverage</li>
          <li>Must have a verified phone number for notifications</li>
        </ul>
        
        <h3 className="text-xl font-medium mt-4">Owner Requirements</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Must be the legal owner or authorized representative of listed vehicles</li>
          <li>Must provide proof of vehicle registration and title</li>
          <li>Must maintain comprehensive insurance coverage on all listed vehicles</li>
          <li>Must ensure vehicles meet TNC requirements (year, condition, safety)</li>
          <li>Must install Rentmaikar IoT tracking devices on all listed vehicles</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">4. Prohibited Activities</h2>
        <p className="text-muted-foreground font-medium text-destructive">
          The following activities are strictly prohibited and will result in immediate account suspension or permanent ban:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Direct Contact:</strong> Exchanging personal contact information (phone numbers, email, social media) between Owners and Drivers outside the Platform</li>
          <li><strong>Off-Platform Payments:</strong> Making or accepting rental payments outside the Platform's payment system</li>
          <li><strong>Subleasing:</strong> Drivers may not sublease, subrent, or allow third parties to operate rented vehicles</li>
          <li><strong>Price Circumvention:</strong> Attempting to negotiate prices outside the Platform's administrative mediation system</li>
          <li><strong>IoT Tampering:</strong> Disabling, removing, or interfering with IoT tracking devices</li>
          <li><strong>Fraudulent Activity:</strong> Providing false information, fake documents, or misrepresenting identity</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">5. Price Negotiation & Administrative Mediation</h2>
        <p className="text-muted-foreground">
          All price negotiations between Owners and Drivers must occur exclusively through Rentmaikar's administrative mediation system:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Drivers may submit price requests through the Platform</li>
          <li>Rentmaikar administrators review and mediate all negotiations</li>
          <li>Owners may accept, reject, or counter through the Platform</li>
          <li>Final approved rates are locked and binding for the rental period</li>
          <li>Rate modifications require administrative approval</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">6. Payment Terms</h2>
        <p className="text-muted-foreground">
          Rental payments in the USA are processed through PayPal in US Dollars (USD):
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Daily or weekly payment frequencies available based on agreement</li>
          <li>Payments are due by 11:59 PM on the scheduled due date</li>
          <li>Late payments incur a 24-hour grace period before penalties apply</li>
          <li>Continued non-payment may result in remote vehicle deactivation via IoT</li>
          <li>Repeated payment defaults may result in account suspension and loss of daily payment privileges</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">7. IoT Tracking & Remote Deactivation</h2>
        <p className="text-muted-foreground">
          All vehicles listed on Rentmaikar are required to have IoT tracking devices installed:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Real-time GPS Tracking:</strong> Continuous location monitoring for safety and security</li>
          <li><strong>Accident Detection:</strong> Automatic detection of collisions with instant alerts to Owners and Administrators</li>
          <li><strong>Remote Deactivation:</strong> Vehicles may be remotely disabled in cases of payment default, unauthorized use, theft, or safety concerns</li>
          <li><strong>Telemetry Data:</strong> Speed, battery level, and signal strength are monitored</li>
          <li><strong>Geofencing:</strong> Vehicles may be restricted to approved geographic areas</li>
        </ul>
        <p className="text-muted-foreground">
          By using the Platform, Drivers consent to continuous vehicle tracking and acknowledge the possibility of remote deactivation.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">8. Weekly Inspection Reports</h2>
        <p className="text-muted-foreground">
          Drivers are required to submit weekly vehicle inspection reports:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Reports are due every Sunday by 11:59 PM</li>
          <li>Reports must include 10 photographs: front view, back view, both sides, all four tires, dashboard, and interior</li>
          <li>Photos must be timestamped and geotagged</li>
          <li>Failure to submit reports may result in rental suspension</li>
          <li>Owners review reports and may request vehicle withdrawal if damage is identified</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">9. Mandatory Driver Training & Group Insurance</h2>
        <p className="text-muted-foreground">
          All Drivers must complete Rentmaikar's online Driver Training Program before being eligible to operate any vehicle on the Platform:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Prerequisite for Insurance:</strong> Completion of the Driver Training Program is a mandatory precondition for enrollment in Rentmaikar's group insurance coverage. Drivers who have not completed or whose training has lapsed are <strong>not eligible</strong> for group insurance benefits</li>
          <li><strong>Mandatory Completion:</strong> Training must be completed in full before the Driver may begin any rental period</li>
          <li><strong>Compulsory Refresh:</strong> Drivers must complete a training refresh every six (6) months to maintain active status and continued insurance eligibility</li>
          <li><strong>Training Subscription:</strong> An annual training subscription fee of $24 USD applies</li>
          <li><strong>Suspension for Non-Compliance:</strong> Failure to complete the initial training or mandatory refresh will result in immediate suspension of driving privileges and group insurance coverage until training is brought current</li>
          <li><strong>Training Records:</strong> All training completions and refresh dates are logged and auditable</li>
        </ul>
        <p className="text-muted-foreground font-medium">
          <strong>Important:</strong> No group insurance claim will be processed for any Driver whose training status is not current at the time of the incident.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">10. Incident Reporting</h2>
        <p className="text-muted-foreground">
          Drivers must report all incidents immediately through the Platform:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Accidents, collisions, or any vehicle damage</li>
          <li>Mechanical breakdowns or maintenance issues</li>
          <li>Theft, vandalism, or attempted theft</li>
          <li>Any interaction with law enforcement involving the vehicle</li>
        </ul>
        <p className="text-muted-foreground">
          Late reporting (more than 24 hours after incident) is flagged and may affect Driver ratings and future rental eligibility.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">11. Limitation of Liability</h2>
        <p className="text-muted-foreground">
          Rentmaikar LLC endeavors to provide a reliable platform. However, Rentmaikar's role is limited to that of an intermediary and facilitator. Users acknowledge that:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Vehicle condition, maintenance, and safety remain the responsibility of the Owner</li>
          <li>Driving conduct and compliance with traffic laws remain the responsibility of the Driver</li>
          <li>Rentmaikar does not guarantee uninterrupted service availability</li>
          <li>Users are encouraged to resolve concerns through the Platform's mediation and dispute resolution channels</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">12. Mediation & Dispute Resolution</h2>
        <p className="text-muted-foreground">
          Rentmaikar is committed to resolving all disputes amicably through structured mediation:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Step 1 — Internal Mediation:</strong> All disputes between Owners, Drivers, and the Platform must first be submitted to Rentmaikar's administrative mediation team for review and resolution</li>
          <li><strong>Step 2 — Independent Mediation:</strong> If internal mediation does not resolve the matter within 30 days, either party may request independent mediation through a mutually agreed-upon mediator</li>
          <li><strong>Step 3 — Alternative Dispute Resolution (ADR):</strong> As a final step, unresolved disputes may be submitted to alternative dispute resolution in accordance with the laws of the State of Maryland, USA</li>
        </ul>
        <p className="text-muted-foreground">
          Both parties agree to participate in good faith in the mediation process before pursuing any other remedies.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">13. Cooperation & Good Faith</h2>
        <p className="text-muted-foreground">
          All users agree to cooperate in good faith with Rentmaikar's mediation and dispute resolution processes. 
          Users acknowledge that collaborative resolution benefits all parties and helps maintain a trusted platform community.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">14. SMS / Text Message Program</h2>
        <p className="text-muted-foreground">
          By opting in to Rentmaikar SMS communications you agree to receive text messages from
          Rentmaikar about your account, vehicle rentals, applications, reservations, payments,
          customer support and service updates. Promotional text messages require a separate opt-in.
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>SMS consent is optional and is not a condition of purchasing or using Rentmaikar services.</li>
          <li>Message frequency varies. Message and data rates may apply.</li>
          <li>Reply STOP to opt out of further messages. Reply HELP for help.</li>
          <li>Messages may contain links to your Rentmaikar account, application or rental details.</li>
          <li>You may review or withdraw your consent at any time in your account communication preferences.</li>
          <li>Rentmaikar does not sell, rent or share mobile phone numbers or SMS consent information with third parties or affiliates for their own marketing or promotional purposes.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">15. Contact Information</h2>
        <p className="text-muted-foreground">
          For questions about these Terms of Use:<br />
          Email: {EMAIL_CONFIG.legal}<br />
          Phone: {COMPANY_INFO.USA.phone}
        </p>
      </section>
    </div>
  );

  const NigeriaTerms = () => (
    <div className="prose prose-lg max-w-none space-y-8">
      <p className="text-muted-foreground text-lg">
        Last updated: February 12, 2026
      </p>
      
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">1. Acceptance of Terms</h2>
        <p className="text-muted-foreground">
          By accessing or using the Rentmaikar platform ("Platform"), you agree to be bound by these Terms of Use ("Terms"). 
          These Terms constitute a legally binding agreement between you and Rentmaikar Nigeria Limited, a company registered 
          under the laws of the Federal Republic of Nigeria.
          If you do not agree to these Terms, please do not use our services.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">2. Description of Services</h2>
        <p className="text-muted-foreground">
          Rentmaikar is a vehicle rental marketplace that connects vehicle owners ("Owners") with rideshare drivers ("Drivers") 
          for Uber, Bolt, and similar transportation network companies (TNCs) in Lagos, Abuja, and Port Harcourt.
        </p>
        <p className="text-muted-foreground">
          <strong>Important:</strong> Rentmaikar acts solely as an intermediary platform. We are not a party to rental agreements 
          between Owners and Drivers, nor are we a transportation company, car rental agency, or insurance provider.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">3. User Registration & Eligibility</h2>
        <h3 className="text-xl font-medium">Driver Requirements</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Must be at least 21 years of age</li>
          <li>Must possess a valid Nigerian driver's license</li>
          <li>Must be approved to drive for Uber, Bolt, or similar TNCs</li>
          <li>Must pass identity verification using valid government ID (NIN, Voter's Card, or International Passport)</li>
          <li>Must have a verified Nigerian phone number</li>
          <li>Must provide guarantor information as required</li>
        </ul>
        
        <h3 className="text-xl font-medium mt-4">Owner Requirements</h3>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Must be the legal owner or authorized representative of listed vehicles</li>
          <li>Must provide proof of vehicle registration and ownership documents</li>
          <li>Must maintain comprehensive insurance coverage on all listed vehicles</li>
          <li>Must ensure vehicles meet TNC requirements and FRSC regulations</li>
          <li>Must install Rentmaikar IoT tracking devices on all listed vehicles</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">4. Prohibited Activities</h2>
        <p className="text-muted-foreground font-medium text-destructive">
          The following activities are strictly prohibited and will result in immediate account suspension or permanent ban:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Direct Contact:</strong> Exchanging personal contact information (phone numbers, email, social media) between Owners and Drivers outside the Platform</li>
          <li><strong>Off-Platform Payments:</strong> Making or accepting rental payments outside the Platform's payment system</li>
          <li><strong>Subleasing:</strong> Drivers may not sublease, subrent, or allow third parties to operate rented vehicles</li>
          <li><strong>Price Circumvention:</strong> Attempting to negotiate prices outside the Platform's administrative mediation system</li>
          <li><strong>IoT Tampering:</strong> Disabling, removing, or interfering with IoT tracking devices</li>
          <li><strong>Fraudulent Activity:</strong> Providing false information, fake documents, or misrepresenting identity</li>
          <li><strong>Cross-Border Movement:</strong> Taking vehicles outside approved state boundaries without authorization</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">5. Price Negotiation & Administrative Mediation</h2>
        <p className="text-muted-foreground">
          All price negotiations between Owners and Drivers must occur exclusively through Rentmaikar's administrative mediation system:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Drivers may submit price requests through the Platform</li>
          <li>Rentmaikar administrators review and mediate all negotiations</li>
          <li>Owners may accept, reject, or counter through the Platform</li>
          <li>Final approved rates are locked and binding for the rental period</li>
          <li>Rate modifications require administrative approval</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">6. Payment Terms</h2>
        <p className="text-muted-foreground">
          Rental payments in Nigeria are processed through Paystack in Nigerian Naira (₦):
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Daily or weekly payment frequencies available based on agreement</li>
          <li>Payments are due by 11:59 PM WAT on the scheduled due date</li>
          <li>Late payments incur a 24-hour grace period before penalties apply</li>
          <li>Continued non-payment may result in remote vehicle deactivation via IoT</li>
          <li>Repeated payment defaults may result in account suspension and loss of daily payment privileges</li>
          <li>Bank transfer and card payment options available</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">7. IoT Tracking & Remote Deactivation</h2>
        <p className="text-muted-foreground">
          All vehicles listed on Rentmaikar are required to have IoT tracking devices installed:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Real-time GPS Tracking:</strong> Continuous location monitoring for safety and security</li>
          <li><strong>Accident Detection:</strong> Automatic detection of collisions with instant alerts to Owners and Administrators</li>
          <li><strong>Remote Deactivation:</strong> Vehicles may be remotely disabled in cases of payment default, unauthorized use, theft, or safety concerns</li>
          <li><strong>Telemetry Data:</strong> Speed, battery level, and signal strength are monitored</li>
          <li><strong>Geofencing:</strong> Vehicles are restricted to approved cities and states</li>
        </ul>
        <p className="text-muted-foreground">
          By using the Platform, Drivers consent to continuous vehicle tracking and acknowledge the possibility of remote deactivation.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">8. Weekly Inspection Reports</h2>
        <p className="text-muted-foreground">
          Drivers are required to submit weekly vehicle inspection reports:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Reports are due every Sunday by 11:59 PM WAT</li>
          <li>Reports must include 10 photographs: front view, back view, both sides, all four tyres, dashboard, and interior</li>
          <li>Photos must be timestamped and geotagged</li>
          <li>Failure to submit reports may result in rental suspension</li>
          <li>Owners review reports and may request vehicle withdrawal if damage is identified</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">9. Mandatory Driver Training & Group Insurance</h2>
        <p className="text-muted-foreground">
          All Drivers must complete Rentmaikar's online Driver Training Program before being eligible to operate any vehicle on the Platform:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Prerequisite for Insurance:</strong> Completion of the Driver Training Program is a mandatory precondition for enrollment in Rentmaikar's group insurance coverage. Drivers who have not completed or whose training has lapsed are <strong>not eligible</strong> for group insurance benefits</li>
          <li><strong>Mandatory Completion:</strong> Training must be completed in full before the Driver may begin any rental period</li>
          <li><strong>Compulsory Refresh:</strong> Drivers must complete a training refresh every six (6) months to maintain active status and continued insurance eligibility</li>
          <li><strong>Training Subscription:</strong> An annual training subscription fee of ₦30,000 NGN applies</li>
          <li><strong>Suspension for Non-Compliance:</strong> Failure to complete the initial training or mandatory refresh will result in immediate suspension of driving privileges and group insurance coverage until training is brought current</li>
          <li><strong>Training Records:</strong> All training completions and refresh dates are logged and auditable</li>
        </ul>
        <p className="text-muted-foreground font-medium">
          <strong>Important:</strong> No group insurance claim will be processed for any Driver whose training status is not current at the time of the incident.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">10. Incident Reporting</h2>
        <p className="text-muted-foreground">
          Drivers must report all incidents immediately through the Platform:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Accidents, collisions, or any vehicle damage</li>
          <li>Mechanical breakdowns or maintenance issues</li>
          <li>Theft, vandalism, or attempted theft</li>
          <li>Any interaction with law enforcement (Police, FRSC, LASTMA, VIO) involving the vehicle</li>
        </ul>
        <p className="text-muted-foreground">
          Late reporting (more than 24 hours after incident) is flagged and may affect Driver ratings and future rental eligibility.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">11. Limitation of Liability</h2>
        <p className="text-muted-foreground">
          Rentmaikar Nigeria Limited endeavors to provide a reliable platform. However, Rentmaikar's role is limited to that of an intermediary and facilitator. Users acknowledge that:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>Vehicle condition, maintenance, and safety remain the responsibility of the Owner</li>
          <li>Driving conduct and compliance with traffic laws remain the responsibility of the Driver</li>
          <li>Rentmaikar does not guarantee uninterrupted service availability</li>
          <li>Users are encouraged to resolve concerns through the Platform's mediation and dispute resolution channels</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">12. Mediation & Dispute Resolution</h2>
        <p className="text-muted-foreground">
          Rentmaikar is committed to resolving all disputes amicably through structured mediation:
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li><strong>Step 1 — Internal Mediation:</strong> All disputes between Owners, Drivers, and the Platform must first be submitted to Rentmaikar's administrative mediation team for review and resolution</li>
          <li><strong>Step 2 — Independent Mediation:</strong> If internal mediation does not resolve the matter within 30 days, either party may request independent mediation through a mutually agreed-upon mediator</li>
          <li><strong>Step 3 — Alternative Dispute Resolution (ADR):</strong> As a final step, unresolved disputes may be submitted to alternative dispute resolution in accordance with the laws of the Federal Republic of Nigeria</li>
        </ul>
        <p className="text-muted-foreground">
          Both parties agree to participate in good faith in the mediation process before pursuing any other remedies.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">13. Cooperation & Good Faith</h2>
        <p className="text-muted-foreground">
          All users agree to cooperate in good faith with Rentmaikar's mediation and dispute resolution processes. 
          Users acknowledge that collaborative resolution benefits all parties and helps maintain a trusted platform community.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">14. SMS / Text Message Program</h2>
        <p className="text-muted-foreground">
          By opting in to Rentmaikar SMS communications you agree to receive text messages from
          Rentmaikar about your account, vehicle rentals, applications, reservations, payments,
          customer support and service updates. Promotional text messages require a separate opt-in.
        </p>
        <ul className="list-disc pl-6 text-muted-foreground space-y-2">
          <li>SMS consent is optional and is not a condition of purchasing or using Rentmaikar services.</li>
          <li>Message frequency varies. Message and data rates may apply.</li>
          <li>Reply STOP to opt out of further messages. Reply HELP for help.</li>
          <li>Messages may contain links to your Rentmaikar account, application or rental details.</li>
          <li>You may review or withdraw your consent at any time in your account communication preferences.</li>
          <li>Rentmaikar does not sell, rent or share mobile phone numbers or SMS consent information with third parties or affiliates for their own marketing or promotional purposes.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">15. Contact Information</h2>
        <p className="text-muted-foreground">
          For questions about these Terms of Use:<br />
          Email: {EMAIL_CONFIG.legal}<br />
          Phone: +234 803 555 0123<br />
          Address: Rentmaikar Nigeria Limited, Lagos, Nigeria
        </p>
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Terms of Use — Rentmaikar"
        description="Read the Rentmaikar Terms of Use covering rentals, payments, vehicle listings and platform rules for drivers and owners in the USA and Nigeria."
        path="/terms"
      />
      <Header />
      
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center gap-3 mb-8">
            <FileText className="w-8 h-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-display font-bold">Terms of Use</h1>
          </div>

          <Tabs defaultValue={country === 'Nigeria' ? 'nigeria' : 'usa'} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="usa">🇺🇸 United States</TabsTrigger>
              <TabsTrigger value="nigeria">🇳🇬 Nigeria</TabsTrigger>
            </TabsList>
            
            <TabsContent value="usa">
              <USATerms />
            </TabsContent>
            
            <TabsContent value="nigeria">
              <NigeriaTerms />
            </TabsContent>
          </Tabs>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Terms;
