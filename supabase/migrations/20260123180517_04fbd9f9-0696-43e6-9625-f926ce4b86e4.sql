-- Enable realtime for inbox tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;