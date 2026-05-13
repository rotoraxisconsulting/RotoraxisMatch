# Product Context — RotoraxisMatch

RotoraxisMatch is a marketplace/matching platform for aviation technicians and companies.

It connects:
- aviation mechanics
- EASA-style technicians
- MROs
- airlines
- operators
- contractors
- recruiters

Main value:
Companies can find verified technicians by license, aircraft type, specialty, availability and location.

Technicians keep their identity private until they accept a contact request.

The product is inspired by vertical matching platforms in aviation, but it must have its own brand, copy and UI.

## Roles

- Technician
- Company
- Admin

## Main flows

1. Technician creates profile.
2. Technician adds licenses, aircraft types, specialties, location, coordinates, availability and documents.
3. Company searches anonymous technicians.
4. Company requests contact.
5. Technician accepts or rejects.
6. If accepted, identity is revealed.
7. Admin verifies technicians, companies and documents.

## MVP goal

The MVP must include:
- public home/landing
- onboarding role selector
- technician dashboard
- company dashboard
- technician search
- technician map
- contact requests
- admin panel
- local persistence with AsyncStorage
- JSON seed data
- architecture prepared for Supabase