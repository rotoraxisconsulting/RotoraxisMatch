import { supabase } from '../../lib/supabase';
import { ChatRoom, ChatMessage } from '../../types/chat';
import { SenderRole } from '../../types/enums';
import { mapChatMessageRow, mapChatRoomRow, throwIfError } from './supabaseMappers';

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

const ROOM_FIELDS = 'id, offer_request_id, offer_application_id, technician_id, company_id, created_at';
const MESSAGE_FIELDS = 'id, chat_room_id, sender_user_id, sender_company_member_id, sender_role, body, sent_at';

export const chatRepository = {
  async getRoom(id: string): Promise<ChatRoom | null> {
    const { data, error } = await supabase
      .from('chat_rooms')
      .select(ROOM_FIELDS)
      .eq('id', id)
      .maybeSingle();
    throwIfError(error);
    return data ? mapChatRoomRow(data as any) : null;
  },

  async getRoomsForTechnician(technicianId: string): Promise<ChatRoom[]> {
    const { data, error } = await supabase
      .from('chat_rooms')
      .select(ROOM_FIELDS)
      .eq('technician_id', technicianId)
      .order('created_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapChatRoomRow);
  },

  async getRoomsForCompany(companyId: string): Promise<ChatRoom[]> {
    const { data, error } = await supabase
      .from('chat_rooms')
      .select(ROOM_FIELDS)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapChatRoomRow);
  },

  async getOrCreateRoom(input: CreateRoomInput): Promise<ChatRoom> {
    const query = supabase.from('chat_rooms').select(ROOM_FIELDS);
    const existingQuery = input.offerRequestId
      ? query.eq('offer_request_id', input.offerRequestId)
      : input.offerApplicationId
        ? query.eq('offer_application_id', input.offerApplicationId)
        : query.eq('technician_id', input.technicianId).eq('company_id', input.companyId);
    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    throwIfError(existingError);
    if (existing) return mapChatRoomRow(existing as any);

    const { data, error } = await supabase
      .from('chat_rooms')
      .insert({
        offer_request_id: input.offerRequestId ?? null,
        offer_application_id: input.offerApplicationId ?? null,
        technician_id: input.technicianId,
        company_id: input.companyId,
      })
      .select(ROOM_FIELDS)
      .single();
    throwIfError(error);
    return mapChatRoomRow(data as any);
  },

  async getMessages(chatRoomId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(MESSAGE_FIELDS)
      .eq('chat_room_id', chatRoomId)
      .order('sent_at', { ascending: true });
    throwIfError(error);
    return ((data ?? []) as any[]).map(mapChatMessageRow);
  },

  async sendMessage(chatRoomId: string, input: SendMessageInput): Promise<ChatMessage> {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        chat_room_id: chatRoomId,
        sender_user_id: input.senderUserId,
        sender_company_member_id: input.senderCompanyMemberId ?? null,
        sender_role: input.senderRole,
        body: input.body,
      })
      .select(MESSAGE_FIELDS)
      .single();
    throwIfError(error);
    return mapChatMessageRow(data as any);
  },
};
