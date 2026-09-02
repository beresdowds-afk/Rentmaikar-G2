Onboarding: Authentication → Identity Verification → Marketplace

This document describes RentMaikar's layered onboarding model and how marketplace features are gated on Persona identity verification. The onboarding system shall be deterministic, fault-tolerant, region-aware, and resilient to delayed services, network interruptions, partial failures, and asynchronous events. Under no circumstances shall onboarding failures prevent access to public content or leave users on unresolved pages, infinite loading states, or redirect loops.

Layers

#| Layer| Provider(s)| Purpose
1| Sign-up / Sign-in| Supabase Auth (email+password, Google SSO, Phone OTP)| Establish an authenticated session. Google provides a verified email; Phone OTP provides a verified phone. Authentication must complete successfully before any onboarding routing decisions are evaluated.
2| Account bootstrap| "handle_new_user" trigger| Automatically creates "profiles", "user_roles", and "onboarding_state". OAuth users with "email_verified" skip email verification. Missing or partially created records shall be automatically detected and repaired before onboarding continues.
3| Profile completion| "/onboarding/complete-profile" wizard, "get_profile_completion_status" RPC| Collect mandatory profile information (phone, country, emergency contact). Optional information includes driver's license, vehicle ownership, and payment methods. The system shall distinguish between loading, incomplete, complete, failed, and timeout states.
4| Identity verification (KYC/AML)| Persona ("persona-create-inquiry", "persona-webhook")| Verifies government ID, selfie, and PEP/sanctions using region-aware templates. Verification shall support realtime updates, automatic reconnection, polling fallback, retry mechanisms, and graceful recovery when external services are unavailable.
5| Feature grant| "MarketplaceGate", "SubscriptionGate", "PortalRouteGuard"| Unlock renting, listing, checkout, subscriptions, and portals only after all prerequisite onboarding layers have completed successfully. Feature gates shall never block public landing pages or unauthenticated browsing.

Distinction: Google SSO vs Persona

- Google Sign-In is authentication only. It confirms control of a Google account and verified email address. It does not verify government identity, address, eligibility, or regulatory compliance.
- Persona performs identity verification using government-issued documents, biometric comparison, and compliance screening, returning one of the following canonical decisions: "approved", "declined", "needs_review", "expired", or "pending".

Authentication and identity verification are independent processes. Authentication establishes access to an account, while Persona determines eligibility for protected marketplace features.

Marketplace gating — real-time

"MarketplaceGate" ("src/components/onboarding/MarketplaceGate.tsx") shall evaluate access only after authentication initialization, account bootstrap, profile retrieval, onboarding status, and identity verification state have been successfully resolved.

Marketplace access requires:

1. "get_profile_completion_status().mandatory_complete === true"
2. "get_my_identity_verification().is_verified === true"
   (that is, "profiles.identity_verification_status = 'approved'")

The gate consumes "useIdentityVerification", which subscribes via Supabase Realtime to "persona_inquiries" and "profiles" filtered to the authenticated user.

When "persona-webhook" updates an inquiry to "approved", the client shall invalidate affected queries and re-evaluate access automatically without requiring a manual refresh.

If realtime connectivity is unavailable, disconnected, delayed, or interrupted, the application shall automatically fall back to polling and retry mechanisms until verification status has been resolved or a controlled timeout occurs.

MarketplaceGate shall never evaluate partially loaded, undefined, or inconsistent state and shall never throw exceptions that propagate to the global "ErrorBoundary".

Routing decisions

Condition| Redirect
Not authenticated| Public routes render normally. Protected routes redirect to "/auth".
Account bootstrap incomplete or inconsistent| Automatic bootstrap recovery before routing decisions are made.
Mandatory profile fields missing| "/onboarding/complete-profile?returnTo=<validated-path>"
Identity verification required| "/onboarding/verification-status?returnTo=<validated-path>"
Identity verification approved| Redirect to the validated destination or requested protected route.
Required services unavailable or timeout reached| Controlled recovery page with retry capability instead of indefinite loading.
All requirements satisfied| Marketplace surface renders.

Redirect decisions shall be deterministic, idempotent, and evaluated only once per authentication cycle. Redirect loops, duplicate navigation events, and repeated route evaluations shall be prevented.

Verification status page

"/onboarding/verification-status" ("src/pages/VerificationStatusPage.tsx") presents the user's current Persona verification lifecycle.

Supported states include:

- Submitted — inquiry successfully created.
- Pending review — verification is actively processing ("pending", "needs_review").
- Verified — verification approved and marketplace access granted.
- Action required — verification "declined" or "expired"; identified mismatch fields are displayed and a new verification session may be initiated.
- Service unavailable — external verification service temporarily unavailable.
- Recovery required — verification status cannot currently be resolved and recovery procedures have been initiated.

The page shall automatically return the user to the validated "returnTo" destination once verification succeeds.

Automatic navigation shall occur only once per successful verification event.

The page shall never remain indefinitely in a loading state. Timeout detection, retry controls, manual refresh, polling fallback, and automatic reconnection shall be provided whenever realtime updates are unavailable.

The page shall display the most recent inquiry attempts for the authenticated user.

Data contract

- Table "persona_inquiries" (user-scoped, RLS-protected, "REPLICA IDENTITY FULL")
- Column "profiles.identity_verification_status" (canonical verification decision)
- RPC "public.get_my_identity_verification()" (SECURITY DEFINER, granted to "authenticated") returning "{ is_verified, profile_status, latest_inquiry, timeline }"
- Realtime publication including "persona_inquiries" and "profiles"
- Automatic cache invalidation and synchronized state updates after verification events

Missing, inconsistent, or corrupted onboarding records shall trigger controlled recovery rather than application failure.

Extending the gate

- Wrap new protected marketplace surfaces with "<MarketplaceGate>".
- Surface verification status inside dashboards using "useIdentityVerification()".
- Additional verification requirements (for example address verification or enhanced due diligence) shall be incorporated into Persona templates without requiring changes to marketplace routing logic.
- All future onboarding layers shall follow the same deterministic routing, timeout, retry, recovery, logging, and region-aware rendering policies defined in this document.
- This onboarding architecture shall remain the single source of truth for authentication, onboarding progression, identity verification, marketplace access, deep links, session restoration, and future protected feature expansion.
