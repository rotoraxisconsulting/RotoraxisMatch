import { SenderRole } from './enums';

export interface ChatRoom {
  id: string;
  offerRequestId?: string;
  offerApplicationId?: string;
  technicianId: string;
  companyId: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderRole: SenderRole;
  body: string;
  sentAt: string;
}
