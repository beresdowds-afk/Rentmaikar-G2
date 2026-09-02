import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  driverName?: string
  vehicleName?: string
  startDate?: string
  endDate?: string
  rate?: string
  bookingReference?: string
  dashboardUrl?: string
}

const NAVY = '#0A1628'
const TEAL = '#10B981'
const SLATE = '#475569'
const BORDER = '#E2E8F0'
const CARD_BG = '#F8FAFC'

const Email = ({
  driverName,
  vehicleName,
  startDate,
  endDate,
  rate,
  bookingReference,
  dashboardUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {`Your Rentmaikar booking is confirmed${vehicleName ? ` — ${vehicleName}` : ''}`}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerBand}>
          <Text style={wordmark}>
            RENTMAIKAR<span style={{ color: TEAL }}>.</span>
          </Text>
        </Section>

        <Section style={content}>
          <Heading as="h1" style={heading}>
            Booking confirmed
          </Heading>
          <Text style={paragraph}>
            {driverName ? `Hi ${driverName},` : 'Hi there,'} great news — your booking
            request has been accepted{vehicleName ? ` for ${vehicleName}` : ''}. Here are
            your rental details:
          </Text>

          <Section style={detailsCard}>
            {vehicleName && (
              <Row style={detailRow}>
                <Column style={detailLabel}>Vehicle</Column>
                <Column style={detailValue}>{vehicleName}</Column>
              </Row>
            )}
            {startDate && (
              <Row style={detailRow}>
                <Column style={detailLabel}>Rental starts</Column>
                <Column style={detailValue}>{startDate}</Column>
              </Row>
            )}
            {endDate && (
              <Row style={detailRow}>
                <Column style={detailLabel}>Rental ends</Column>
                <Column style={detailValue}>{endDate}</Column>
              </Row>
            )}
            {rate && (
              <Row style={detailRow}>
                <Column style={detailLabel}>Agreed rate</Column>
                <Column style={detailValue}>{rate}</Column>
              </Row>
            )}
            {bookingReference && (
              <Row style={{ ...detailRow, borderBottom: 'none' }}>
                <Column style={detailLabel}>Reference</Column>
                <Column style={detailValue}>#{bookingReference}</Column>
              </Row>
            )}
          </Section>

          {dashboardUrl && (
            <Section style={{ textAlign: 'center', margin: '28px 0 8px' }}>
              <Button href={dashboardUrl} style={ctaButton}>
                View booking in your dashboard
              </Button>
            </Section>
          )}

          <Text style={paragraph}>
            Pickup location details become available in your dashboard once your referee
            verification is complete. If anything looks wrong, reply to this email or
            contact support from your dashboard.
          </Text>

          <Hr style={hr} />
          <Text style={footer}>
            Rentmaikar — rideshare vehicle rentals, managed end-to-end.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Props) =>
    `Booking confirmed${data?.vehicleName ? ` — ${data.vehicleName}` : ''} | Rentmaikar`,
  displayName: 'Booking confirmation',
  previewData: {
    driverName: 'Adaeze',
    vehicleName: '2021 Toyota Corolla',
    startDate: 'Monday, August 24, 2026',
    endDate: 'Wednesday, September 23, 2026',
    rate: '₦85,000 / week',
    bookingReference: 'A1B2C3D4',
    dashboardUrl: 'https://rentmaikar.com/driver/dashboard',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Inter', Arial, Helvetica, sans-serif",
}

const container = {
  margin: '0 auto',
  maxWidth: '560px',
  border: `1px solid ${BORDER}`,
  borderRadius: '12px',
  overflow: 'hidden',
}

const headerBand = {
  backgroundColor: NAVY,
  padding: '20px 28px',
}

const wordmark = {
  color: '#ffffff',
  fontSize: '18px',
  fontWeight: 700 as const,
  letterSpacing: '0.08em',
  margin: 0,
}

const content = { padding: '28px' }

const heading = {
  color: NAVY,
  fontSize: '22px',
  fontWeight: 700 as const,
  margin: '0 0 12px',
}

const paragraph = {
  color: SLATE,
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 16px',
}

const detailsCard = {
  backgroundColor: CARD_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: '10px',
  padding: '8px 16px',
  margin: '0 0 8px',
}

const detailRow = {
  borderBottom: `1px solid ${BORDER}`,
  padding: '10px 0',
}

const detailLabel = {
  color: SLATE,
  fontSize: '13px',
  width: '40%',
}

const detailValue = {
  color: NAVY,
  fontSize: '13px',
  fontWeight: 600 as const,
  textAlign: 'right' as const,
}

const ctaButton = {
  backgroundColor: TEAL,
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 600 as const,
  padding: '12px 28px',
  textDecoration: 'none',
}

const hr = { borderColor: BORDER, margin: '24px 0 16px' }

const footer = {
  color: '#94A3B8',
  fontSize: '12px',
  lineHeight: '18px',
  margin: 0,
}
