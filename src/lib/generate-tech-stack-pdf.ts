import jsPDF from 'jspdf';

interface TechStackSection {
  title: string;
  items: { name: string; purpose: string }[];
}

export const generateTechStackPDF = (): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let yPos = 20;

  // Helper functions
  const addTitle = (text: string) => {
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175); // Primary blue
    doc.text(text, pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;
  };

  const addSubtitle = (text: string) => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(text, pageWidth / 2, yPos, { align: 'center' });
    yPos += 20;
  };

  const addSectionHeader = (text: string) => {
    checkPageBreak(20);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text(text, margin, yPos);
    yPos += 2;
    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, margin + contentWidth, yPos);
    yPos += 10;
  };

  const addTableRow = (col1: string, col2: string, isHeader = false) => {
    checkPageBreak(10);
    const col1Width = 70;
    const col2Width = contentWidth - col1Width;

    if (isHeader) {
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, yPos - 5, contentWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(50, 50, 50);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(70, 70, 70);
    }

    doc.setFontSize(10);
    doc.text(col1, margin + 2, yPos);
    
    const lines = doc.splitTextToSize(col2, col2Width - 4);
    doc.text(lines, margin + col1Width + 2, yPos);
    
    yPos += Math.max(lines.length * 5, 8);
  };

  const addBulletPoint = (text: string) => {
    checkPageBreak(10);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(70, 70, 70);
    doc.text('•', margin + 5, yPos);
    const lines = doc.splitTextToSize(text, contentWidth - 15);
    doc.text(lines, margin + 12, yPos);
    yPos += lines.length * 5 + 3;
  };

  const addParagraph = (text: string) => {
    checkPageBreak(15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(70, 70, 70);
    const lines = doc.splitTextToSize(text, contentWidth);
    doc.text(lines, margin, yPos);
    yPos += lines.length * 5 + 5;
  };

  const checkPageBreak = (neededSpace: number) => {
    if (yPos + neededSpace > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      yPos = 20;
    }
  };

  const addFooter = () => {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${pageCount} | Rentmaikar Technical Documentation`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }
  };

  // Document Content
  addTitle('Rentmaikar');
  addSubtitle('Technical Architecture & Platform Documentation');
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // Executive Summary
  addSectionHeader('Executive Summary');
  addParagraph(
    'Rentmaikar is a specialized vehicle rental platform designed for rideshare services (Uber, Lyft, Bolt) ' +
    'operating across USA and Nigeria hubs. The platform serves as a strict mediator between vehicle owners ' +
    'and drivers, managing transactions, documentation, and safety via remote IoT control systems.'
  );
  yPos += 5;

  // Frontend Stack
  addSectionHeader('Frontend Technology Stack');
  addTableRow('Technology', 'Purpose', true);
  const frontendStack = [
    { name: 'React 18', purpose: 'Core UI framework with concurrent features and automatic batching' },
    { name: 'Vite', purpose: 'Next-generation build tool with instant HMR and optimized production builds' },
    { name: 'TypeScript', purpose: 'Static type checking for enhanced code quality and developer experience' },
    { name: 'Tailwind CSS', purpose: 'Utility-first CSS framework with custom design tokens' },
    { name: 'shadcn/ui', purpose: 'Accessible component library built on Radix UI primitives' },
    { name: 'React Router DOM', purpose: 'Client-side routing with protected route support' },
    { name: 'TanStack Query', purpose: 'Powerful server state management with caching and synchronization' },
    { name: 'Recharts', purpose: 'Data visualization library for analytics dashboards' },
    { name: 'Leaflet + React-Leaflet', purpose: 'Interactive mapping for vehicle tracking and location services' },
    { name: 'Lucide React', purpose: 'Comprehensive icon library for consistent UI elements' },
  ];
  frontendStack.forEach(item => addTableRow(item.name, item.purpose));
  yPos += 10;

  // Backend Stack
  addSectionHeader('Backend Infrastructure (Lovable Cloud)');
  addTableRow('Technology', 'Purpose', true);
  const backendStack = [
    { name: 'PostgreSQL', purpose: 'Primary relational database with advanced features' },
    { name: 'Supabase Auth', purpose: 'Complete authentication system with JWT tokens and role management' },
    { name: 'Edge Functions (Deno)', purpose: 'Serverless TypeScript functions for backend logic' },
    { name: 'Row-Level Security', purpose: 'Database-level access control policies per user role' },
    { name: 'Supabase Storage', purpose: 'Secure file storage for photos and documents' },
    { name: 'pg_cron', purpose: 'Scheduled tasks for payment processing and notifications' },
    { name: 'Realtime', purpose: 'WebSocket-based live updates for tracking and notifications' },
  ];
  backendStack.forEach(item => addTableRow(item.name, item.purpose));
  yPos += 10;

  // External APIs
  addSectionHeader('External API Integrations');
  addTableRow('Service', 'Purpose', true);
  const apiIntegrations = [
    { name: 'Twilio', purpose: 'SMS and WhatsApp messaging for notifications and verification' },
    { name: 'Resend', purpose: 'Transactional email delivery for agreements and receipts' },
    { name: 'PayPal', purpose: 'Payment gateway for USA region transactions' },
    { name: 'Paystack', purpose: 'Payment gateway for Nigeria region transactions' },
    { name: 'MQTT Protocol', purpose: 'Real-time IoT telemetry for vehicle tracking and accident detection' },
    { name: 'jsPDF', purpose: 'Client-side PDF generation for reports and agreements' },
  ];
  apiIntegrations.forEach(item => addTableRow(item.name, item.purpose));
  yPos += 10;

  // User Roles
  addSectionHeader('Role-Based Access Control');
  addParagraph('The platform implements a strict role-based security model with three distinct user types:');
  addBulletPoint('Admin: Full platform access, user management, pricing control, dispute resolution');
  addBulletPoint('Owner: Vehicle registration, driver monitoring, weekly reports review, earnings tracking');
  addBulletPoint('Driver: Vehicle rental, payment management, incident reporting, weekly inspections');
  yPos += 5;

  // Regional Operations
  addSectionHeader('Regional Operations');
  addParagraph('Rentmaikar operates in two distinct markets with region-specific configurations:');
  
  addTableRow('Parameter', 'USA | Nigeria', true);
  addTableRow('Currency', 'USD | NGN');
  addTableRow('Payment Gateway', 'PayPal | Paystack');
  addTableRow('Bank Transfers', 'Supported | Supported');
  addTableRow('Police Report Required', 'No | Yes (for incidents)');
  addTableRow('Hub Locations', 'Multiple cities | Lagos, Abuja, Port Harcourt, Ibadan');
  yPos += 10;

  // Fee Structure
  addSectionHeader('Revenue & Fee Structure');
  addParagraph('The platform operates on a 40% total fee model split between drivers and owners:');
  addBulletPoint('Driver Payment: Base rental + 20% admin fee');
  addBulletPoint('Owner Payout: Base rental - 20% management fee');
  addBulletPoint('Payout Schedule: Weekly on Fridays');
  addBulletPoint('Currency Separation: Strict USD/NGN isolation per region');
  yPos += 5;

  // Security Features
  addSectionHeader('Security Implementation');
  addParagraph('Comprehensive security measures are implemented across all layers:');
  
  addTableRow('Feature', 'Implementation', true);
  const securityFeatures = [
    { name: 'Authentication', purpose: 'JWT-based with email verification and password strength enforcement' },
    { name: 'Authorization', purpose: 'RESTRICTIVE RLS policies with role-based access control' },
    { name: 'Input Validation', purpose: 'Zod schema validation on all edge functions' },
    { name: 'Code Hashing', purpose: 'bcrypt hashing for phone verification codes (5-min expiry)' },
    { name: 'XSS Prevention', purpose: 'HTML escaping on all user-generated content' },
    { name: 'SQL Injection', purpose: 'Parameterized queries via Supabase SDK' },
  ];
  securityFeatures.forEach(item => addTableRow(item.name, item.purpose));
  yPos += 10;

  // Platform Rules
  addSectionHeader('Platform Business Rules');
  addBulletPoint('IoT Device Requirement: All vehicles must have active IoT tracking devices installed');
  addBulletPoint('Weekly Inspections: Mandatory photo submissions due every Sunday with 24-hour grace period');
  addBulletPoint('Payment Defaults: Automated escalation with lockdown periods (24h weekly / 6h daily plans)');
  addBulletPoint('Incident Reporting: Late reports (>1 hour) flagged automatically; IoT-detected accidents prioritized');
  addBulletPoint('Price Negotiations: Driver/owner requests require admin approval with lock mechanism');
  addBulletPoint('Legal Agreements: Triple-signature requirement (driver, owner, admin witness)');
  yPos += 5;

  // Database Schema Overview
  addSectionHeader('Core Database Tables');
  addTableRow('Table', 'Purpose', true);
  const dbTables = [
    { name: 'profiles', purpose: 'User profile information and notification preferences' },
    { name: 'user_roles', purpose: 'Role assignments (admin, owner, driver)' },
    { name: 'vehicles', purpose: 'Vehicle registry with ownership and status tracking' },
    { name: 'price_negotiations', purpose: 'Rental rate negotiations with approval workflow' },
    { name: 'payment_defaults', purpose: 'Overdue payment tracking with escalation status' },
    { name: 'vehicle_incidents', purpose: 'Accident and damage reports with IoT integration' },
    { name: 'weekly_inspection_reports', purpose: 'Vehicle condition documentation with photos' },
    { name: 'legal_agreements', purpose: 'Rental contracts with digital signatures' },
    { name: 'iot_devices', purpose: 'Device registry with telemetry and health status' },
    { name: 'vehicle_recalls', purpose: 'Vehicle recall management for IoT failures' },
  ];
  dbTables.forEach(item => addTableRow(item.name, item.purpose));
  yPos += 10;

  // Edge Functions
  addSectionHeader('Serverless Edge Functions');
  addTableRow('Function', 'Purpose', true);
  const edgeFunctions = [
    { name: 'verify-phone', purpose: 'Phone number verification with hashed OTP codes' },
    { name: 'send-sms-notification', purpose: 'Twilio SMS/WhatsApp messaging service' },
    { name: 'send-agreement-email', purpose: 'Legal document delivery via Resend' },
    { name: 'iot-accident-detection', purpose: 'Process IoT telemetry for crash detection' },
    { name: 'process-payment-defaults', purpose: 'Automated payment default escalation' },
    { name: 'generate-inspection-pdf', purpose: 'Weekly inspection report PDF generation' },
    { name: 'send-incident-notification', purpose: 'Incident alert distribution to stakeholders' },
  ];
  edgeFunctions.forEach(item => addTableRow(item.name, item.purpose));
  yPos += 10;

  // Version Info
  addSectionHeader('Version Information');
  addTableRow('Component', 'Version', true);
  addTableRow('React', '18.3.1');
  addTableRow('TypeScript', '5.x');
  addTableRow('Vite', '5.x');
  addTableRow('Tailwind CSS', '3.x');
  addTableRow('Supabase JS SDK', '2.90.1');
  addTableRow('TanStack Query', '5.83.0');

  // Add footer to all pages
  addFooter();

  // Save the PDF
  doc.save('Rentmaikar-Tech-Stack-Documentation.pdf');
};
