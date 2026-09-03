-- Align kw_stop / kw_help / kw_start template bodies with the A2P 10DLC campaign submission.
-- kw_stop: exact opt-out message declared in the campaign (all variants).
update public.twilio_message_templates
set body = 'You have successfully been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe.',
    placeholders = '{}'::text[],
    description = 'Opt-out confirmation (STOP, STOPALL, OPTOUT, CANCEL, END, QUIT, UNSUBSCRIBE, REVOKE). Wording matches the A2P 10DLC campaign submission.',
    updated_at = now()
where template_key = 'kw_stop';

-- kw_help: exact help message declared in the campaign (global + US + NG variants).
update public.twilio_message_templates
set body = 'Reply STOP to unsubscribe. Msg&Data Rates May Apply.',
    placeholders = '{}'::text[],
    description = 'Help keyword reply (HELP, INFO). Wording matches the A2P 10DLC campaign submission.',
    updated_at = now()
where template_key = 'kw_help';

-- kw_start: keep branded resubscribe confirmation, aligned with code fallback.
update public.twilio_message_templates
set body = 'Rentmaikar: You''re re-subscribed to SMS notifications. Reply HELP for commands or STOP to opt out again.',
    placeholders = '{}'::text[],
    updated_at = now()
where template_key = 'kw_start'
  and body is distinct from 'Rentmaikar: You''re re-subscribed to SMS notifications. Reply HELP for commands or STOP to opt out again.';