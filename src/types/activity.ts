/**
 * Activity event types.
 *
 * MVP Phase 1 (Supabase): marketplace events only.
 *   application_received, application_accepted, application_rejected
 *   direct_offer_received, direct_offer_accepted, direct_offer_rejected
 *
 * Future scope:
 *   chat_message_received - chat unread indicator when read state is implemented.
 */
export type ActivityType =
  | 'application_received'
  | 'application_accepted'
  | 'application_rejected'
  | 'direct_offer_received'
  | 'direct_offer_accepted'
  | 'direct_offer_rejected'
  | 'chat_message_received';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  recipientRole: 'technician' | 'company';
  recipientId: string;
  entityId: string;
  read: boolean;
  createdAt: string;
}
