import { CompanyMemberRole } from '../types/enums';

// TODO: enforce company role permissions in Supabase RLS during backend phase (V2-9).
// These helpers are frontend-only UI guards. RLS policies in docs/RLS_PLAN_V2.md
// will enforce the same rules server-side once Supabase is connected.

export function canManageCompanyMembers(role: CompanyMemberRole): boolean {
  return role === 'admin';
}

export function canManageCompanySettings(role: CompanyMemberRole): boolean {
  return role === 'admin';
}

export function canManageOffers(role: CompanyMemberRole): boolean {
  return role === 'admin' || role === 'recruiter';
}

export function canSendDirectOffers(role: CompanyMemberRole): boolean {
  return role === 'admin' || role === 'recruiter';
}

export function canReviewApplications(role: CompanyMemberRole): boolean {
  return role === 'admin' || role === 'recruiter';
}

export function canSendChatMessages(role: CompanyMemberRole): boolean {
  return role === 'admin' || role === 'recruiter';
}

export function isCompanyViewer(role: CompanyMemberRole): boolean {
  return role === 'viewer';
}
