import { supabase } from '../../lib/supabase';
import { ActivityItem, ActivityType } from '../../types/activity';

// Activity events are created by database triggers (migration 005).
// Clients only READ events and write activity_reads (mark-as-read).

export const activityRepository = {
  // No-op: triggers handle writes server-side.
  async create(fields: {
    type: ActivityType;
    recipientRole: 'technician' | 'company';
    recipientId: string;
    entityId: string;
  }): Promise<ActivityItem> {
    return { ...fields, id: '', read: false, createdAt: new Date().toISOString() };
  },

  // Returns the set of entity_ids (offer_application_id / offer_request_id / chat_room_id)
  // for which there are unread activity_events of the given types.
  async getUnreadEntityIds(
    recipientRole: 'technician' | 'company',
    recipientId: string,
    types: ActivityType[],
  ): Promise<Set<string>> {
    const scopeField = recipientRole === 'technician'
      ? 'recipient_technician_id'
      : 'recipient_company_id';

    const { data: events, error } = await supabase
      .from('activity_events')
      .select('id, entity_id')
      .eq('recipient_scope', recipientRole)
      .eq(scopeField, recipientId)
      .in('type', types);

    if (error || !events?.length) return new Set();

    // RLS on activity_reads filters to auth.uid() automatically.
    const { data: reads } = await supabase
      .from('activity_reads')
      .select('activity_event_id')
      .in('activity_event_id', events.map((e) => e.id));

    const readIds = new Set((reads ?? []).map((r: any) => r.activity_event_id as string));
    return new Set(
      events
        .filter((e) => !readIds.has(e.id))
        .map((e) => e.entity_id as string),
    );
  },

  async getUnreadCount(
    recipientRole: 'technician' | 'company',
    recipientId: string,
    types: ActivityType[],
  ): Promise<number> {
    const ids = await this.getUnreadEntityIds(recipientRole, recipientId, types);
    return ids.size;
  },

  // Marks all unread events for a given entityId as read for the current user.
  async markRead(
    recipientRole: 'technician' | 'company',
    recipientId: string,
    entityId: string,
  ): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    const profileId = session?.user?.id;
    if (!profileId) return;

    const scopeField = recipientRole === 'technician'
      ? 'recipient_technician_id'
      : 'recipient_company_id';

    const { data: events } = await supabase
      .from('activity_events')
      .select('id')
      .eq('recipient_scope', recipientRole)
      .eq(scopeField, recipientId)
      .eq('entity_id', entityId);

    if (!events?.length) return;

    await supabase
      .from('activity_reads')
      .upsert(
        events.map((e) => ({ activity_event_id: e.id, profile_id: profileId })),
        { onConflict: 'activity_event_id,profile_id', ignoreDuplicates: true },
      );
  },

  // Returns chat room IDs that have at least one unread message event.
  async getUnreadChatRoomIds(
    recipientRole: 'technician' | 'company',
    recipientId: string,
  ): Promise<Set<string>> {
    return this.getUnreadEntityIds(recipientRole, recipientId, ['chat_message_received']);
  },

  // Marks all unread chat_message_received events for a room as read.
  async markChatRoomRead(
    recipientRole: 'technician' | 'company',
    recipientId: string,
    chatRoomId: string,
  ): Promise<void> {
    return this.markRead(recipientRole, recipientId, chatRoomId);
  },
};
