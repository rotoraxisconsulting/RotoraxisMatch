# User Flows V2 — RotoraxisMatch

## 1. Technician registration and profile setup

1. User opens app → selects "I am a technician".
2. Creates account (email + password in future auth; demo mode uses local session).
3. Fills profile:
   - firstName, lastName, birthDate
   - technicianType
   - city, country, baseAirport (optional)
   - licenses (if mechanic or avionic)
   - habilitations per license (optional)
   - aircraft experience per type (hours or years)
   - availability (immediately / date / contract types)
   - social links (optional)
4. Uploads documents (license scan, medical, ID, etc.).
5. Profile is in `verificationStatus: pending` until admin verifies.
6. Profile appears in company search only after minimum admin verification.

---

## 2. Company registration and team setup

1. User selects "I am a company".
2. Creates company account:
   - name, companyType, country, city, phone, email
3. First user becomes company `admin`.
4. Admin can invite additional users with `recruiter` or `viewer` role.
5. Company appears in the system after admin verification.

---

## 3. Company publishes a job offer

1. Company user (admin or recruiter) goes to "Job Offers" section.
2. Creates new offer:
   - title, description
   - contractType
   - location
   - requiredTechnicianTypes, requiredLicenses, requiredAircraftTypes
   - minYearsExperience
   - expiresAt (optional)
3. Saves as `draft` or publishes (`status: published`, `visible: true`).
4. Published offer appears in technician job search.
5. Company can close or edit the offer at any time.

---

## 4. Company searches technicians

**Matching rule: a match % is only shown when an offer is selected. Browsing without an offer shows no score.**

### 4a. Offer-centric path (recommended)
1. Company opens a published job offer.
2. Opens "Find Technicians for this Offer".
3. App calls `getTechnicianMatchesForOffer(offerId)` and shows ranked results.
4. Each technician card shows **"X% match for this offer"**.
5. Company can send a direct offer (linked to the open job offer).

### 4b. General technician search (no offer context)
1. Company navigates to "Find Technicians" without selecting an offer.
2. Applies filters: technicianType, licenses, aircraftTypes, availability, location, verificationStatus.
3. Results show anonymous profiles. **No match % is shown.** Cards say **"Select an offer to calculate match"**.
4. Company can still send a direct offer (without a linked job offer).

**Direct offer screen:**
- Company sees: anonymousCode, age, technicianType, licenses, habilitations, experience, availability.
- If an offer was pre-selected, the match score for that offer is shown.
- Company writes optional message.
- Company sends offer → OfferRequest created with `status: pending`.

---

## 5. Technician searches job offers

1. Technician navigates to "Browse Offers".
2. Applies filters: contractType, requiredLicenses, requiredAircraftTypes, location.
3. App calls `getOfferMatchesForTechnician(technicianId)` and shows offers ranked by match %.
4. Each offer card shows **"X% match with your profile"** (score is offer-specific).
5. Technician opens offer detail: title, description, requirements, location, contract type, **match score prominently displayed**.
6. Technician applies:
   - Optional cover note.
   - OfferApplication created with `status: pending`.
6. Company receives notification of application.

---

## 6. Technician reviews received direct offers

1. Technician navigates to "My Offers" → "Received".
2. Sees list of pending OfferRequests.
3. Opens offer detail:
   - Full offer information (including company name, position details).
   - Company remains identified (companies are public entities).
4. Technician accepts or rejects.

---

## 7. Company reviews received applications

1. Company navigates to "My Offers" → selects a JobOffer.
2. Sees list of OfferApplications for that offer.
3. Views anonymous applicant profile (same privacy rules as search).
4. Accepts or rejects.

---

## 8. Acceptance flow (same for both paths)

### When technician accepts an OfferRequest:
1. `OfferRequest.status` → `accepted`
2. `identityRevealed` → `true`
3. `documentsUnlocked` → `true`
4. `ChatRoom` created and linked to the request.
5. Company receives in-app notification.
6. Company can now see: full name, email, phone, documents.
7. Chat tab becomes accessible.

### When company accepts an OfferApplication:
1. `OfferApplication.status` → `accepted`
2. `identityRevealed` → `true`
3. `documentsUnlocked` → `true`
4. `ChatRoom` created and linked.
5. Technician receives in-app notification.
6. Company can now see full technician identity and documents.
7. Chat opens for both parties.

---

## 9. Rejection flow

1. Status → `rejected`.
2. Counter-party receives notification.
3. No chat is created.
4. Identity remains locked.
5. Documents remain locked.
6. Technician profile returns to anonymous state for that company.

---

## 10. Chat flow

- Chat is accessible only from an accepted OfferRequest or OfferApplication.
- No chat screen is visible before acceptance.
- Both parties (technician and company user) can send messages.
- Company viewers cannot send messages (read-only role).
- Messages are stored in ChatMessages linked to the ChatRoom.

---

## 11. Document unlock flow

- Documents are locked by default — companies cannot see them.
- On offer acceptance: `documentsUnlocked` → `true` automatically.
- Company can view document list and statuses (pending / verified / rejected / expired).
- Document files (URLs) are only accessible when `documentsUnlocked === true`.

---

## 12. Admin verification flow

1. Admin opens admin panel.
2. Reviews pending technician profiles:
   - Checks submitted documents.
   - Sets `verificationStatus` to `verified`, `rejected`, or `blocked`.
3. Reviews pending company profiles:
   - Sets `verificationStatus` accordingly.
4. Reviews individual documents:
   - Sets document `status` to `verified`, `rejected`, or `expired`.
5. Can block any user (technician or company) from appearing in the platform.
6. Read-only overview of all offer requests and applications.

---

## Flow summary table

| Flow | Initiator | Result on acceptance |
|------|-----------|---------------------|
| Direct offer | Company | Identity + docs + chat unlocked |
| Job offer application | Technician | Identity + docs + chat unlocked |
| Document upload | Technician | Awaits admin verification |
| Admin verify technician | Admin | Profile appears in search |
| Admin verify company | Admin | Company can publish offers and search |
