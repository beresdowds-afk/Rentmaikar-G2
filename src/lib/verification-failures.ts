/**
 * Verification & authentication failure taxonomy.
 *
 * Maps raw provider/SDK/database errors (Persona, Google OAuth, Supabase,
 * browser/device) onto a stable catalogue of failure codes with:
 *  - a plain-language, actionable message for the user
 *  - a retryable / terminal classification
 *  - the recovery action the UI should offer
 *
 * Never surface "Verification failed" — always resolve through this module.
 */

export type FailureDomain =
  | 'persona_user_info'
  | 'persona_document'
  | 'persona_selfie'
  | 'persona_device'
  | 'persona_compliance'
  | 'persona_api'
  | 'persona_backend'
  | 'persona_flow'
  | 'google_account'
  | 'google_oauth_config'
  | 'google_supabase'
  | 'account_conflict'
  | 'browser'
  | 'network'
  | 'session'
  | 'database'
  | 'app'
  | 'config'
  | 'onboarding_blocker'
  | 'unknown';

/** What the user (or the app) should do next. */
export type RecoveryAction =
  | 'retry'
  | 'retry_later'
  | 'restart_verification'
  | 'reupload_document'
  | 'retake_selfie'
  | 'fix_profile_details'
  | 'grant_camera_permission'
  | 'switch_device'
  | 'enable_cookies'
  | 'allow_popups'
  | 'disable_vpn'
  | 'sign_in_again'
  | 'link_account'
  | 'use_password_login'
  | 'complete_onboarding_step'
  | 'contact_support'
  | 'wait_for_review'
  | 'none';

export interface FailureDefinition {
  code: string;
  domain: FailureDomain;
  /** Transient failures may be auto-retried with backoff. */
  retryable: boolean;
  /** Short headline. */
  title: string;
  /** Plain language explanation of what happened. */
  message: string;
  /** Exactly what the user should do next. */
  nextStep: string;
  action: RecoveryAction;
  /** True when the platform (not the user) must resolve it. */
  requiresSupport?: boolean;
  /** Blocks activation until resolved. */
  blocksActivation?: boolean;
}

const D = (d: FailureDefinition) => d;

