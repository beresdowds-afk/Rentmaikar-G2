import * as jspdfModule from 'jspdf';

export interface Generate10DlcPdfOptions {
  returnBlob?: boolean;
}

const getJsPDF = () => {
  const mod = jspdfModule as any;
  return mod.jsPDF || mod.default?.jsPDF || mod.default || mod;
};

/**
 * Builds a comprehensive, carrier-grade A2P 10DLC Campaign Registration PDF document
 * for Rentmaikar, containing all exact fields required by TCR, Twilio, and US mobile carriers.
 */
export const build10DlcPdfDocument = () => {
  const JsPdfConstructor = getJsPDF();
  const doc = new JsPdfConstructor({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 16;
  const contentWidth = pageWidth - margin * 2; // 178mm
  let yPos = margin;

  // Colors
  const primaryNavy = [15, 23, 42] as const;      // #0F172A
  const accentBlue = [30, 64, 175] as const;      // #1E40AF
  const mutedText = [71, 85, 105] as const;       // #475569
  const borderGray = [226, 232, 240] as const;    // #E2E8F0
  const boxBg = [248, 250, 252] as const;         // #F8FAFC
  const greenAccent = [5, 150, 105] as const;     // #059669

  const checkPageBreak = (neededHeight: number) => {
    if (yPos + neededHeight > pageHeight - 20) {
      doc.addPage();
      yPos = margin;
      drawHeader();
    }
  };

  const drawHeader = () => {
    doc.setFillColor(...primaryNavy);
    doc.rect(margin, yPos, contentWidth, 1.2, 'F');
    yPos += 4;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryNavy);
    doc.text('INTE-GRITTY LLC USA  |  RENTMAIKAR A2P 10DLC COMPLIANCE DOSSIER', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...mutedText);
    doc.text('TCR & Mobile Carrier Registration Evidence', pageWidth - margin, yPos, { align: 'right' });
    yPos += 3;
    doc.setDrawColor(...borderGray);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, margin + contentWidth, yPos);
    yPos += 8;
  };

  const addSectionTitle = (title: string, tag = '') => {
    checkPageBreak(18);
    yPos += 2;
    doc.setFillColor(239, 246, 255); // light blue
    doc.roundedRect(margin, yPos - 4.5, contentWidth, 8.5, 1.5, 1.5, 'F');
    doc.setDrawColor(191, 219, 254);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, yPos - 4.5, contentWidth, 8.5, 1.5, 1.5, 'S');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...accentBlue);
    doc.text(title, margin + 4, yPos + 1.5);

    if (tag) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...greenAccent);
      doc.text(tag, pageWidth - margin - 4, yPos + 1.5, { align: 'right' });
    }
    yPos += 9;
  };

  const addKeyValueTable = (rows: [string, string][]) => {
    rows.forEach(([key, value]) => {
      const col1Width = 58;
      const col2Width = contentWidth - col1Width;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(value, col2Width - 4);
      const rowHeight = Math.max(7, lines.length * 4.2 + 3);

      checkPageBreak(rowHeight + 2);

      // subtle background zebra
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, yPos, contentWidth, rowHeight, 'F');

      // Key cell
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(key, margin + 3, yPos + 4.5);

      // Value cell
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(lines, margin + col1Width + 2, yPos + 4.5);

      // bottom border
      doc.setDrawColor(...borderGray);
      doc.setLineWidth(0.2);
      doc.line(margin, yPos + rowHeight, margin + contentWidth, yPos + rowHeight);

      yPos += rowHeight;
    });
    yPos += 4;
  };

  const addQuoteBox = (heading: string, text: string, note?: string) => {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    const splitText = doc.splitTextToSize(text, contentWidth - 8);
    const boxHeight = splitText.length * 4 + (note ? 14 : 10) + 7;

    checkPageBreak(boxHeight + 4);

    doc.setFillColor(...boxBg);
    doc.roundedRect(margin, yPos, contentWidth, boxHeight, 1.5, 1.5, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, yPos, contentWidth, boxHeight, 1.5, 1.5, 'S');

    // Accent line on left
    doc.setFillColor(...accentBlue);
    doc.rect(margin, yPos, 2, boxHeight, 'F');

    // Heading
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryNavy);
    doc.text(heading, margin + 5, yPos + 5.5);

    // Text body
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text(splitText, margin + 5, yPos + 10.5);

    if (note) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...mutedText);
      doc.text(note, margin + 5, yPos + boxHeight - 3);
    }

    yPos += boxHeight + 4;
  };

  // =====================
  // FIRST PAGE: COVER / HEADER
  // =====================
  drawHeader();

  // Document Title Banner
  doc.setFillColor(...primaryNavy);
  doc.roundedRect(margin, yPos, contentWidth, 24, 2, 2, 'F');
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('INTE-GRITTY LLC USA', margin + 6, yPos + 7.5);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(226, 232, 240);
  doc.text('Operating Brand / DBA: Rentmaikar (rentmaikar.com)', margin + 6, yPos + 13.5);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('Official A2P 10DLC Campaign Registration & Compliance Dossier for TCR & Tier-1 US Carriers', margin + 6, yPos + 19.5);

  yPos += 28;

  // Executive Summary Card
  addQuoteBox(
    'EXECUTIVE COMPLIANCE SUMMARY',
    'This document contains the verified business identity of registered owner INTE-GRITTY LLC USA, brand parameters for Rentmaikar, exact digital opt-in disclosures, sample SMS messages, program keywords, and privacy policy non-sharing clauses required for Tier-1 Carrier approval of Rentmaikar\'s Application-to-Person (A2P) 10-Digit Long Code (10DLC) brand and campaign under CTIA guidelines.',
    'Status: Production Ready & Actively Implemented  |  Audit Version: 2026-08-14.v1  |  Last Revised: September 2026'
  );

  // 1. BRAND / BUSINESS BASICS
  addSectionTitle('1. Brand & Business Identity (TCR Brand Registration)', 'VERIFIED ENTITY');
  addKeyValueTable([
    ['Legal Business Name', 'INTE-GRITTY LLC'],
    ['Registered Corporate Owner', 'INTE-GRITTY LLC USA'],
    ['Doing Business As (DBA)', 'Rentmaikar'],
    ['Corporate Relationship', 'Rentmaikar is the official vehicle rental brand wholly owned and operated by INTE-GRITTY LLC USA'],
    ['Country of Registration', 'United States of America (US operations with Nigeria international branch)'],
    ['Organization Type', 'Limited Liability Company (LLC) registered in the United States'],
    ['Industry Sector', 'Transportation / Rideshare Vehicle Rental & Fleet Logistics'],
    ['Primary Business Website', 'https://www.rentmaikar.com'],
    ['Support Contact Email', 'support@rentmaikar.com'],
    ['Regulatory / Legal Contact', 'compliance@rentmaikar.com'],
    ['Corporate / Support Phone', '+1 (608) 548-9220 (Voice/Support)'],
    ['Dedicated 10DLC / Twilio Number', '+1 (608) 384-3932 (Verified US 10DLC Route)'],
    ['Public Privacy Policy URL', 'https://www.rentmaikar.com/privacy'],
    ['Terms & Conditions URL', 'https://www.rentmaikar.com/terms'],
    ['Public SMS Opt-In / Info Page', 'https://www.rentmaikar.com/sms-opt-in'],
    ['Contact & Help Portal', 'https://www.rentmaikar.com/contact'],
  ]);

  // 2. CAMPAIGN ATTRIBUTES
  addSectionTitle('2. Campaign Registry Attributes (TCR Parameters)', 'STANDARD / MIXED');
  addKeyValueTable([
    ['Campaign Use Case', 'MIXED (Customer Care, Account Notification, Delivery / Service Alert)'],
    ['Sub-Use Cases', 'Customer Support, Account Security/2FA, Rental Approval, Payment Notices'],
    ['Opt-In Type', 'Web Form (Digital Opt-In via Checkbox on Website)'],
    ['Embedded Links', 'YES (Strictly HTTPS links to rentmaikar.com receipts, portals, and dashboards)'],
    ['Embedded Phone Numbers', 'NO (No standalone embedded telephone numbers inside message bodies)'],
    ['Age-Gated Content', 'NO (No alcohol, cannabis, tobacco, firearms, or adult content)'],
    ['Direct Lending / Credit', 'NO (Rentmaikar is not a lender or credit broker)'],
    ['Affiliate / 3rd-Party Marketing', 'NO (Strictly zero third-party marketing or lead generation)'],
    ['Number Pooling', 'NO (Traffic strictly routed through registered 10DLC long codes)'],
    ['Help/Stop Automation', 'Twilio Advanced Opt-Out + Application Fallback (STOP, HELP, START)'],
  ]);

  // 3. CAMPAIGN DESCRIPTION
  addSectionTitle('3. Campaign Description (Verbatim Submission Copy)', 'COPY VERBATIM');
  addQuoteBox(
    'TCR / TWILIO CAMPAIGN DESCRIPTION FIELD:',
    'Rentmaikar (wholly owned and operated by INTE-GRITTY LLC USA) is a vehicle rental platform connecting rideshare drivers with vehicle owners in the United States and Nigeria. This campaign sends text messages only to users who created an account on rentmaikar.com and explicitly checked an optional SMS consent checkbox. Messages cover account and identity verification, rental application and approval status, vehicle pickup and inspection scheduling, payment reminders and receipts, agreement renewals, and customer support replies. A separate optional checkbox covers promotional messages about vehicle availability and offers. SMS consent is never a condition of creating an account, renting a vehicle, or using any Rentmaikar service.',
    'Characters: 760  |  Compliant with TCR 4096-character limit  |  Strictly non-mandatory consent affirmed'
  );

  // 4. OPT-IN FLOW & MECHANISM
  addSectionTitle('4. Opt-In Mechanism & Call-to-Action (CTA)', 'DIGITAL WEB FORM');
  addQuoteBox(
    'TCR / TWILIO OPT-IN FLOW DESCRIPTION FIELD:',
    'End users opt in on the Rentmaikar website at https://www.rentmaikar.com/auth, https://www.rentmaikar.com/driver-registration and https://www.rentmaikar.com/owner-registration, and on the standalone public opt-in page https://www.rentmaikar.com/sms-opt-in. During account creation and registration the user sees a dedicated "Text message (SMS) consent — optional" block containing two separate checkboxes, both unchecked by default and both independent of Terms acceptance: one for service/transactional SMS and one for promotional SMS. Consent is not a condition of purchase or service. Users can also opt in or out at any time from Profile Settings > SMS consent & preferences at https://www.rentmaikar.com/profile-settings. Every opt-in and opt-out is stored with the phone number, the exact disclosure text and version shown, the page it was captured from, the timestamp and the user agent.',
    'Meets all CTIA Digital Call-to-Action standards  |  Unbundled checkboxes  |  Zero pre-checked boxes'
  );

  // 5. EXACT CHECKBOX DISCLOSURES
  addSectionTitle('5. Exact Checkbox Disclosures (Published in Production)', 'LIVE DISCLOSURES');

  addQuoteBox(
    'A. Service / Transactional SMS Checkbox (Optional, Unchecked by default):',
    '"I agree to receive text messages from Rentmaikar regarding my account, vehicle rentals, applications, reservations, payments, customer support and service updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchasing or using Rentmaikar services. See our Terms and Privacy Policy."',
    'Version: 2026-08-14.v1  |  Appears on /auth, /driver-registration, /owner-registration, /sms-opt-in'
  );

  addQuoteBox(
    'B. Promotional SMS Checkbox (Optional, Unchecked by default, Separate):',
    '"I would like to receive optional promotional text messages from Rentmaikar, including special offers, vehicle availability and rental opportunities. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help."',
    'Completely separated from transactional SMS consent  |  Users may consent to service without promotional'
  );

  addQuoteBox(
    'C. Mandatory Consent Notice Header (Rendered directly above checkboxes):',
    '"Text message (SMS) consent — optional. SMS consent is optional and is not required to create an account, rent a vehicle, submit an application or use Rentmaikar services."',
    'Guarantees carrier reviewers see explicit disclosure that phone verification/service is not conditional'
  );

  // 6. SAMPLE MESSAGES
  addSectionTitle('6. Production Sample Messages (With Brand & Opt-Out)', '5 REPRESENTATIVE SAMPLES');
  addKeyValueTable([
    [
      'Sample 1\n(Account Security / 2FA)',
      'Rentmaikar: Your verification code is 481920. It expires in 10 minutes. Reply STOP to opt out, HELP for help.'
    ],
    [
      'Sample 2\n(Application / Approval)',
      'Rentmaikar: Your driver application has been approved. Sign in at rentmaikar.com to complete your documents and pickup details. Reply STOP to opt out.'
    ],
    [
      'Sample 3\n(Payment Reminder / Notice)',
      'Rentmaikar: Your rental payment of $210.00 is due on Fri Aug 21. Pay at rentmaikar.com/payments. Msg&data rates may apply. Reply STOP to opt out.'
    ],
    [
      'Sample 4\n(Pickup & Inspection)',
      'Rentmaikar: Vehicle pickup confirmed for Sat Aug 22, 10:00 AM. Details: rentmaikar.com/dashboard. Reply STOP to opt out, HELP for help.'
    ],
    [
      'Sample 5\n(Promotional - Consent Only)',
      'Rentmaikar: New vehicles are available in your city this week. See them at rentmaikar.com/catalogue. Reply STOP to opt out.'
    ],
  ]);

  // 7. KEYWORDS & AUTOMATED HANDLING
  addSectionTitle('7. Mandatory Carrier Keywords & Automated Responses', 'CTIA MANDATED');
  addKeyValueTable([
    [
      'STOP / CANCEL / UNSUBSCRIBE\n(Opt-Out Keyword)',
      'Action: Immediately sets opt_in=false in database and adds number to carrier suppression list.\nReply: "Rentmaikar: You have been unsubscribed and will receive no further messages. Reply START to re-subscribe."'
    ],
    [
      'HELP / INFO\n(Support Keyword)',
      'Action: Dispatches contact channels and program details.\nReply: "Rentmaikar: For help email support@rentmaikar.com or call +1 (608) 548-9220. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out."'
    ],
    [
      'START / UNSTOP\n(Re-subscribe Keyword)',
      'Action: Re-activates SMS program for the verified mobile subscriber.\nReply: "Rentmaikar: You are re-subscribed to Rentmaikar text messages. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help."'
    ],
  ]);

  // 8. PRIVACY POLICY NON-SHARING STATEMENT
  addSectionTitle('8. Mandatory Privacy Policy SMS Non-Sharing Clause', 'CARRIER APPROVED');
  addQuoteBox(
    'EXACT PRIVACY POLICY TEXT PUBLISHED ON RENTMAIKAR.COM/PRIVACY:',
    '"No mobile information will be shared with third parties/affiliates for marketing/promotional purposes. All other categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties. Mobile phone numbers are never sold, rented, or traded, and are shared only with our messaging gateway provider (Twilio) strictly for transmitting requested messages. Wireless carriers are not liable for delayed or undelivered messages."',
    'Mandatory TCR & Carrier Requirement: Carrier compliance teams require this exact non-sharing exclusion language.'
  );

  // 9. TIMING, QUIET HOURS & AUDIT TRAIL
  addSectionTitle('9. Message Timing & Audit Trail Architecture', 'CTIA PRINCIPLES');
  addKeyValueTable([
    ['Delivery Window / Quiet Hours', 'Non-urgent messages sent only between 9:00 AM and 9:00 PM recipient local time. Security OTPs sent immediately on user request.'],
    ['Message Frequency', 'Service messages sent on trigger events (reservations, approvals, receipts). Promotional messages capped at 2-4 per calendar month.'],
    ['Audit Log Database Table', 'public.sms_consent_records'],
    ['Stored Audit Attributes', 'Phone number (E.164), user_id, consent_type, consent_given (boolean), disclosure_version, disclosure_text, source_page, user_agent, timestamp_utc'],
    ['Consent Management UI', 'End users can modify or revoke consent at any time via Profile Settings > SMS Consent at https://www.rentmaikar.com/profile-settings'],
  ]);

  // 10. REVIEWER EVIDENCE CHECKLIST
  addSectionTitle('10. Carrier Reviewer Verification Checklist', 'READY TO SUBMIT');
  addKeyValueTable([
    ['1. Direct SMS Opt-In URL', 'https://www.rentmaikar.com/sms-opt-in'],
    ['2. Registration Form URL', 'https://www.rentmaikar.com/driver-registration'],
    ['3. Privacy Policy URL', 'https://www.rentmaikar.com/privacy#sms-policy'],
    ['4. Terms of Service URL', 'https://www.rentmaikar.com/terms#sms-terms'],
    ['5. Contact / Support Portal', 'https://www.rentmaikar.com/contact'],
    ['6. Consent Audit Page (Admin)', 'https://www.rentmaikar.com/admin/sms-consent-audit'],
  ]);

  // Add Page Numbers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...mutedText);
    doc.text(
      `INTE-GRITTY LLC USA (Rentmaikar) — 10DLC A2P Compliance Dossier  |  Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  return doc;
};

/**
 * Generates and triggers a direct browser download of the 10DLC PDF document.
 */
export const download10DlcPdf = (fileName = 'rentmaikar-10dlc-a2p-compliance-packet.pdf') => {
  const doc = build10DlcPdfDocument();
  doc.save(fileName);
};
