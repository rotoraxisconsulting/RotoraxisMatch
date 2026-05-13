# Future Supabase Migration

RotoraxisMatch will start with:
- JSON seed data
- AsyncStorage local persistence

Later it should migrate to:
- Supabase Auth
- Supabase Postgres
- Supabase Storage

## Current local architecture

Screens/components
→ hooks/stores
→ repositories
→ AsyncStorage adapter

## Future architecture

Screens/components
→ hooks/stores
→ repositories
→ Supabase adapter

## Supabase future tables

- profiles
- technician_profiles
- company_profiles
- technician_documents
- match_requests
- availability_slots

## Future Supabase features

- Auth for real users
- RLS policies for privacy
- private storage bucket for documents
- company/technician/admin roles
- contact request workflow
- identity reveal logic
- email notifications with Resend

## Important

Do not implement Supabase in the MVP.

Keep code prepared so repositories can be replaced later.