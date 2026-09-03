-- The 2026-08-09 backfill treated profiles.notification_sms = false (the column
-- DEFAULT, not an explicit choice) as a STOP keyword, which silently suppressed
-- every outbound SMS/WhatsApp. Remove those rows: none of them came from a real
-- STOP reply. Genuine opt-outs (source <> 'backfill_profile_preference') stay.
DELETE FROM public.messaging_opt_outs
WHERE source = 'backfill_profile_preference'
  AND last_keyword = 'STOP';