/** The catalogue. Keys are stable codes safe to persist in logs. */
export const FAILURE_CATALOGUE: Record<string, FailureDefinition> = {
  /* ---------------- Persona: user information ---------------- */
  name_mismatch: D({ code: 'name_mismatch', domain: 'persona_user_info', retryable: false, title: 'Name doesn’t match your ID', message: 'The legal name on your profile is different from the name printed on the document you submitted.', nextStep: 'Update your profile to match your government ID exactly, then start verification again.', action: 'fix_profile_details', blocksActivation: true }),
  dob_mismatch: D({ code: 'dob_mismatch', domain: 'persona_user_info', retryable: false, title: 'Date of birth doesn’t match', message: 'The date of birth we hold doesn’t match your government ID.', nextStep: 'Correct your date of birth in profile settings and retry verification.', action: 'fix_profile_details', blocksActivation: true }),
  address_mismatch: D({ code: 'address_mismatch', domain: 'persona_user_info', retryable: false, title: 'Address doesn’t match', message: 'Your registered address doesn’t match the address on your document.', nextStep: 'Update your address, or submit a document showing your current address.', action: 'fix_profile_details' }),
  phone_mismatch: D({ code: 'phone_mismatch', domain: 'persona_user_info', retryable: false, title: 'Phone number doesn’t match', message: 'The phone number on your account differs from the one used during verification.', nextStep: 'Update and re-verify your phone number, then retry.', action: 'fix_profile_details' }),
  email_mismatch: D({ code: 'email_mismatch', domain: 'persona_user_info', retryable: false, title: 'Email doesn’t match', message: 'The email used for verification differs from your account email.', nextStep: 'Verify using your account email address.', action: 'fix_profile_details' }),
  nationality_mismatch: D({ code: 'nationality_mismatch', domain: 'persona_user_info', retryable: false, title: 'Nationality doesn’t match', message: 'The nationality on your document doesn’t match your profile.', nextStep: 'Correct your nationality in profile settings and retry.', action: 'fix_profile_details' }),
  gender_mismatch: D({ code: 'gender_mismatch', domain: 'persona_user_info', retryable: false, title: 'Gender field doesn’t match', message: 'Your jurisdiction requires the gender on file to match your ID.', nextStep: 'Update the field in profile settings and retry.', action: 'fix_profile_details' }),
  duplicate_identity: D({ code: 'duplicate_identity', domain: 'persona_user_info', retryable: false, title: 'This identity is already verified', message: 'Another Rentmaikar account has already been verified with this identity.', nextStep: 'Sign in to your existing account, or contact support to merge them.', action: 'contact_support', requiresSupport: true, blocksActivation: true }),
  duplicate_government_id: D({ code: 'duplicate_government_id', domain: 'persona_user_info', retryable: false, title: 'This ID is already in use', message: 'The government ID you submitted is registered to another account.', nextStep: 'Contact support so we can resolve the duplicate.', action: 'contact_support', requiresSupport: true, blocksActivation: true }),
  id_expired: D({ code: 'id_expired', domain: 'persona_user_info', retryable: false, title: 'Your ID has expired', message: 'The government ID you submitted is past its expiry date.', nextStep: 'Submit a valid, unexpired government ID.', action: 'reupload_document', blocksActivation: true }),
  id_invalid: D({ code: 'id_invalid', domain: 'persona_user_info', retryable: false, title: 'ID could not be validated', message: 'We couldn’t confirm the document you submitted is a genuine government ID.', nextStep: 'Submit a different valid government-issued ID.', action: 'reupload_document', blocksActivation: true }),
  unsupported_document_type: D({ code: 'unsupported_document_type', domain: 'persona_user_info', retryable: false, title: 'Document type not accepted', message: 'That document type isn’t accepted for your region.', nextStep: 'Use one of the accepted documents listed on the verification screen.', action: 'reupload_document' }),
  unsupported_issuing_country: D({ code: 'unsupported_issuing_country', domain: 'persona_user_info', retryable: false, title: 'Issuing country not supported', message: 'We can’t currently verify documents issued by that country.', nextStep: 'Use a document issued by a supported country, or contact support.', action: 'contact_support', requiresSupport: true }),

  /* ---------------- Persona: document quality ---------------- */
  document_blurry: D({ code: 'document_blurry', domain: 'persona_document', retryable: true, title: 'Your document photo is blurry', message: 'We couldn’t read the details on your document because the image is out of focus.', nextStep: 'Retake the photo in good light, holding the camera steady until it focuses.', action: 'reupload_document' }),
  document_cropped: D({ code: 'document_cropped', domain: 'persona_document', retryable: true, title: 'Part of your document is cut off', message: 'The edges of your document weren’t inside the frame.', nextStep: 'Retake the photo with all four corners of the document visible.', action: 'reupload_document' }),
  document_glare: D({ code: 'document_glare', domain: 'persona_document', retryable: true, title: 'Glare on your document', message: 'Reflections are covering part of the document.', nextStep: 'Move away from direct light or turn off the flash, then retake the photo.', action: 'reupload_document' }),
  document_low_resolution: D({ code: 'document_low_resolution', domain: 'persona_document', retryable: true, title: 'Image resolution too low', message: 'The uploaded image is too small for us to read.', nextStep: 'Upload a higher-resolution photo taken with your device camera.', action: 'reupload_document' }),
  document_missing_page: D({ code: 'document_missing_page', domain: 'persona_document', retryable: true, title: 'A page is missing', message: 'Your document requires both sides (or additional pages).', nextStep: 'Upload every required page, including the reverse side.', action: 'reupload_document' }),
  document_not_color: D({ code: 'document_not_color', domain: 'persona_document', retryable: true, title: 'Colour image required', message: 'A black-and-white scan or photocopy isn’t accepted.', nextStep: 'Upload an original colour photo of the document.', action: 'reupload_document' }),
  document_damaged: D({ code: 'document_damaged', domain: 'persona_document', retryable: false, title: 'Document is unreadable', message: 'The document appears damaged or the text can’t be read.', nextStep: 'Submit an undamaged document, or request a replacement from the issuer.', action: 'reupload_document' }),
  document_unsupported_format: D({ code: 'document_unsupported_format', domain: 'persona_document', retryable: true, title: 'File type not supported', message: 'We accept JPG, PNG, HEIC and PDF files.', nextStep: 'Convert or re-capture the document in a supported format.', action: 'reupload_document' }),
  document_too_large: D({ code: 'document_too_large', domain: 'persona_document', retryable: true, title: 'File is too large', message: 'The upload exceeds the 10 MB limit.', nextStep: 'We compress images automatically — retake the photo, or upload a smaller file.', action: 'reupload_document' }),
  document_corrupted: D({ code: 'document_corrupted', domain: 'persona_document', retryable: true, title: 'Upload was corrupted', message: 'The file didn’t arrive intact, usually because the connection dropped.', nextStep: 'Retry the upload on a stable connection.', action: 'reupload_document' }),

  /* ---------------- Persona: selfie & liveness ---------------- */
  face_mismatch: D({ code: 'face_mismatch', domain: 'persona_selfie', retryable: false, title: 'Selfie doesn’t match your ID', message: 'The face in your selfie doesn’t match the photo on your document.', nextStep: 'Retake the selfie yourself, using the same ID document.', action: 'retake_selfie', blocksActivation: true }),
  selfie_poor_lighting: D({ code: 'selfie_poor_lighting', domain: 'persona_selfie', retryable: true, title: 'Lighting is too dark', message: 'We couldn’t see your face clearly.', nextStep: 'Move to a well-lit area facing a light source and retake the selfie.', action: 'retake_selfie' }),
  selfie_face_covered: D({ code: 'selfie_face_covered', domain: 'persona_selfie', retryable: true, title: 'Your face is partly covered', message: 'Something is blocking part of your face.', nextStep: 'Remove hats, masks or anything covering your face and retake the selfie.', action: 'retake_selfie' }),
  selfie_multiple_faces: D({ code: 'selfie_multiple_faces', domain: 'persona_selfie', retryable: true, title: 'More than one face detected', message: 'Only the account holder may appear in the selfie.', nextStep: 'Retake the selfie alone, with a plain background.', action: 'retake_selfie' }),
  liveness_failed: D({ code: 'liveness_failed', domain: 'persona_selfie', retryable: true, title: 'Liveness check didn’t pass', message: 'We couldn’t confirm a live person was in front of the camera.', nextStep: 'Retry, following the on-screen prompts and keeping your face in the oval.', action: 'retake_selfie' }),
  camera_permission_denied: D({ code: 'camera_permission_denied', domain: 'persona_selfie', retryable: true, title: 'Camera access is blocked', message: 'Your browser blocked Rentmaikar from using the camera.', nextStep: 'Allow camera access in your browser’s site settings, then retry.', action: 'grant_camera_permission' }),
  camera_unavailable: D({ code: 'camera_unavailable', domain: 'persona_selfie', retryable: true, title: 'No camera found', message: 'We couldn’t find a working camera on this device.', nextStep: 'Continue on a phone with a working camera.', action: 'switch_device' }),
  selfie_blurry: D({ code: 'selfie_blurry', domain: 'persona_selfie', retryable: true, title: 'Selfie is blurry', message: 'The selfie is out of focus.', nextStep: 'Hold the device steady and retake the selfie.', action: 'retake_selfie' }),
  selfie_obstruction: D({ code: 'selfie_obstruction', domain: 'persona_selfie', retryable: true, title: 'Remove sunglasses or face coverings', message: 'Eyewear or a face covering prevented the match.', nextStep: 'Remove sunglasses and any face covering, then retake the selfie.', action: 'retake_selfie' }),
  spoof_detected: D({ code: 'spoof_detected', domain: 'persona_selfie', retryable: false, title: 'Verification flagged for review', message: 'Our checks flagged the submission as a possible photo-of-a-photo or screen capture.', nextStep: 'Retry with the physical document and a live selfie. If this repeats, contact support.', action: 'contact_support', requiresSupport: true, blocksActivation: true }),

  /* ---------------- Persona: device ---------------- */
  unsupported_browser: D({ code: 'unsupported_browser', domain: 'persona_device', retryable: false, title: 'Browser not supported', message: 'Identity verification needs a recent version of Chrome, Safari, Edge or Firefox.', nextStep: 'Open Rentmaikar in a supported, up-to-date browser and retry.', action: 'switch_device' }),
  outdated_browser: D({ code: 'outdated_browser', domain: 'persona_device', retryable: false, title: 'Your browser is out of date', message: 'Camera and security features required for verification are missing.', nextStep: 'Update your browser, then retry.', action: 'switch_device' }),
  unsupported_os: D({ code: 'unsupported_os', domain: 'persona_device', retryable: false, title: 'Device OS not supported', message: 'Your mobile operating system is older than the minimum we can verify on.', nextStep: 'Update your device, or use another phone or a desktop browser.', action: 'switch_device' }),
  javascript_disabled: D({ code: 'javascript_disabled', domain: 'persona_device', retryable: false, title: 'JavaScript is disabled', message: 'Verification can’t run without JavaScript enabled.', nextStep: 'Enable JavaScript for rentmaikar.com and reload.', action: 'switch_device' }),
  camera_hardware_failure: D({ code: 'camera_hardware_failure', domain: 'persona_device', retryable: true, title: 'Camera didn’t start', message: 'The camera is in use by another app or failed to start.', nextStep: 'Close other apps using the camera, reload the page and retry.', action: 'retry' }),
  upload_interrupted: D({ code: 'upload_interrupted', domain: 'persona_device', retryable: true, title: 'Upload was interrupted', message: 'Your connection dropped while the files were uploading.', nextStep: 'Reconnect and resume — your completed steps are saved.', action: 'retry' }),
  vpn_flagged: D({ code: 'vpn_flagged', domain: 'persona_device', retryable: true, title: 'VPN or proxy detected', message: 'We can’t verify identity through an anonymising network.', nextStep: 'Turn off your VPN or proxy and retry.', action: 'disable_vpn' }),
  high_risk_device: D({ code: 'high_risk_device', domain: 'persona_device', retryable: false, title: 'Device flagged for review', message: 'This device matched one of our fraud-risk signals.', nextStep: 'Our team will review this shortly — no action is needed from you yet.', action: 'wait_for_review', requiresSupport: true, blocksActivation: true }),

  /* ---------------- Persona: compliance ---------------- */
  watchlist_match: D({ code: 'watchlist_match', domain: 'persona_compliance', retryable: false, title: 'Additional compliance review required', message: 'Your details matched a global watchlist entry and need a manual check.', nextStep: 'Our compliance team will contact you. No further action is needed right now.', action: 'wait_for_review', requiresSupport: true, blocksActivation: true }),
  sanctions_match: D({ code: 'sanctions_match', domain: 'persona_compliance', retryable: false, title: 'Compliance review required', message: 'A sanctions screening hit must be reviewed before your account can be activated.', nextStep: 'Our compliance team will be in touch.', action: 'wait_for_review', requiresSupport: true, blocksActivation: true }),
  pep_review: D({ code: 'pep_review', domain: 'persona_compliance', retryable: false, title: 'Enhanced due diligence required', message: 'Your profile requires a politically-exposed-person review.', nextStep: 'A compliance officer will review and contact you.', action: 'wait_for_review', requiresSupport: true, blocksActivation: true }),
  aml_review: D({ code: 'aml_review', domain: 'persona_compliance', retryable: false, title: 'Anti-money-laundering review', message: 'Your verification requires an AML review before approval.', nextStep: 'No action needed — we’ll notify you when the review completes.', action: 'wait_for_review', blocksActivation: true }),
  fraud_review: D({ code: 'fraud_review', domain: 'persona_compliance', retryable: false, title: 'Fraud review in progress', message: 'Your submission was routed to our fraud team.', nextStep: 'We’ll notify you once the review is complete.', action: 'wait_for_review', blocksActivation: true }),
  manual_review: D({ code: 'manual_review', domain: 'persona_compliance', retryable: false, title: 'Manual review in progress', message: 'A reviewer is checking your submission by hand.', nextStep: 'This usually completes within one business day.', action: 'wait_for_review', blocksActivation: true }),
  known_fraud_identity: D({ code: 'known_fraud_identity', domain: 'persona_compliance', retryable: false, title: 'We can’t verify this identity', message: 'This identity is associated with a previous fraud report.', nextStep: 'Contact support if you believe this is an error.', action: 'contact_support', requiresSupport: true, blocksActivation: true }),
  region_restricted: D({ code: 'region_restricted', domain: 'persona_compliance', retryable: false, title: 'Not available in your region', message: 'Rentmaikar doesn’t currently operate in your location.', nextStep: 'Join the waitlist for your region, or contact support.', action: 'contact_support', blocksActivation: true }),

  /* ---------------- Persona: API / integration ---------------- */
  persona_invalid_api_key: D({ code: 'persona_invalid_api_key', domain: 'persona_api', retryable: false, title: 'Verification is temporarily unavailable', message: 'Our identity provider credentials need attention. This is on our side.', nextStep: 'Our engineering team has been alerted — please try again later.', action: 'retry_later', requiresSupport: true }),
  persona_template_missing: D({ code: 'persona_template_missing', domain: 'persona_api', retryable: false, title: 'Verification isn’t configured for your role yet', message: 'We couldn’t find a verification template for your role and region.', nextStep: 'Our team has been alerted. Try again shortly.', action: 'retry_later', requiresSupport: true }),
  persona_wrong_environment: D({ code: 'persona_wrong_environment', domain: 'persona_api', retryable: false, title: 'Verification environment mismatch', message: 'The verification session was created in the wrong environment.', nextStep: 'Our team has been alerted — please retry later.', action: 'retry_later', requiresSupport: true }),
  persona_webhook_signature_invalid: D({ code: 'persona_webhook_signature_invalid', domain: 'persona_api', retryable: false, title: 'Verification result could not be trusted', message: 'A verification callback failed its signature check and was rejected.', nextStep: 'We re-check your status automatically — no action needed.', action: 'wait_for_review', requiresSupport: true }),
  persona_timeout: D({ code: 'persona_timeout', domain: 'persona_api', retryable: true, title: 'Verification service is slow to respond', message: 'Our identity provider didn’t answer in time.', nextStep: 'Retry in a moment — nothing was lost.', action: 'retry' }),
  persona_rate_limited: D({ code: 'persona_rate_limited', domain: 'persona_api', retryable: true, title: 'Too many attempts', message: 'You’ve started verification too many times in a short period.', nextStep: 'Wait a few minutes before trying again.', action: 'retry_later' }),
  persona_unavailable: D({ code: 'persona_unavailable', domain: 'persona_api', retryable: true, title: 'Verification service is temporarily down', message: 'Our identity provider is unreachable right now.', nextStep: 'Retry in a few minutes — your progress is saved.', action: 'retry_later' }),

  /* ---------------- Persona: backend integration ---------------- */
  status_not_saved: D({ code: 'status_not_saved', domain: 'persona_backend', retryable: true, title: 'We couldn’t save your verification result', message: 'Your result came back but didn’t save correctly.', nextStep: 'Tap “Refresh status” — we reconcile with the provider automatically.', action: 'retry' }),
  webhook_processing_failed: D({ code: 'webhook_processing_failed', domain: 'persona_backend', retryable: true, title: 'Result still syncing', message: 'The verification callback failed to process and is queued for retry.', nextStep: 'Refresh your status shortly, or wait for our automatic reconciliation.', action: 'retry' }),
  inquiry_not_found: D({ code: 'inquiry_not_found', domain: 'persona_backend', retryable: false, title: 'Verification session not found', message: 'We can’t find the verification session linked to your account.', nextStep: 'Start a new verification session.', action: 'restart_verification' }),

  /* ---------------- Persona: flow ---------------- */
  user_cancelled: D({ code: 'user_cancelled', domain: 'persona_flow', retryable: true, title: 'Verification was cancelled', message: 'You closed the verification window before finishing.', nextStep: 'Resume where you left off — completed steps are saved.', action: 'restart_verification' }),
  session_expired: D({ code: 'session_expired', domain: 'persona_flow', retryable: true, title: 'Verification session expired', message: 'Verification sessions expire after a period of inactivity.', nextStep: 'Start a fresh session — it only takes a couple of minutes.', action: 'restart_verification' }),
  duplicate_session: D({ code: 'duplicate_session', domain: 'persona_flow', retryable: true, title: 'Another verification is already open', message: 'You have a verification session running in another tab or device.', nextStep: 'Finish or close the other session, then resume here.', action: 'restart_verification' }),
  role_not_assigned: D({ code: 'role_not_assigned', domain: 'persona_flow', retryable: true, title: 'Choose your account type first', message: 'We need to know whether you’re a driver or a vehicle owner before verifying.', nextStep: 'Complete your registration details, then start verification.', action: 'complete_onboarding_step', blocksActivation: true }),

  /* ---------------- Google account ---------------- */
  google_wrong_password: D({ code: 'google_wrong_password', domain: 'google_account', retryable: true, title: 'Google sign-in didn’t complete', message: 'Google couldn’t confirm your credentials.', nextStep: 'Try again, or sign in with your email and password instead.', action: 'retry' }),
  google_2sv_incomplete: D({ code: 'google_2sv_incomplete', domain: 'google_account', retryable: true, title: 'Two-step verification not completed', message: 'Google needs you to finish its second verification step.', nextStep: 'Retry sign-in and approve the prompt on your Google device.', action: 'retry' }),
  google_account_disabled: D({ code: 'google_account_disabled', domain: 'google_account', retryable: false, title: 'Your Google account can’t sign in', message: 'Google reports this account as suspended, disabled or restricted.', nextStep: 'Use a different Google account, or sign up with email and password.', action: 'use_password_login' }),
  google_admin_restricted: D({ code: 'google_admin_restricted', domain: 'google_account', retryable: false, title: 'Blocked by your Workspace administrator', message: 'Your organisation’s Google policy blocks sign-in to third-party apps.', nextStep: 'Ask your administrator to allow Rentmaikar, or use a personal account.', action: 'use_password_login' }),
  google_user_cancelled: D({ code: 'google_user_cancelled', domain: 'google_account', retryable: true, title: 'Sign-in cancelled', message: 'You closed the Google window before granting access.', nextStep: 'Tap “Continue with Google” again and approve the consent screen.', action: 'retry' }),

  /* ---------------- Google OAuth configuration ---------------- */
  oauth_invalid_client: D({ code: 'oauth_invalid_client', domain: 'google_oauth_config', retryable: false, title: 'Google sign-in is misconfigured', message: 'Our Google client credentials were rejected. This is on our side.', nextStep: 'Sign in with email and password while we fix this.', action: 'use_password_login', requiresSupport: true }),
  oauth_redirect_mismatch: D({ code: 'oauth_redirect_mismatch', domain: 'google_oauth_config', retryable: false, title: 'Sign-in redirect was rejected', message: 'The address Google tried to return you to isn’t on our allow-list.', nextStep: 'Use email sign-in for now — we’ve been alerted.', action: 'use_password_login', requiresSupport: true }),
  oauth_scope_error: D({ code: 'oauth_scope_error', domain: 'google_oauth_config', retryable: false, title: 'Permissions request was rejected', message: 'Google didn’t grant the basic profile permissions we requested.', nextStep: 'Retry and accept the email + profile permissions, or use email sign-in.', action: 'retry' }),
  oauth_consent_unpublished: D({ code: 'oauth_consent_unpublished', domain: 'google_oauth_config', retryable: false, title: 'Google sign-in not available yet', message: 'Our Google consent screen isn’t published for your account.', nextStep: 'Sign up with email and password instead.', action: 'use_password_login', requiresSupport: true }),
  oauth_state_invalid: D({ code: 'oauth_state_invalid', domain: 'google_oauth_config', retryable: true, title: 'Sign-in security check failed', message: 'The sign-in request couldn’t be matched to your browser session — this can happen if the flow was left open too long.', nextStep: 'Start sign-in again from this page.', action: 'retry' }),
  oauth_pkce_failed: D({ code: 'oauth_pkce_failed', domain: 'google_oauth_config', retryable: true, title: 'Sign-in verification failed', message: 'The secure handshake with Google couldn’t be completed in this browser.', nextStep: 'Retry in the same tab, and make sure browser storage isn’t blocked.', action: 'enable_cookies' }),

  /* ---------------- Supabase / auth backend ---------------- */
  provider_not_enabled: D({ code: 'provider_not_enabled', domain: 'google_supabase', retryable: false, title: 'Google sign-in is turned off', message: 'The Google provider isn’t enabled on this environment.', nextStep: 'Sign in with email and password — we’ve been alerted.', action: 'use_password_login', requiresSupport: true }),
  token_exchange_failed: D({ code: 'token_exchange_failed', domain: 'google_supabase', retryable: true, title: 'Couldn’t finish signing you in', message: 'The final token exchange with Google failed.', nextStep: 'Retry sign-in.', action: 'retry' }),
  session_creation_failed: D({ code: 'session_creation_failed', domain: 'google_supabase', retryable: true, title: 'Session couldn’t be created', message: 'You authenticated with Google but we couldn’t open your Rentmaikar session.', nextStep: 'Retry — if it repeats, clear site data and sign in again.', action: 'retry' }),
  refresh_token_failed: D({ code: 'refresh_token_failed', domain: 'session', retryable: true, title: 'Your session expired', message: 'We couldn’t refresh your sign-in.', nextStep: 'Sign in again — your onboarding progress is saved.', action: 'sign_in_again' }),
  profile_creation_failed: D({ code: 'profile_creation_failed', domain: 'database', retryable: true, title: 'Your profile couldn’t be created', message: 'Sign-in succeeded but your profile record failed to initialise.', nextStep: 'Retry — we recreate missing profiles automatically on next sign-in.', action: 'retry', requiresSupport: true }),

  /* ---------------- Account conflicts ---------------- */
  email_already_registered: D({ code: 'email_already_registered', domain: 'account_conflict', retryable: false, title: 'This email already has an account', message: 'An account with this email was created using a password.', nextStep: 'Sign in with your password, then link Google from Profile → Connected accounts.', action: 'link_account' }),
  identity_already_linked: D({ code: 'identity_already_linked', domain: 'account_conflict', retryable: false, title: 'This Google account is already linked', message: 'That Google identity is connected to a different Rentmaikar account.', nextStep: 'Sign in to the other account, or contact support to move the link.', action: 'contact_support', requiresSupport: true }),
  missing_role_assignment: D({ code: 'missing_role_assignment', domain: 'account_conflict', retryable: true, title: 'Your account type is missing', message: 'We couldn’t determine whether you’re a driver or an owner.', nextStep: 'Choose your account type to continue onboarding.', action: 'complete_onboarding_step', blocksActivation: true }),

  /* ---------------- Browser ---------------- */
  third_party_cookies_blocked: D({ code: 'third_party_cookies_blocked', domain: 'browser', retryable: true, title: 'Third-party cookies are blocked', message: 'Google sign-in needs cookies to keep the session secure.', nextStep: 'Allow cookies for rentmaikar.com (or leave private browsing) and retry.', action: 'enable_cookies' }),
  popup_blocked: D({ code: 'popup_blocked', domain: 'browser', retryable: true, title: 'Pop-up was blocked', message: 'Your browser stopped the Google sign-in window from opening.', nextStep: 'Allow pop-ups for rentmaikar.com and try again.', action: 'allow_popups' }),
  storage_disabled: D({ code: 'storage_disabled', domain: 'browser', retryable: true, title: 'Browser storage is disabled', message: 'We can’t keep you signed in without local storage.', nextStep: 'Enable site data/storage for rentmaikar.com and retry.', action: 'enable_cookies' }),
  csp_blocked: D({ code: 'csp_blocked', domain: 'browser', retryable: false, title: 'A security policy blocked sign-in', message: 'A browser extension or content policy blocked the sign-in resources.', nextStep: 'Disable ad blockers for this site, or retry in a private window.', action: 'retry' }),

  /* ---------------- Network / shared ---------------- */
  network_offline: D({ code: 'network_offline', domain: 'network', retryable: true, title: 'You appear to be offline', message: 'We couldn’t reach Rentmaikar.', nextStep: 'Reconnect to the internet and retry — your progress is saved.', action: 'retry' }),
  network_error: D({ code: 'network_error', domain: 'network', retryable: true, title: 'Connection problem', message: 'The request didn’t reach our servers.', nextStep: 'Check your connection and retry.', action: 'retry' }),
  service_unavailable: D({ code: 'service_unavailable', domain: 'network', retryable: true, title: 'Service temporarily unavailable', message: 'One of our services is briefly unreachable.', nextStep: 'Retry in a minute — nothing was lost.', action: 'retry_later' }),
  tls_error: D({ code: 'tls_error', domain: 'network', retryable: true, title: 'Secure connection failed', message: 'Your network rejected our secure certificate — this is common on corporate Wi-Fi.', nextStep: 'Try mobile data or a different network.', action: 'retry' }),

  /* ---------------- Session / auth state ---------------- */
  jwt_invalid: D({ code: 'jwt_invalid', domain: 'session', retryable: true, title: 'Your session is no longer valid', message: 'Your sign-in token expired or was rejected.', nextStep: 'Sign in again to continue where you left off.', action: 'sign_in_again' }),
  clock_skew: D({ code: 'clock_skew', domain: 'session', retryable: true, title: 'Your device clock is wrong', message: 'Security tokens failed validation because your device time is off.', nextStep: 'Enable automatic date & time on your device, then retry.', action: 'retry' }),
  csrf_invalid: D({ code: 'csrf_invalid', domain: 'session', retryable: true, title: 'Security token mismatch', message: 'The request couldn’t be tied back to your browser session.', nextStep: 'Reload the page and try again.', action: 'retry' }),
  rate_limited: D({ code: 'rate_limited', domain: 'session', retryable: true, title: 'Too many attempts', message: 'For your protection we’ve paused sign-in attempts on this account.', nextStep: 'Wait a few minutes and try again.', action: 'retry_later' }),

  /* ---------------- Database ---------------- */
  db_unavailable: D({ code: 'db_unavailable', domain: 'database', retryable: true, title: 'Our database is briefly unavailable', message: 'We couldn’t read or write your record.', nextStep: 'Retry shortly — nothing was lost.', action: 'retry_later' }),
  db_constraint: D({ code: 'db_constraint', domain: 'database', retryable: false, title: 'Some details couldn’t be saved', message: 'A required field was missing or conflicted with existing data.', nextStep: 'Review the highlighted fields and resubmit.', action: 'fix_profile_details' }),
  db_permission: D({ code: 'db_permission', domain: 'database', retryable: false, title: 'You don’t have access to this step', message: 'Your account role can’t perform this action yet.', nextStep: 'Finish the earlier onboarding steps, or contact support.', action: 'complete_onboarding_step' }),
  db_schema_mismatch: D({ code: 'db_schema_mismatch', domain: 'database', retryable: true, title: 'Service is updating', message: 'We’re mid-deployment and this step is briefly out of sync.', nextStep: 'Retry in a minute.', action: 'retry_later', requiresSupport: true }),

  /* ---------------- App / config ---------------- */
  config_missing: D({ code: 'config_missing', domain: 'config', retryable: false, title: 'App configuration issue', message: 'A required setting is missing in this environment.', nextStep: 'Our team has been alerted — please retry later.', action: 'retry_later', requiresSupport: true }),
  redirect_loop: D({ code: 'redirect_loop', domain: 'app', retryable: true, title: 'Navigation loop detected', message: 'We caught the app bouncing between pages and stopped it.', nextStep: 'Reload once. If it repeats, sign out and back in.', action: 'sign_in_again' }),
  duplicate_submission: D({ code: 'duplicate_submission', domain: 'app', retryable: false, title: 'Already submitted', message: 'This request was already received — we ignored the duplicate.', nextStep: 'No action needed.', action: 'none' }),
  stale_state: D({ code: 'stale_state', domain: 'app', retryable: true, title: 'You’re seeing outdated information', message: 'Your cached account state is behind the server.', nextStep: 'Refresh to load the latest status.', action: 'retry' }),

  /* ---------------- Rentmaikar onboarding blockers ---------------- */
  blocker_identity_incomplete: D({ code: 'blocker_identity_incomplete', domain: 'onboarding_blocker', retryable: true, title: 'Identity verification not completed', message: 'You need a verified identity before your account can be activated.', nextStep: 'Complete identity verification.', action: 'restart_verification', blocksActivation: true }),
  blocker_license_missing: D({ code: 'blocker_license_missing', domain: 'onboarding_blocker', retryable: true, title: 'Driver’s licence missing or expired', message: 'Drivers must hold a valid, unexpired licence on file.', nextStep: 'Upload a current driver’s licence.', action: 'reupload_document', blocksActivation: true }),
  blocker_ownership_docs_missing: D({ code: 'blocker_ownership_docs_missing', domain: 'onboarding_blocker', retryable: true, title: 'Vehicle ownership documents missing', message: 'We need proof that you own the vehicle you’re listing.', nextStep: 'Upload the vehicle ownership documents.', action: 'reupload_document', blocksActivation: true }),
  blocker_insurance_missing: D({ code: 'blocker_insurance_missing', domain: 'onboarding_blocker', retryable: true, title: 'Insurance documents missing or expired', message: 'Active insurance is required before a vehicle can go live.', nextStep: 'Upload a valid insurance certificate.', action: 'reupload_document', blocksActivation: true }),
  blocker_referees_incomplete: D({ code: 'blocker_referees_incomplete', domain: 'onboarding_blocker', retryable: true, title: 'Referee details incomplete', message: 'Your referees haven’t been fully provided or verified.', nextStep: 'Complete the referee section of your application.', action: 'complete_onboarding_step', blocksActivation: true }),
  blocker_email_unverified: D({ code: 'blocker_email_unverified', domain: 'onboarding_blocker', retryable: true, title: 'Email not verified', message: 'Confirm your email address to continue.', nextStep: 'Open the confirmation link we emailed you, or resend it.', action: 'complete_onboarding_step', blocksActivation: true }),
  blocker_admin_approval_pending: D({ code: 'blocker_admin_approval_pending', domain: 'onboarding_blocker', retryable: false, title: 'Awaiting administrator approval', message: 'Your application is complete and queued for review.', nextStep: 'We’ll notify you as soon as it’s approved.', action: 'wait_for_review', blocksActivation: true }),
  blocker_account_suspended: D({ code: 'blocker_account_suspended', domain: 'onboarding_blocker', retryable: false, title: 'Account suspended or rejected', message: 'Your account isn’t currently eligible for activation.', nextStep: 'Contact support to discuss reinstatement.', action: 'contact_support', requiresSupport: true, blocksActivation: true }),
  blocker_profile_incomplete: D({ code: 'blocker_profile_incomplete', domain: 'onboarding_blocker', retryable: true, title: 'Required profile fields missing', message: 'Some mandatory onboarding fields are still blank.', nextStep: 'Complete your profile to continue.', action: 'complete_onboarding_step', blocksActivation: true }),
  blocker_agreements_unsigned: D({ code: 'blocker_agreements_unsigned', domain: 'onboarding_blocker', retryable: true, title: 'Agreements not accepted', message: 'You must accept the required agreements before activation.', nextStep: 'Review and sign the outstanding agreements.', action: 'complete_onboarding_step', blocksActivation: true }),
  blocker_payout_details_missing: D({ code: 'blocker_payout_details_missing', domain: 'onboarding_blocker', retryable: true, title: 'Payout details missing', message: 'Owners need bank or payout details before earnings can be released.', nextStep: 'Add your payout details in the billing portal.', action: 'complete_onboarding_step', blocksActivation: true }),

  /* ---------------- Fallback ---------------- */
  unknown_failure: D({ code: 'unknown_failure', domain: 'unknown', retryable: true, title: 'Something went wrong', message: 'We hit an unexpected problem completing this step.', nextStep: 'Retry. If it keeps happening, contact support with the reference below.', action: 'retry' }),
};

