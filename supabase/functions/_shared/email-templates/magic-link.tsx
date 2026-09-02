/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Heading,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {siteName} login link</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img
            src="https://rentmaikar.com/pwa-icon-192.png"
            width="36"
            height="36"
            alt="Rentmaikar"
            style={logo}
          />
          <Text style={wordmark}>Rentmaikar</Text>
        </Section>
        <Heading style={h1}>Your login link</Heading>
        <Text style={text}>
          Click the button below to securely log in to {siteName} — no password
          needed. This link expires shortly and can only be used once.
        </Text>
        <Section style={ctaSection}>
          <Button style={button} href={confirmationUrl}>
            Log In to Rentmaikar
          </Button>
        </Section>
        <Hr style={hr} />
        <Text style={brandBar}>
          Rentmaikar · Rideshare Vehicle Rentals ·{' '}
          <Link href="https://rentmaikar.com" style={brandLink}>
            rentmaikar.com
          </Link>
        </Text>
        <Text style={footer}>
          If you didn't request this link, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Outfit', 'Inter', -apple-system, Segoe UI, Arial, sans-serif",
}
const container = {
  padding: '0 0 32px',
  maxWidth: '560px',
  border: '1px solid hsl(220, 15%, 88%)',
  borderRadius: '12px',
  overflow: 'hidden' as const,
}
const header = {
  backgroundColor: 'hsl(220, 60%, 20%)',
  padding: '20px 28px',
}
const logo = { display: 'inline-block', verticalAlign: 'middle', margin: '0' }
const wordmark = {
  display: 'inline-block',
  verticalAlign: 'middle',
  margin: '0 0 0 12px',
  fontSize: '20px',
  fontWeight: 'bold' as const,
  color: '#ffffff',
  letterSpacing: '0.2px',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: 'hsl(220, 25%, 10%)',
  margin: '28px 28px 16px',
}
const text = {
  fontSize: '14px',
  color: 'hsl(220, 15%, 45%)',
  lineHeight: '1.6',
  margin: '0 28px 20px',
}
const ctaSection = { margin: '8px 28px 8px' }
const button = {
  backgroundColor: 'hsl(174, 72%, 40%)',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '12px',
  padding: '14px 28px',
  textDecoration: 'none',
}
const hr = {
  borderColor: 'hsl(220, 15%, 88%)',
  margin: '28px 28px 0',
}
const brandBar = {
  fontSize: '12px',
  color: 'hsl(220, 15%, 45%)',
  margin: '16px 28px 0',
}
const brandLink = { color: 'hsl(220, 15%, 45%)', textDecoration: 'underline' }
const footer = {
  fontSize: '12px',
  color: 'hsl(220, 10%, 60%)',
  margin: '8px 28px 0',
}
