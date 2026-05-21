import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import { ChatRoom, ChatMessage } from '../../types/chat';
import { SenderRole } from '../../types/enums';

function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface CreateRoomInput {
  offerRequestId?: string;
  offerApplicationId?: string;
  technicianId: string;
  companyId: string;
}

export const chatRepository = {
  async getRoom(id: string): Promise<ChatRoom | null> {
    const rooms = await storageAdapter.get<ChatRoom[]>(DB_KEYS.v2ChatRooms) ?? [];
    return rooms.find((r) => r.id === id) ?? null;
  },

  async getRoomsForTechnician(technicianId: string): Promise<ChatRoom[]> {
    const rooms = await storageAdapter.get<ChatRoom[]>(DB_KEYS.v2ChatRooms) ?? [];
    return rooms.filter((r) => r.technicianId === technicianId);
  },

  async getRoomsForCompany(companyId: string): Promise<ChatRoom[]> {
    const rooms = await storageAdapter.get<ChatRoom[]>(DB_KEYS.v2ChatRooms) ?? [];
    return rooms.filter((r) => r.companyId === companyId);
  },

  async getOrCreateRoom(input: CreateRoomInput): Promise<ChatRoom> {
    const rooms = await storageAdapter.get<ChatRoom[]>(DB_KEYS.v2ChatRooms) ?? [];

    const existing = rooms.find((r) => {
      if (input.offerRequestId) return r.offerRequestId === input.offerRequestId;
      if (input.offerApplicationId) return r.offerApplicationId === input.offerApplicationId;
      return r.technicianId === input.technicianId && r.companyId === input.companyId;
    });

    if (existing) return existing;

    const newRoom: ChatRoom = {
      id: `room-${uuid()}`,
      offerRequestId: input.offerRequestId,
      offerApplicationId: input.offerApplicationId,
      technicianId: input.technicianId,
      companyId: input.companyId,
      createdAt: new Date().toISOString(),
    };

    await storageAdapter.set(DB_KEYS.v2ChatRooms, [...rooms, newRoom]);
    return newRoom;
  },

  async getMessages(chatRoomId: string): Promise<ChatMessage[]> {
    const messages = await storageAdapter.get<ChatMessage[]>(DB_KEYS.v2ChatMessages) ?? [];
    return messages
      .filter((m) => m.chatRoomId === chatRoomId)
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  },

  async sendMessage(chatRoomId: string, senderId: string, senderRole: SenderRole, body: string): Promise<ChatMessage> {
    const messages = await storageAdapter.get<ChatMessage[]>(DB_KEYS.v2ChatMessages) ?? [];
    const msg: ChatMessage = {
      id: `msg-${uuid()}`,
      chatRoomId,
      senderId,
      senderRole,
      body,
      sentAt: new Date().toISOString(),
    };
    await storageAdapter.set(DB_KEYS.v2ChatMessages, [...messages, msg]);
    return msg;
  },
};
