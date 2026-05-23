import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import { ActivityItem, ActivityType } from '../../types/activity';

async function getAll(): Promise<ActivityItem[]> {
  return (await storageAdapter.get<ActivityItem[]>(DB_KEYS.v2Activities)) ?? [];
}

async function saveAll(items: ActivityItem[]): Promise<void> {
  await storageAdapter.set(DB_KEYS.v2Activities, items);
}

export const activityRepository = {
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
};
