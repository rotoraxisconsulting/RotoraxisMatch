# Store privacy declarations

Last technical review: 14 August 2026  
App: Aviation Job Talent  
iOS bundle ID / Android package: `com.aviationjobtalent.app`

This is the repository source of truth for App Store Connect App Privacy and
Google Play Data safety. Store forms live outside the repository and must be
kept in sync with this document whenever data collection, an SDK, a provider
or a permission changes.

## Release status

The code-level data inventory, iOS privacy manifest, Android permission guard,
public legal routes and console-answer worksheet are prepared. A public store
submission still requires these external or business decisions:

- Replace `[LEGAL_ENTITY_NAME]`, `[LEGAL_ADDRESS]` and
  `[LEGAL_JURISDICTION]` in the legal documents. The support and privacy
  addresses already used elsewhere in the app have been filled in; confirm
  both mailboxes exist and are monitored before publishing.
- Decide the deletion behaviour for the only administrator of a company. The
  current function requires another administrator to be assigned first; this
  is a store-review risk and cannot be changed safely without deciding whether
  the company and offers should be deleted, preserved or transferred.
- Decide a defensible retention period for deleted-account tombstones, the
  retained technician professional/relationship record, company invitation
  logs and external authentication/security logs. Both technician and company
  tombstones retain the original account UUID; the current Privacy Policy
  describes what remains but does not invent a period that the implementation
  does not enforce.
- Enforce the Terms' 18+ technician rule in both the signup UI and database,
  or revise that eligibility rule. The current fixed year range still permits
  some under-18 dates.
- Deploy `/privacy-policy` and `/delete-account` on the final public HTTPS
  domain. Neither URL may require authentication merely to read the page.
- Enter the answers below in App Store Connect and Play Console; repository
  configuration does not submit either questionnaire automatically.
- Complete Google Play's Health apps declaration for the medical-certificate
  verification feature and make its answers consistent with Data safety and
  this Privacy Policy.
- Verify that the Play Console developer is an Organization account with the
  correct legal name/address and D-U-N-S number. Google lists health apps among
  the services that require an Organization account; its updated Play Console
  Requirements take effect on 30 September 2026.
- Confirm the contractual/privacy role and retention practices of Supabase,
  countries.dev, OpenStreetMap Foundation, jsDelivr, unpkg and FlagCDN.
- Audit the existing `technician-documents` bucket once for historic orphaned
  objects created before failed database inserts were automatically rolled
  back.
- Account deletion spans Supabase Storage and Auth, so it is not a single
  transaction. The function now enumerates and verifies the technician-owned
  folder before deleting Auth, but a concurrent upload already in flight can
  still race that boundary. Add a server-enforced `deleting` state plus
  post-deletion cleanup/monitoring before treating the workflow as atomic.
- Generate production iOS and Android builds. Inspect Apple's privacy report,
  upload to TestFlight, and verify the merged Android manifest before release.

Adding analytics, crash reporting, advertising, attribution, social login,
push notifications or another native SDK invalidates part of this inventory
and requires a new review.

## Product facts used for the declarations

- Supabase provides authentication, database, storage, realtime and server
  functions. Supabase Auth audit logs can include user ID, IP address, user
  agent, action and timestamp.
- Signup stores the legal-text version and acceptance time in Auth metadata.
  If email confirmation delays the authenticated session, the first confirmed
  session creates the matching append-only `user_consents` audit row using
  that original version and time. The row is retained while the account is
  active and is removed by the account-deletion cascade.
- There is no advertising, attribution or third-party analytics SDK and no use
  of data for cross-app or cross-site tracking.
- Location is entered as a country and optional city; the app does not request
  GPS location. Directory coordinates describe a city, not a device's live
  position.
- The app does not request contacts, microphone or advertising identifiers.
- Documents are selected through the operating-system document picker. PDF,
  JPEG, PNG and WebP can be uploaded. Medical uploads have a separate consent
  control, and its audit row must succeed before the file is transmitted.
- Before acceptance, companies see a privacy-limited technician profile. After
  the relevant application or direct offer is accepted, they can see identity,
  contact details and verified professional documents. Medical and identity
  documents remain admin-only.