export interface ClassifiedFailure extends FailureDefinition {
  /** Raw provider text, retained for support/debugging (never shown as the headline). */
  raw: string;
  /** Correlation id for cross-referencing logs, when available. */
  correlationId?: string;
}

interface MatchRule {
  code: string;
  test: RegExp;
}

/** Ordered — first match wins, so put specific patterns above generic ones. */
const RULES: MatchRule[] = [
  // Persona check names / decision reasons
  { code: 'name_mismatch', test: /name[_ -]?(comparison|mismatch)|government[_ -]?id[_ -]?name/i },
  { code: 'dob_mismatch', test: /birthdate|date[_ -]?of[_ -]?birth|dob[_ -]?mismatch/i },
  { code: 'address_mismatch', test: /address[_ -]?(comparison|mismatch)/i },
  { code: 'phone_mismatch', test: /phone[_ -]?(comparison|mismatch)/i },
  { code: 'email_mismatch', test: /email[_ -]?(comparison|mismatch)/i },
  { code: 'nationality_mismatch', test: /nationality/i },
  { code: 'gender_mismatch', test: /\bsex\b|gender[_ -]?(comparison|mismatch)/i },
  { code: 'duplicate_identity', test: /duplicate[_ -]?(person|identity)|already[_ -]?verified/i },
  { code: 'duplicate_government_id', test: /duplicate[_ -]?(government[_ -]?id|document)/i },
  { code: 'id_expired', test: /expired[_ -]?(id|document|government)|document[_ -]?expir/i },
  { code: 'unsupported_document_type', test: /unsupported[_ -]?document|document[_ -]?type[_ -]?not/i },
  { code: 'unsupported_issuing_country', test: /issuing[_ -]?country|unsupported[_ -]?country/i },
  { code: 'id_invalid', test: /invalid[_ -]?(id|document)|not[_ -]?a[_ -]?valid[_ -]?id|barcode[_ -]?inconsistency|tamper/i },

  { code: 'document_blurry', test: /blur/i },
  { code: 'document_cropped', test: /crop|edges?[_ -]?(detect|missing)/i },
  { code: 'document_glare', test: /glare|reflect/i },
  { code: 'document_low_resolution', test: /low[_ -]?(res|quality)|resolution/i },
  { code: 'document_missing_page', test: /missing[_ -]?(page|back|side)|both[_ -]?sides/i },
  { code: 'document_not_color', test: /black[_ -]?and[_ -]?white|colou?r[_ -]?required|greyscale|grayscale/i },
  { code: 'document_damaged', test: /damag|unreadable|illegible/i },
  { code: 'document_unsupported_format', test: /unsupported[_ -]?(file|format)|mime/i },
  { code: 'document_too_large', test: /too[_ -]?large|payload[_ -]?too[_ -]?large|exceeds[_ -]?(the[_ -]?)?(size|limit)|413/i },
  { code: 'document_corrupted', test: /corrupt/i },

  { code: 'face_mismatch', test: /(selfie|face)[_ -]?(comparison|match|mismatch)|does[_ -]?not[_ -]?match[_ -]?id/i },
  { code: 'selfie_poor_lighting', test: /lighting|too[_ -]?dark|underexposed/i },
  { code: 'selfie_multiple_faces', test: /multiple[_ -]?faces/i },
  { code: 'selfie_obstruction', test: /sunglasses|eyewear|face[_ -]?covering|mask/i },
  { code: 'selfie_face_covered', test: /face[_ -]?(covered|obstruct|occlu)/i },
  { code: 'spoof_detected', test: /spoof|screen[_ -]?capture|photo[_ -]?of[_ -]?(a[_ -]?)?photo|deepfake|injection[_ -]?attack/i },
  { code: 'liveness_failed', test: /liveness|selfie[_ -]?pose|centered/i },
  { code: 'camera_permission_denied', test: /notallowederror|permission[_ -]?denied.*camera|camera.*(permission|denied|blocked)/i },
  { code: 'camera_unavailable', test: /notfounderror|no[_ -]?camera|camera[_ -]?(unavailable|not[_ -]?found)|overconstrained/i },
  { code: 'camera_hardware_failure', test: /notreadableerror|aborterror|camera[_ -]?(hardware|failed|in[_ -]?use)/i },
  { code: 'selfie_blurry', test: /selfie.*blur/i },

  { code: 'unsupported_browser', test: /unsupported[_ -]?browser|browser[_ -]?not[_ -]?supported/i },
  { code: 'outdated_browser', test: /outdated[_ -]?browser|browser[_ -]?(too[_ -]?old|out[_ -]?of[_ -]?date)/i },
  { code: 'unsupported_os', test: /unsupported[_ -]?(os|operating[_ -]?system|ios|android)/i },
  { code: 'javascript_disabled', test: /javascript[_ -]?(is[_ -]?)?disabled|noscript/i },
  { code: 'vpn_flagged', test: /\bvpn\b|proxy[_ -]?detect|anonymi[sz]/i },
  { code: 'high_risk_device', test: /device[_ -]?risk|high[_ -]?risk[_ -]?device|risky[_ -]?fingerprint/i },

  { code: 'watchlist_match', test: /watchlist/i },
  { code: 'sanctions_match', test: /sanction|ofac/i },
  { code: 'pep_review', test: /\bpep\b|politically[_ -]?exposed/i },
  { code: 'aml_review', test: /\baml\b|money[_ -]?laundering/i },
  { code: 'known_fraud_identity', test: /known[_ -]?fraud|fraud[_ -]?list|blocklist/i },
  { code: 'fraud_review', test: /fraud/i },
  { code: 'region_restricted', test: /region[_ -]?(restricted|not[_ -]?supported)|geo[_ -]?block|not[_ -]?available[_ -]?in[_ -]?your/i },
  { code: 'manual_review', test: /manual[_ -]?review|needs[_ -]?review|pending[_ -]?review/i },

  { code: 'persona_invalid_api_key', test: /invalid[_ -]?api[_ -]?key|unauthorized.*persona|persona.*401|api[_ -]?key[_ -]?(expired|missing)|persona_api_key/i },
  { code: 'persona_template_missing', test: /template[_ -]?(id[_ -]?)?(missing|not[_ -]?found|invalid)|no[_ -]?template/i },
  { code: 'persona_wrong_environment', test: /environment[_ -]?(mismatch|id[_ -]?(missing|invalid))|sandbox.*production|production.*sandbox/i },
  { code: 'persona_webhook_signature_invalid', test: /webhook[_ -]?(signature|secret)|invalid[_ -]?signature/i },
  { code: 'persona_rate_limited', test: /429|rate[_ -]?limit|too[_ -]?many[_ -]?requests/i },
  { code: 'persona_timeout', test: /timed?[_ -]?out|etimedout|deadline[_ -]?exceeded/i },
  { code: 'persona_unavailable', test: /persona.*(unavailable|5\d\d)|service[_ -]?unavailable.*persona/i },

  { code: 'inquiry_not_found', test: /inquiry[_ -]?not[_ -]?found|no[_ -]?inquiry/i },
  { code: 'webhook_processing_failed', test: /webhook[_ -]?(processing[_ -]?)?fail/i },
  { code: 'status_not_saved', test: /status[_ -]?not[_ -]?saved|failed[_ -]?to[_ -]?(save|persist)/i },

  { code: 'user_cancelled', test: /cancell?ed|user[_ -]?closed|popup[_ -]?closed|access[_ -]?denied/i },
  { code: 'session_expired', test: /session[_ -]?expired|inquiry[_ -]?expired|\bexpired\b/i },
  { code: 'duplicate_session', test: /duplicate[_ -]?session|already[_ -]?(open|in[_ -]?progress)/i },
  { code: 'role_not_assigned', test: /role[_ -]?not[_ -]?(assigned|set)|missing[_ -]?role/i },

  // Google / OAuth
  { code: 'oauth_redirect_mismatch', test: /redirect[_ -]?uri[_ -]?mismatch|unauthori[sz]ed[_ -]?redirect|bad[_ -]?redirect/i },
  { code: 'oauth_invalid_client', test: /invalid[_ -]?client|client[_ -]?(id|secret)[_ -]?(invalid|missing)|unauthorized_client/i },
  { code: 'oauth_scope_error', test: /invalid[_ -]?scope|missing[_ -]?scope|insufficient[_ -]?scope/i },
  { code: 'oauth_consent_unpublished', test: /consent[_ -]?screen|access_denied.*testing|app[_ -]?not[_ -]?verified|unverified[_ -]?app/i },
  { code: 'oauth_state_invalid', test: /invalid[_ -]?(state|nonce)|state[_ -]?mismatch|bad_oauth_state/i },
  { code: 'oauth_pkce_failed', test: /pkce|code[_ -]?verifier|code[_ -]?challenge/i },
  { code: 'provider_not_enabled', test: /unsupported[_ -]?provider|provider[_ -]?(is[_ -]?)?(not[_ -]?enabled|disabled)|validation_failed.*provider/i },
  { code: 'token_exchange_failed', test: /token[_ -]?exchange|failed[_ -]?to[_ -]?exchange|invalid[_ -]?grant/i },
  { code: 'refresh_token_failed', test: /refresh[_ -]?token/i },
  { code: 'session_creation_failed', test: /session[_ -]?(creation|missing)|no[_ -]?session/i },
  { code: 'google_2sv_incomplete', test: /two[_ -]?step|2sv|second[_ -]?factor/i },
  { code: 'google_admin_restricted', test: /admin[_ -]?polic|workspace[_ -]?restrict|org(anization)?[_ -]?polic|admin_policy_enforced/i },
  { code: 'google_account_disabled', test: /account[_ -]?(disabled|suspended)|user[_ -]?disabled|child[_ -]?account/i },
  { code: 'google_wrong_password', test: /wrong[_ -]?password|invalid[_ -]?(login[_ -]?)?credentials/i },

  { code: 'email_already_registered', test: /already[_ -]?registered|user[_ -]?already[_ -]?exists|email[_ -]?(address[_ -]?)?(is[_ -]?)?taken/i },
  { code: 'identity_already_linked', test: /identity_already_exists|identity[_ -]?already[_ -]?linked/i },
  { code: 'missing_role_assignment', test: /user_roles.*missing|no[_ -]?role[_ -]?assigned/i },

  { code: 'popup_blocked', test: /popup[_ -]?block|window[_ -]?blocked/i },
  { code: 'third_party_cookies_blocked', test: /third[_ -]?party[_ -]?cookies?|cookies?[_ -]?(are[_ -]?)?(blocked|disabled)/i },
  { code: 'storage_disabled', test: /localstorage|storage[_ -]?(is[_ -]?)?(disabled|unavailable)|quotaexceeded|securityerror.*storage/i },
  { code: 'csp_blocked', test: /content[_ -]?security[_ -]?policy|\bcsp\b|blocked[_ -]?by[_ -]?client|err_blocked/i },

  { code: 'clock_skew', test: /clock[_ -]?skew|issued[_ -]?in[_ -]?the[_ -]?future|iat.*future|token[_ -]?used[_ -]?before/i },
  { code: 'csrf_invalid', test: /csrf/i },
  { code: 'jwt_invalid', test: /\bjwt\b|pgrst301|not[_ -]?authenticated|invalid[_ -]?token|token[_ -]?expired/i },
  { code: 'rate_limited', test: /over_email_send_rate_limit|too[_ -]?many[_ -]?attempts/i },

  { code: 'network_offline', test: /offline|err_internet_disconnected/i },
  { code: 'tls_error', test: /\bssl\b|\btls\b|certificate/i },
  { code: 'service_unavailable', test: /503|502|504|service[_ -]?unavailable|bad[_ -]?gateway|outage/i },
  { code: 'network_error', test: /failed[_ -]?to[_ -]?fetch|networkerror|network[_ -]?request[_ -]?failed|dns|err_network/i },

  { code: 'db_permission', test: /42501|permission[_ -]?denied|row[_ -]?level[_ -]?security|violates[_ -]?row/i },
  { code: 'db_schema_mismatch', test: /42703|42883|schema[_ -]?cache|does[_ -]?not[_ -]?exist/i },
  { code: 'db_constraint', test: /23505|23503|23502|constraint|duplicate[_ -]?key|not[_ -]?null/i },
  { code: 'profile_creation_failed', test: /handle_new_user|profile[_ -]?(creation|record)[_ -]?(fail|missing)|database error saving new user/i },
  { code: 'db_unavailable', test: /connection[_ -]?refused|too[_ -]?many[_ -]?connections|database[_ -]?(is[_ -]?)?unavailable/i },

  { code: 'redirect_loop', test: /redirect[_ -]?loop|too[_ -]?many[_ -]?redirects/i },
  { code: 'duplicate_submission', test: /duplicate[_ -]?(submission|request)|idempoten/i },
  { code: 'stale_state', test: /stale/i },
  { code: 'config_missing', test: /missing[_ -]?(env|environment[_ -]?variable|configuration)|not[_ -]?configured/i },
];

