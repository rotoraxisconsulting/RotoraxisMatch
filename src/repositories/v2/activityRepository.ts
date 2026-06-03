import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import { ActivityItem, ActivityType } from '../../types/activity';
import { ChatMessage } from '../../types/chat';

async function getAll(): Promise<ActivityItem[]> {
  return (await storageAdapter.get<ActivityItem[]>(DB_KEYS.v2Activities)) ?? [];
}

async function saveAll(items: ActivityItem[]): Promise<void> {
  await storageAdapter.set(DB_KEYS.v2Activities, items);
}

export const activityRepository = {
  /**
   * Local simulation of the server-side activity event trigger.
   * Called only from repository methods (offerRequestRepository, offerApplicationRepository, chatRepository).
   * Do NOT call directly from UI screens or hooks.
   * Future Supabase: events are inserted by SECURITY DEFINER trigger functions on status transitions.
   */
  async create(fields: {
    type: ActivityType;
    recipientRole: 'technician' | 'company';
    recipientId: string;
    entityId: string;
  }): Promise<ActivityItem> {
    const items = await getAll();
    const item: ActivityItem = {
      ...fields,
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      read: false,
      createdAt: new Date().toISOString(),
    };
    await saveAll([...items, item]);
    return item;
  },

  async getUnreadCount(
    recipientRole: 'technician' | 'company',
    recipientId: string,
    types: ActivityType[],
  ): Promise<number> {
    const items = await getAll();
    return items.filter(
      (i) =>
        !i.read &&
        i.recipientRole === recipientRole &&
        i.recipientId === recipientId &&
        types.includes(i.type),
    ).length;
  },

  async getUnreadEntityIds(
    recipientRole: 'technician' | 'company',
    recipientId: string,
    types: ActivityType[],
  ): Promise<Set<string>> {
    const items = await getAll();
    const set = new Set<string>();
    for (const i of items) {
      if (
        !i.read &&
        i.recipientRole === recipientRole &&
        i.recipientId === recipientId &&
        types.includes(i.type)
      ) {
        set.add(i.entityId);
      }
    }
    return set;
  },

  async markRead(
    recipientRole: 'technician' | 'company',
    recipientId: string,
    entityId: string,
  ): Promise<void> {
    const items = await getAll();
    const updated = items.map((i) =>
      i.recipientRole === recipientRole &&
      i.recipientId === recipientId &&
      i.entityId === entityId
        ? { ...i, read: true }
        : i,
    );
    await saveAll(updated);
  },

  /**
   * Local demo only — returns chat rooms with unread messages via chat_message_received activity.
   * Future Supabase: replace with a Realtime subscription or per-message read state.
   * chat_message_received activity is not required for Phase 1 Supabase migration.
   */
  async getUnreadChatRoomIds(
    recipientRole: 'technician' | 'company',
    recipientId: string,
  ): Promise<Set<string>> {
    const [items, messages] = await Promise.all([
      getAll(),
      storageAdapter.get<ChatMessage[]>(DB_KEYS.v2ChatMessages).then((value) => value ?? []),
    ]);
    const roomByMessageId = new Map(
      (messages as ChatMessage[]).map((message) => [message.id, message.chatRoomId]),
    );
    const roomIds = new Set<string>();

    for (const item of items) {
      if (
        item.read ||
        item.type !== 'chat_message_received' ||
        item.recipientRole !== recipientRole ||
        item.recipientId !== recipientId
      ) {
        continue;
      }

      const roomId = roomByMessageId.get(item.entityId) ?? item.entityId;
      if (roomId) roomIds.add(roomId);
    }

    return roomIds;
  },

  /**
   * Local demo only — marks chat_message_received activity items as read for a room.
   * Future Supabase: replace with per-message activity_reads rows or Realtime read receipts.
   * chat_message_received activity is not required for Phase 1 Supabase migration.
   */
  async markChatRoomRead(
    recipientRole: 'technician' | 'company',
    recipientId: string,
    chatRoomId: string,
  ): Promise<void> {
    const [items, messages] = await Promise.all([
      getAll(),
      storageAdapter.get<ChatMessage[]>(DB_KEYS.v2ChatMessages).then((value) => value ?? []),
    ]);
    const messageIds = new Set(
      (messages as ChatMessage[])
        .filter((message) => message.chatRoomId === chatRoomId)
        .map((message) => message.id),
    );

    const updated = items.map((item) =>
      item.recipientRole === recipientRole &&
      item.recipientId === recipientId &&
      item.type === 'chat_message_received' &&
      (messageIds.has(item.entityId) || item.entityId === chatRoomId)
        ? { ...item, read: true }
        : item,
    );

    await saveAll(updated);
  },
};
