import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import { ChatRoom, ChatMessage } from '../../types/chat';
import { SenderRole } from '../../types/enums';
import { activityRepository } from './activityRepository';

function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface CreateRoomInput {
  offerRequestId?: string;
  offerApplicationId?: string;
  technicianId: string;
  companyId: string;
}

interface SendMessageInput {
  senderUserId: string;
  senderCompanyMemberId?: string;
  senderRole: SenderRole;
  body: string;
}

type StoredChatMessage = ChatMessage & {
  senderId?: string;
};

function normalizeMessage(message: StoredChatMessage): ChatMessage {
  return {
    id: message.id,
    chatRoomId: message.chatRoomId,
    senderUserId: message.senderUserId ?? message.senderId ?? '',
    senderCompanyMemberId: message.senderCompanyMemberId,
    senderRole: message.senderRole,
    body: message.body,
    sentAt: message.sentAt,
  };
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

  /**
   * Local simulation of the server-side chat room creation trigger.
   * Called only from offerRequestRepository.updateStatus() and offerApplicationRepository.updateStatus().
   * Do NOT call directly from UI screens or hooks.
   * Future Supabase: room is created by handle_offer_relation_status_transition() (SECURITY DEFINER trigger).
   */
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
    const messages = await storageAdapter.get<StoredChatMessage[]>(DB_KEYS.v2ChatMessages) ?? [];
    return messages
      .map(normalizeMessage)
      .filter((m) => m.chatRoomId === chatRoomId)
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  },

  async sendMessage(chatRoomId: string, input: SendMessageInput): Promise<ChatMessage> {
    const rooms = await storageAdapter.get<ChatRoom[]>(DB_KEYS.v2ChatRooms) ?? [];
    const room = rooms.find((r) => r.id === chatRoomId);
    if (!room) throw new Error('Chat room not found.');

    const messages = await storageAdapter.get<StoredChatMessage[]>(DB_KEYS.v2ChatMessages) ?? [];
    const msg: ChatMessage = {
      id: `msg-${uuid()}`,
      chatRoomId,
      senderUserId: input.senderUserId,
      senderCompanyMemberId: input.senderCompanyMemberId,
      senderRole: input.senderRole,
      body: input.body,
      sentAt: new Date().toISOString(),
    };
    await storageAdapter.set(DB_KEYS.v2ChatMessages, [...messages.map(normalizeMessage), msg]);

    // Local demo: creates chat_message_received activity for unread chat dot badges.
    // Future Supabase: this is NOT a Phase 1 MVP requirement.
    // Replace with Realtime subscription or per-message read receipts post-launch.
    await activityRepository.create({
      type: 'chat_message_received',
      recipientRole: input.senderRole === 'company' ? 'technician' : 'company',
      recipientId: input.senderRole === 'company' ? room.technicianId : room.companyId,
      entityId: msg.id,
    });

    return msg;
  },
};
