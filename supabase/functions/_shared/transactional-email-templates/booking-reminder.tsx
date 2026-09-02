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
  hoursUntilStart?: number
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
  hoursUntilStart,
  bookingReference,
  dashboardUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {`Reminder: your Rentmaikar rental starts ${startDate ?? 'soon'}`}
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
            Your rental starts soon
          </Heading>
          <Text style={paragraph}>
            {driverName ? `Hi ${driverName},` : 'Hi there,'} this is a friendly reminder
            that your rental{vehicleName ? ` of ${vehicleName}` : ''} begins{' '}
            {startDate ? <strong style={{ color: NAVY }}>{startDate}</strong> : 'within the next 24 hours'}
            {typeof hoursUntilStart === 'number' && hoursUntilStart > 0
              ? ` (about ${hoursUntilStart} hour${hoursUntilStart === 1 ? '' : 's'} from now)`
              : ''}
            .
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
                <Column style={detailLabel}>Start date</Column>
                <Column style={detailValue}>{startDate}</Column>
              </Row>
            )}
            {bookingReference && (
              <Row style={{ ...detailRow, borderBottom: 'none' }}>
                <Column style={detailLabel}>Reference</Column>
                <Column style={detailValue}>#{bookingReference}</Column>
              </Row>
            )}
          </Section>

          <Text style={paragraph}>
            Before pickup, please make sure:
          </Text>
          <Text style={listItem}>• Your referee verification is complete (this unlocks the pickup location).</Text>
          <Text style={listItem}>• Your payment method is active to avoid an interruption.</Text>
          <Text style={listItem}>• You have your driver's license with you at pickup.</Text>

          {dashboardUrl && (
            <Section style={{ textAlign: 'center', margin: '28px 0 8px' }}>
              <Button href={dashboardUrl} style={ctaButton}>
                Open your dashboard
              </Button>
            </Section>
          )}

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
    `Reminder: your rental starts ${data?.startDate ?? 'within 24 hours'} | Rentmaikar`,
  displayName: 'Booking start reminder',
  previewData: {
    driverName: 'Adaeze',
    vehicleName: '2021 Toyota Corolla',
    startDate: 'Monday, August 24, 2026',
    hoursUntilStart: 18,
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

const listItem = {
  color: SLATE,
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 6px',
}

const detailsCard = {
  backgroundColor: CARD_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: '10px',
  padding: '8px 16px',
  margin: '0 0 16px',
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
