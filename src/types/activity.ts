/**
 * Activity event types.
 *
 * MVP Phase 1 (Supabase): marketplace events only.
 *   application_received, application_accepted, application_rejected
 *   direct_offer_received, direct_offer_accepted, direct_offer_rejected
 *
 * Future scope (not Phase 1):
 *   chat_message_received — local demo uses this for chat unread indicators.
 *   Supabase Realtime or a polling mechanism replaces this post-launch.
 */
export type ActivityType =
  | 'application_received'
  | 'application_accepted'
  | 'application_rejected'
  | 'direct_offer_received'
  | 'direct_offer_accepted'
  | 'direct_offer_rejected'
  // Future scope — not required for Phase 1 Supabase migration.
  // Local demo emits this for chat unread dots. Replace with Realtime post-launch.
  | 'chat_message_received';

export type ActivityRecipientScope = 'technician' | 'company';

export type ActivityEntityType =
  | 'offer_request'
  | 'offer_application'
  | 'chat_message';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  recipientScope: ActivityRecipientScope;
  recipientTechnicianId?: string;
  recipientCompanyId?: string;
  actorProfileId?: string;
  entityType: ActivityEntityType;
  entityId: string;
  offerId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityRead {
  activityEventId: string;
  profileId: string;
  readAt: string;
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  recipientRole: 'technician' | 'company';
  recipientId: string;
  entityId: string;
  read: boolean;
  createdAt: string;
}