- The device calls countries.dev for city searches, OpenStreetMap Foundation
  for map tiles, jsDelivr/unpkg for Leaflet assets, and FlagCDN for flags. These
  requests can expose search or requested-resource data plus ordinary network
  metadata such as IP address and user agent to those providers.
- Account deletion is available in-app. Once the public web build is deployed,
  `/delete-account` also lets a user sign in and delete without reinstalling
  the mobile app; email is the fallback.
- Account deletion retains the original account UUID for both roles in the
  deleted `profiles` row, a non-deliverable technical email value and retained
  message-sender references. Technician professional/relationship history can
  also remain. These records are pseudonymous, not anonymous.

## Canonical data inventory

| Data | Examples and source | Required? | Linked? | Main purpose / recipient |
|---|---|---:|---:|---|
| Name | Technician and company-member name | Required | Yes | Account and marketplace; connected users |
| Email | Login, contact and invitation email | Required | Yes | Authentication, communication, security; connected users/invite recipient |
| Phone | Technician/company contact number | Optional | Yes | Contact after the privacy gate opens |
| Other contact info | LinkedIn, Instagram, website | Optional | Yes | Professional/company profile; connected users |
| User/account IDs | Supabase UUID, anonymous technician code and membership; the original UUID remains in technician and company deleted-account records and retained message-sender references | Automatic | Yes | Authentication, authorisation, privacy gates and retained relationship integrity |
| Date of birth | Technician signup | Required for technicians | Yes | Account eligibility record; not shown to companies |
| Coarse location | Country, optional city and city centroid | Country required | Yes | Search, maps, matching and personalisation; marketplace users/map provider |
| Professional information | Types, availability, contracts, experience, licences, ratings | Mixed | Yes | Profile, verification, search and matching; companies |
| Company/offer content | Company details; offer title, description, requirements and dates | Mixed | Yes | Marketplace; technicians |
| Applications/direct offers | Status, cover note/message, response and connection flags | User initiated | Yes | Marketplace workflow; counterpart |
| Chat | Message, sender, room and timestamp | Optional | Yes | Communication; counterpart |
| Files/document metadata | Filename, type, path, review/expiry and PDF/image content | Optional | Yes | Verification; permitted professional files to connected company |
| Health | Medical certificate and metadata | Optional with consent | Yes | Admin verification only |
| Activity | Application, offer, chat and read events/status | Automatic in used features | Yes | Functionality and unread indicators; some status shared with counterpart |
| City search history | Query text and country filter | Optional | Potentially linked by network/account context | City results; countries.dev |
| Catalogue requests | Free text, context, status and admin notes | Optional | Yes | Maintain professional catalogues |
| Team invitations | Invitee email, inviter/company ID and time | Optional | Yes | Invitations and abuse prevention |
| Authentication/security logs | User ID, IP, user agent, event and time | Automatic | Yes | Authentication, fraud prevention and security |
| Network/resource request data | IP, user agent, requested tiles/assets/flags | Automatic when feature loads | Provider-dependent | Deliver maps and UI resources |
| Consent records | Type, version and timestamp | Automatic after action | Yes | Compliance evidence |
| Deletion feedback | Role, reason, optional comment and calendar day | Optional | No stored account ID; indirect identification remains possible | Service analytics |

Passwords are handled by Supabase Auth and are not stored in readable form by
the application. Session tokens are authentication secrets stored on the
platform so the user can remain signed in; they are not advertising IDs.

## Apple App Privacy — App Store Connect

Answer **Yes, data is collected**. The conservative selections below reflect
the app plus third-party requests. Every type is linked to the user and used
without tracking. “Linked” does not mean that every other marketplace user can
see it.

| Apple data type | Linked | Tracking | Purposes |
|---|---:|---:|---|
| Contact Info → Name | Yes | No | App Functionality |
| Contact Info → Email Address | Yes | No | App Functionality |
| Contact Info → Phone Number | Yes | No | App Functionality |
| Contact Info → Other User Contact Info | Yes | No | App Functionality |
| Location → Coarse Location | Yes | No | App Functionality; Product Personalization |
| Health & Fitness → Health | Yes | No | App Functionality |
| User Content → Emails or Text Messages | Yes | No | App Functionality |
| User Content → Photos or Videos | Yes | No | App Functionality |
| User Content → Other User Content | Yes | No | App Functionality; Analytics |
| Search History → Search History | Yes | No | App Functionality |
| Identifiers → User ID | Yes | No | App Functionality |
| Identifiers → Device ID | Yes | No | App Functionality |
| Usage Data → Product Interaction | Yes | No | App Functionality |
| Other Data → Other Data Types | Yes | No | App Functionality; Product Personalization |

