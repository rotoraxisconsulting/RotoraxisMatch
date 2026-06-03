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
  senderUserId: string;
  senderCompanyMemberId?: string;
  senderRole: SenderRole;
  body: string;
  sentAt: string;
}