function stringifyError(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  const e = err as Record<string, unknown>;
  const parts = [e.code, e.error_code, e.error, e.error_description, e.name, e.message, e.details, e.hint, e.reason, e.status]
    .filter((v) => typeof v === 'string' || typeof v === 'number');
  if (parts.length) return parts.join(' | ');
  try { return JSON.stringify(err); } catch { return String(err); }
}

/**
 * Classify any raw error (Error, Supabase error, Persona check name,
 * decision reason string, OAuth error param) into an actionable failure.
 */
export function classifyVerificationFailure(
  err: unknown,
  opts: { correlationId?: string; fallbackCode?: string } = {},
): ClassifiedFailure {
  const raw = stringifyError(err);

  // Exact catalogue-code match short-circuits pattern matching.
  const direct = typeof err === 'string' ? FAILURE_CATALOGUE[err] : undefined;
  if (direct) return { ...direct, raw, correlationId: opts.correlationId };

  const anyErr = err as { code?: string } | undefined;
  if (anyErr && typeof anyErr === 'object' && anyErr.code && FAILURE_CATALOGUE[anyErr.code]) {
    return { ...FAILURE_CATALOGUE[anyErr.code], raw, correlationId: opts.correlationId };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ...FAILURE_CATALOGUE.network_offline, raw, correlationId: opts.correlationId };
  }

  for (const rule of RULES) {
    if (rule.test.test(raw)) {
      return { ...FAILURE_CATALOGUE[rule.code], raw, correlationId: opts.correlationId };
    }
  }

  const fallback = (opts.fallbackCode && FAILURE_CATALOGUE[opts.fallbackCode]) || FAILURE_CATALOGUE.unknown_failure;
  return { ...fallback, raw, correlationId: opts.correlationId };
}

