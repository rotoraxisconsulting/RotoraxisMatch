export type ActivityType =
  | 'application_received'
  | 'application_accepted'
  | 'application_rejected'
  | 'direct_offer_received'
  | 'direct_offer_accepted'
  | 'direct_offer_rejected';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  recipientRole: 'technician' | 'company';
  recipientId: string;
  entityId: string;
  read: boolean;
  createdAt: string;
}