The Device ID entry is intentionally conservative because linked security logs
and external resource requests use IP/user-agent data. Apple instructs
developers to classify retained IP addresses according to their use, which can
include device identifiers or diagnostics.

Search History is likewise conservative until countries.dev confirms whether
queries are retained beyond serving the request. If the provider documents no
retention, remove Search History from the Apple manifest/label (Google still
counts transmission off-device). If no provider uses IP/user-agent to identify
a device, remove Device ID rather than declaring the same network data under
multiple types.

Do **not** select precise location, contacts/address book, audio, payment or
financial information, purchases, browsing history, advertising data, crash
data, performance data or other diagnostic data for the current build. Auth
security events are accounted for as linked identifiers and product
interactions, not crash/performance diagnostics. Device ID above does not mean
the app accesses an advertising ID; it does not.

The same collected types are encoded in `expo.ios.privacyManifests` in
`app.json`. The manifest also aggregates required-reason APIs from React
Native, Expo Constants, Expo FileSystem and AsyncStorage:

- File timestamp: `C617.1`, `0A2A.1`, `3B52.1`
- Disk space: `E174.1`, `85F4.1`
- User defaults: `CA92.1`
- System boot time: `35F9.1`

App Store Connect remains authoritative for the public Privacy Nutrition
Label; the bundled manifest does not replace its questionnaire.

## Google Play — Data safety

### Overview answers

- Does the app collect or share required user data types? **Yes**.
- Is all user data encrypted in transit? **Yes**, provided every production
  environment variable continues to use HTTPS/TLS.
- Can users request deletion? **Yes** in-app. Also answer for the public
  `/delete-account` resource after that URL has been deployed and verified.
- Does the app allow account creation? **Yes**.
- Is data used for advertising or marketing? **No** in the current build.

The `Shared` answers below are deliberately conservative. Google has
exceptions for service providers and specific user-initiated transfers that a
user reasonably expects. However, this product also exposes a limited profile
before a match and makes direct requests to independent map/directory/CDN
providers. Do not change a row to `No` without confirming both the product
disclosure and the recipient's contractual role.

| Google data type | Collected | Shared | Required/optional | Ephemeral? | Purposes |
|---|---:|---:|---|---:|---|
| Location → Approximate location | Yes | Yes | Required | No | App functionality; Personalization |
| Personal info → Name | Yes | Yes | Required | No | App functionality; Account management |
| Personal info → Email address | Yes | Yes | Required | No | App functionality; Account management; Developer communications; Security |
| Personal info → Phone number | Yes | Yes | Optional | No | App functionality; Account management |
| Personal info → User IDs | Yes | Yes | Required | No | App functionality; Account management; Security |
| Personal info → Other info | Yes | Yes | Required | No | App functionality; Account management; Personalization |
| Health and fitness → Health info | Yes | No | Optional | No | App functionality |
| Messages → Other in-app messages | Yes | Yes | Optional | No | App functionality |
| Photos and videos → Photos | Yes | Yes | Optional | No | App functionality |
| Files and docs → Files and docs | Yes | Yes | Optional | No | App functionality |
| App activity → App interactions | Yes | Yes | Required | No | App functionality; Security |
| App activity → In-app search history | Yes | Yes | Optional | **TBD — countries.dev retention** | App functionality |
| App activity → Other user-generated content | Yes | Yes | Optional | No | App functionality; Personalization; Analytics |
| Device or other IDs → Device or other IDs | Yes | Yes | Required | No | App functionality; Security |

Do **not** select precise location, physical address, contacts, email/SMS inbox
content, videos, audio, calendar, web browsing history, installed apps,
financial data or advertising data for this build. Chat belongs under **Other
in-app messages**, not SMS/MMS.