/**
 * Classify a Persona `mismatch_fields` payload (check name → reasons) into
 * the ordered set of user-facing failures for that inquiry.
 */
export function classifyPersonaMismatches(
  mismatch: Record<string, unknown> | null | undefined,
  opts: { correlationId?: string } = {},
): ClassifiedFailure[] {
  if (!mismatch) return [];
  const out: ClassifiedFailure[] = [];
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(mismatch)) {
    const detail = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    const probe = `${key} ${detail}`;
    const f = classifyVerificationFailure(probe, opts);
    if (f.code === 'unknown_failure' && key.startsWith('_')) continue;
    if (seen.has(f.code)) continue;
    seen.add(f.code);
    out.push(f);
  }
  // Blocking/terminal issues first, then retryable fixes.
  return out.sort((a, b) => Number(a.retryable) - Number(b.retryable));
}

/** True when the app may transparently retry with backoff. */
export function isTransient(f: Pick<FailureDefinition, 'retryable' | 'domain'>): boolean {
  if (!f.retryable) return false;
  return ['network', 'persona_api', 'persona_backend', 'database', 'session', 'app', 'google_supabase'].includes(f.domain);
}

/** Human label used in badges/analytics. */
export const DOMAIN_LABELS: Record<FailureDomain, string> = {
  persona_user_info: 'Your details',
  persona_document: 'Document quality',
  persona_selfie: 'Selfie & liveness',
  persona_device: 'Device',
  persona_compliance: 'Compliance review',
  persona_api: 'Verification provider',
  persona_backend: 'Result sync',
  persona_flow: 'Verification session',
  google_account: 'Google account',
  google_oauth_config: 'Google sign-in setup',
  google_supabase: 'Authentication',
  account_conflict: 'Account conflict',
  browser: 'Browser settings',
  network: 'Connection',
  session: 'Session',
  database: 'Data',
  app: 'App',
  config: 'Configuration',
  onboarding_blocker: 'Onboarding requirement',
  unknown: 'Unexpected',
};
