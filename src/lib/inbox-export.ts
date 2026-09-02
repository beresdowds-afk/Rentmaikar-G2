import { supabase } from '@/integrations/supabase/client';

const COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'id', label: 'Conversation ID' },
  { key: 'created_at', label: 'Created At' },
  { key: 'last_message_at', label: 'Last Message At' },
  { key: 'channel', label: 'Channel' },
  { key: 'region', label: 'Region' },
  { key: 'subject', label: 'Subject' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'user_name', label: 'Contact Name' },
  { key: 'user_email', label: 'Contact Email' },
  { key: 'user_phone', label: 'Contact Phone' },
  { key: 'is_flagged', label: 'Flagged' },
  { key: 'archived_at', label: 'Archived At' },
  { key: 'assigned_to', label: 'Assigned To' },
  { key: 'message_count', label: 'Messages' },
  { key: 'unread_count', label: 'Unread' },
];

const escapeCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildInboxCsv = (rows: Array<Record<string, unknown>>) =>
  [
    COLUMNS.map((c) => c.label).join(','),
    ...rows.map((row) => COLUMNS.map((c) => escapeCell(row[c.key])).join(',')),
  ].join('\r\n');

/** Fetch full details for the given conversations and download them as a CSV file. */
export const exportInboxConversations = async (
  ids: string[],
  assigneeNames: Record<string, string> = {},
): Promise<number> => {
  if (!ids.length) return 0;

  const { data: conversations, error } = await supabase
    .from('inbox_conversations')
    .select('*')
    .in('id', ids)
    .order('last_message_at', { ascending: false });

  if (error) throw error;

  const { data: messages } = await supabase
    .from('inbox_messages')
    .select('conversation_id, is_read, sender_type')
    .in('conversation_id', ids);

  const totals: Record<string, number> = {};
  const unread: Record<string, number> = {};
  (messages || []).forEach((m) => {
    const cid = m.conversation_id as string;
    totals[cid] = (totals[cid] || 0) + 1;
    if (!m.is_read && m.sender_type === 'user') unread[cid] = (unread[cid] || 0) + 1;
  });

  const rows = (conversations || []).map((c) => ({
    ...c,
    assigned_to: c.assigned_to ? assigneeNames[c.assigned_to as string] ?? c.assigned_to : '',
    message_count: totals[c.id as string] || 0,
    unread_count: unread[c.id as string] || 0,
  }));

  const blob = new Blob([`\uFEFF${buildInboxCsv(rows)}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `inbox-threads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return rows.length;
};