None of the categories stored by the first-party application is processed only
ephemerally. Whether request metadata handled by each external provider is
ephemeral remains a provider-contract/retention question and must be answered
per provider. For Google's required/optional question, use the console's
current rule: if a type is required for any supported account flow, report it
as required globally.

Health info is marked **Shared: No** because it is restricted to the
developer's admin team and Supabase acts as a processor/service provider under
its [Data Processing Addendum](https://supabase.com/downloads/docs/Supabase%2BDPA%2B260601.pdf);
it is never exposed to companies. Confirm that the production project remains
governed by that DPA before copying this answer to Play Console. This
service-provider exception does not change the separate answer **Collected:
Yes**.

### Google Play — Health apps declaration

Do not select **My app doesn't provide any health features**: the app accesses
a voluntarily uploaded medical certificate to support a non-health employment
verification feature.

Use these proposed answers in the current console:

- Health feature: **Other (please specify)**, if that option is present.
- Description: **Technicians may voluntarily upload an aviation medical
  certificate. Aviation Job Talent stores it in a private bucket and allows
  only the platform admin team to review it as a professional credential.
  Companies cannot access it. The app provides no diagnosis, treatment,
  medical advice, Health Connect integration or health-device permissions.**
- Medical Device Apps: **No**.
- Health Connect / Android health permissions: **None**.
- Store-listing disclaimer: **Aviation Job Talent is not a medical device and
  does not diagnose, treat, cure or prevent any medical condition.**

If the current form does not offer **Other**, save it as a draft and confirm
the category with Play support. **Healthcare Services and Management** is the
nearest listed medical category because a certificate is stored as a record,
but the app does not provide healthcare services, so do not assert that
category without confirmation.

If provider research later removes the conservative Apple Search History or
Device ID entries, update the Apple table, `app.json` and
`EXPECTED_DATA_TYPES` in `scripts/validateStorePrivacy.ts` together.

## External providers to verify before submission

| Provider | Feature | Data sent directly | Release check |
|---|---|---|---|
| Supabase | Auth, DB, Storage, Realtime, functions | All backend/account data; IP/user agent in Auth logs | DPA, subprocessors, region, retention and TLS |
| countries.dev / GeoNames data | City search | Search term, country filter, IP/user agent | Provider privacy/retention and availability |
| OpenStreetMap Foundation | Map tiles | Tile coordinates, IP/user agent/request metadata | Current tile/privacy policy and usage compliance |
| jsDelivr and unpkg | Leaflet code/styles | Requested asset, IP/user agent | Current privacy terms or bundle locally |
| FlagCDN | Flag images | Country flag request, IP/user agent | Current privacy terms or bundle locally |

## Console URLs

Once the final domain is live, use:

- Privacy policy: `https://<PUBLIC_DOMAIN>/privacy-policy`
- Account deletion: `https://<PUBLIC_DOMAIN>/delete-account`

The policy must be public, active, non-geofenced and not a PDF. The deletion
URL must allow a user to initiate deletion without reinstalling the app.

## Release review procedure

1. Run `npm run validate:store-privacy`.
2. Run `npm run ts`, the existing tests and `npx expo-doctor`.
3. Inspect `npx expo config --type introspect` for the generated iOS privacy
   manifest and Android permissions.
4. Compare every production SDK, backend recipient and externally configured
   service with this inventory.
5. Complete App Store Connect App Privacy and Google Play Data safety/Data
   deletion using the current console wording.
6. Complete Google Play's Health apps declaration for medical-certificate
   verification and reconcile it with the Data safety answers.
7. Verify the Play Console Organization account, legal details and D-U-N-S
   number.
8. Upload internal builds; inspect Apple's privacy report and Play Console
   policy warnings before public review.

## Official references

- [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Expo Apple privacy manifests](https://docs.expo.dev/guides/apple-privacy/)
- [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Google Play Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en)
- [Google Play Health Content and Services](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en)
- [Google Play developer account requirements](https://support.google.com/googleplay/android-developer/answer/10840893?hl=en)

This inventory reduces rejection risk but cannot guarantee approval and is not
a substitute for legal review. Store declarations must describe the exact
binary and production configuration submitted.
