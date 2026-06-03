// ============================================================
// LOCAL DEMO SEED VALIDATOR — NOT a Supabase migration tool
// ============================================================
// Validates the integrity of local demo JSON seeds in src/data/seeds/.
// These seeds are used by localDatabase.ts for AsyncStorage/demo mode only.
//
// This validator checks local demo seed integrity only. Local demo IDs are
// intentionally not Supabase UUIDs.
//
// Local demo IDs (tech-001, comp-001, prof-t001, etc.) are intentionally
// human-readable and are NOT Supabase UUIDs. This script does NOT check
// UUID format — that check is irrelevant for the local demo.
//
// Supabase starts clean (catalog data only). These seeds must NOT be
// inserted directly into a Supabase database.
// ============================================================
const fs = require('fs');
const path = require('path');
const seedsPath = path.join(__dirname, '..', 'src', 'data', 'seeds');
const read = (f) => JSON.parse(fs.readFileSync(path.join(seedsPath, f), 'utf8'));
const activities = read('activities.json');

const techProfiles = read('technicianProfiles.json');
const companies = read('companies.json');
const offers = read('offers.json');
const offerRequests = read('offerRequests.json');
const offerApplications = read('offerApplications.json');
const licenses = read('technicianLicenses.json');
const habilitations = read('technicianHabilitations.json');
const experience = read('technicianAircraftExperience.json');
const documents = read('documents.json');
const companyMembers = read('companyMembers.json');
const profiles = read('profiles.json');
const chatRooms = read('chatRooms.json');
const chatMessages = read('chatMessages.json');
const offerRequiredAircraftTypes = read('offerRequiredAircraftTypes.json');
const offerRequiredTechnicianTypes = read('offerRequiredTechnicianTypes.json');
const offerRequiredLicenses = read('offerRequiredLicenses.json');
const locationCatalogText = fs.readFileSync(path.join(__dirname, '..', 'src', 'constants', 'locationCities.ts'), 'utf8');
const aircraftTypesText = fs.readFileSync(path.join(__dirname, '..', 'src', 'constants', 'aircraftTypes.ts'), 'utf8');

const techIds = new Set(techProfiles.map((t) => t.id));
const companyIds = new Set(companies.map((c) => c.id));
const offerIds = new Set(offers.map((o) => o.id));
const profileIds = new Set(profiles.map((p) => p.id));
const profileById = new Map(profiles.map((p) => [p.id, p]));
const techByUserId = new Map(techProfiles.map((t) => [t.userId, t]));
const companyMemberById = new Map(companyMembers.map((m) => [m.id, m]));

const VALID_PROFILE_ROLES = new Set(['technician', 'company_user', 'admin']);
const VALID_USER_STATUSES = new Set(['pending_verification', 'active', 'blocked', 'suspended']);
const VALID_OFFER_REQ_STATUSES = new Set(['pending', 'accepted', 'rejected', 'expired', 'withdrawn']);
const ACTIVE_OFFER_RELATION_STATUSES = new Set(['pending', 'accepted']);
const VALID_DOC_STATUSES = new Set(['pending', 'verified', 'rejected', 'expired']);
const VALID_VER_STATUSES = new Set(['pending', 'verified', 'rejected']);
const VALID_OFFER_STATUSES = new Set(['draft', 'published', 'closed', 'expired']);
const VALID_LICENSE_CODES = new Set(['A1','A2','A3','A4','B1.1','B1.2','B1.3','B1.4','B2','B2L','B3','L','C']);
const VALID_TECHNICIAN_TYPE_CODES = new Set(['mechanic', 'avionic', 'sheet_metal_worker', 'painter', 'composite', 'pilot']);
const VALID_COMPANY_TYPE_CODES = new Set(['MRO', 'airline', 'recruitment_agency', 'helicopter_operator', 'other']);
const VALID_CONTRACT_TYPE_CODES = new Set(['permanent', 'long_term', 'short_term']);
const VALID_COMPANY_MEMBER_ROLES = new Set(['admin', 'recruiter', 'viewer']);
const LOCATION_BY_ID = new Map();
let currentCountry = null;
for (const line of locationCatalogText.split(/\r?\n/)) {
  const countryMatch = line.match(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z][^:]*)):\s*\[/);
  if (countryMatch) currentCountry = countryMatch[1] || countryMatch[2] || countryMatch[3];

  const entryMatch = line.match(/id: '([^']+)'.*?city: '([^']+)'.*?icao: '([^']+)'.*?iata: '([^']*)'/);
  if (entryMatch && currentCountry) {
    LOCATION_BY_ID.set(entryMatch[1], {
      country: currentCountry,
      city: entryMatch[2],
      baseAirport: entryMatch[4] || entryMatch[3],
    });
  }
}
const VALID_LOCATION_CITY_IDS = new Set(LOCATION_BY_ID.keys());

const VALID_AIRCRAFT_TYPE_CODES = new Set();
const AIRCRAFT_CATEGORY_MAP = new Map(); // code -> 'airplane' | 'helicopter'
{
  const seenAircraftCodes = new Set();
  const duplicateAircraftCodes = [];
  let currentCode = null;
  for (const line of aircraftTypesText.split(/\r?\n/)) {
    const codeMatch = line.match(/\{\s*code:\s*'([^']+)'/);
    if (codeMatch) {
      currentCode = codeMatch[1];
      if (seenAircraftCodes.has(currentCode)) duplicateAircraftCodes.push(currentCode);
      seenAircraftCodes.add(currentCode);
      VALID_AIRCRAFT_TYPE_CODES.add(currentCode);
    }
    if (currentCode) {
      const catMatch = line.match(/aircraftCategory:\s*'(airplane|helicopter)'/);
      if (catMatch) {
        AIRCRAFT_CATEGORY_MAP.set(currentCode, catMatch[1]);
        currentCode = null;
      }
    }
  }
  if (duplicateAircraftCodes.length > 0) {
    VALID_AIRCRAFT_TYPE_CODES._duplicates = duplicateAircraftCodes;
  }
}

const errors = [];

if (VALID_AIRCRAFT_TYPE_CODES._duplicates && VALID_AIRCRAFT_TYPE_CODES._duplicates.length > 0) {
  errors.push('Aircraft type catalog (aircraftTypes.ts) has duplicate codes: ' + VALID_AIRCRAFT_TYPE_CODES._duplicates.join(', '));
}

// Every catalog entry must have an aircraftCategory
const missingCategory = [...VALID_AIRCRAFT_TYPE_CODES].filter((code) => !AIRCRAFT_CATEGORY_MAP.has(code));
if (missingCategory.length > 0) {
  errors.push('Aircraft type catalog entries missing aircraftCategory: ' + missingCategory.join(', '));
}

const warnings = [];

// profiles
for (const p of profiles) {
  if (!VALID_PROFILE_ROLES.has(p.role)) errors.push('profile ' + p.id + ': invalid role ' + p.role);
  if (!VALID_USER_STATUSES.has(p.status)) errors.push('profile ' + p.id + ': invalid status ' + p.status);
}

// offerRequests
// Duplicate active direct offer rule: only one active (pending or accepted) direct offer
// per companyId + technicianId + offerId. Rejected/expired/withdrawn are historical records
// and multiple of them for the same key are allowed.
const seenActiveDirect = new Set();
for (const r of offerRequests) {
  if (r.kind !== 'direct_offer') errors.push('oreq ' + r.id + ': kind must be direct_offer, got ' + r.kind);
  if (!VALID_OFFER_REQ_STATUSES.has(r.status)) errors.push('oreq ' + r.id + ': invalid status ' + r.status);
  if (!techIds.has(r.technicianId)) errors.push('oreq ' + r.id + ': technicianId ' + r.technicianId + ' not found');
  if (!companyIds.has(r.companyId)) errors.push('oreq ' + r.id + ': companyId ' + r.companyId + ' not found');
  if (r.offerId && !offerIds.has(r.offerId)) errors.push('oreq ' + r.id + ': offerId ' + r.offerId + ' not found');
  if (r.offerId) {
    const offerObj = offers.find((o) => o.id === r.offerId);
    if (offerObj && offerObj.companyId !== r.companyId)
      errors.push('oreq ' + r.id + ': companyId mismatch (offer.companyId=' + offerObj.companyId + ')');
  }
  const isAccepted = r.status === 'accepted';
  if (isAccepted && (!r.identityRevealed || !r.documentsUnlocked))
    errors.push('oreq ' + r.id + ': accepted but identityRevealed=' + r.identityRevealed + ' documentsUnlocked=' + r.documentsUnlocked);
  if (!isAccepted && (r.identityRevealed || r.documentsUnlocked))
    errors.push('oreq ' + r.id + ': status=' + r.status + ' but identityRevealed=' + r.identityRevealed + ' or documentsUnlocked=' + r.documentsUnlocked);
  if (r.status === 'pending' || r.status === 'accepted') {
    const key = r.companyId + '|' + r.technicianId + '|' + (r.offerId || '');
    if (seenActiveDirect.has(key)) errors.push('oreq ' + r.id + ': duplicate active (pending/accepted) direct offer for same companyId+technicianId+offerId');
    seenActiveDirect.add(key);
  }
}

// offerApplications
// One application per technician per offer regardless of status (mirrors UNIQUE(technician_id, offer_id))
const seenAppPairs = new Set();
for (const a of offerApplications) {
  if (a.kind !== 'application') errors.push('oapp ' + a.id + ': kind must be application, got ' + a.kind);
  if (!VALID_OFFER_REQ_STATUSES.has(a.status)) errors.push('oapp ' + a.id + ': invalid status ' + a.status);
  if (!techIds.has(a.technicianId)) errors.push('oapp ' + a.id + ': technicianId ' + a.technicianId + ' not found');
  if (!companyIds.has(a.companyId)) errors.push('oapp ' + a.id + ': companyId ' + a.companyId + ' not found');
  if (!offerIds.has(a.offerId)) errors.push('oapp ' + a.id + ': offerId ' + a.offerId + ' not found');
  const offerObj = offers.find((o) => o.id === a.offerId);
  if (offerObj && offerObj.companyId !== a.companyId)
    errors.push('oapp ' + a.id + ': companyId mismatch (offer.companyId=' + offerObj.companyId + ')');
  const isAccepted = a.status === 'accepted';
  if (isAccepted && (!a.identityRevealed || !a.documentsUnlocked))
    errors.push('oapp ' + a.id + ': accepted but identityRevealed=' + a.identityRevealed + ' documentsUnlocked=' + a.documentsUnlocked);
  if (!isAccepted && (a.identityRevealed || a.documentsUnlocked))
    errors.push('oapp ' + a.id + ': status=' + a.status + ' but identityRevealed=' + a.identityRevealed + ' or documentsUnlocked=' + a.documentsUnlocked);
  const appKey = a.technicianId + '|' + a.offerId;
  if (seenAppPairs.has(appKey)) errors.push('oapp ' + a.id + ': duplicate application for same technicianId+offerId (status=' + a.status + ')');
  seenAppPairs.add(appKey);
}

const activeDirectByTechOffer = new Map();
for (const r of offerRequests) {
  if (!r.offerId || !ACTIVE_OFFER_RELATION_STATUSES.has(r.status)) continue;
  activeDirectByTechOffer.set(r.technicianId + '|' + r.offerId, r);
}
for (const a of offerApplications) {
  if (!ACTIVE_OFFER_RELATION_STATUSES.has(a.status)) continue;
  const direct = activeDirectByTechOffer.get(a.technicianId + '|' + a.offerId);
  if (direct) {
    errors.push(
      'oapp ' + a.id + ' / oreq ' + direct.id +
      ': active application and active direct offer cannot coexist for technicianId=' +
      a.technicianId + ' offerId=' + a.offerId,
    );
  }
}

// documents
for (const d of documents) {
  if (!techIds.has(d.technicianId)) errors.push('doc ' + d.id + ': technicianId ' + d.technicianId + ' not found');
  if (!VALID_DOC_STATUSES.has(d.status)) errors.push('doc ' + d.id + ': invalid status ' + d.status);
  if (!d.storagePath) errors.push('doc ' + d.id + ': missing storagePath');
}

// licenses
for (const l of licenses) {
  if (!techIds.has(l.technicianId)) errors.push('license ' + l.id + ': technicianId ' + l.technicianId + ' not found');
  if (!VALID_LICENSE_CODES.has(l.licenseCode)) errors.push('license ' + l.id + ': invalid licenseCode ' + l.licenseCode);
}

// habilitations
for (const h of habilitations) {
  if (!techIds.has(h.technicianId)) errors.push('hab ' + h.id + ': technicianId ' + h.technicianId + ' not found');
  if (!VALID_LICENSE_CODES.has(h.licenseCode)) errors.push('hab ' + h.id + ': invalid licenseCode ' + h.licenseCode);
  if (!h.aircraftTypeCode) errors.push('hab ' + h.id + ': missing aircraftTypeCode');
  else if (h.aircraftTypeCode === 'GENERAL') errors.push('hab ' + h.id + ': aircraftTypeCode "GENERAL" is not a valid catalog code');
  else if (!VALID_AIRCRAFT_TYPE_CODES.has(h.aircraftTypeCode)) errors.push('hab ' + h.id + ': invalid aircraftTypeCode ' + h.aircraftTypeCode);
}

// aircraft experience
for (const e of experience) {
  if (!techIds.has(e.technicianId)) errors.push('exp ' + e.id + ': technicianId ' + e.technicianId + ' not found');
  if (e.unit !== 'hours' && e.unit !== 'years') errors.push('exp ' + e.id + ': invalid unit ' + e.unit);
  if (e.aircraftTypeCode === 'GENERAL')
    errors.push('exp ' + e.id + ': aircraftTypeCode "GENERAL" is not a valid catalog code — create per-aircraft entries with real codes');
  else if (!VALID_AIRCRAFT_TYPE_CODES.has(e.aircraftTypeCode))
    errors.push('exp ' + e.id + ': invalid aircraftTypeCode ' + e.aircraftTypeCode);
}

// offers
for (const o of offers) {
  if (!companyIds.has(o.companyId)) errors.push('offer ' + o.id + ': companyId ' + o.companyId + ' not found');
  if (!VALID_OFFER_STATUSES.has(o.status)) errors.push('offer ' + o.id + ': invalid status ' + o.status);
  if (!VALID_CONTRACT_TYPE_CODES.has(o.contractType)) errors.push('offer ' + o.id + ': invalid contractType ' + o.contractType);
  if (o.visible !== (o.status === 'published'))
    errors.push('offer ' + o.id + ': visible must equal (status === "published")');
  if (!o.locationCityId) errors.push('offer ' + o.id + ': missing locationCityId');
  if (o.locationCityId && !VALID_LOCATION_CITY_IDS.has(o.locationCityId))
    errors.push('offer ' + o.id + ': invalid locationCityId ' + o.locationCityId);
  const offerLocation = LOCATION_BY_ID.get(o.locationCityId);
  if (offerLocation) {
    if (o.locationCountry !== offerLocation.country)
      errors.push('offer ' + o.id + ': locationCountry must match catalog snapshot ' + offerLocation.country);
    if (o.locationCity !== offerLocation.city)
      errors.push('offer ' + o.id + ': locationCity must match catalog snapshot ' + offerLocation.city);
    if (o.locationBaseAirport !== offerLocation.baseAirport)
      errors.push('offer ' + o.id + ': locationBaseAirport must match catalog snapshot ' + offerLocation.baseAirport);
  }
}

// offerRequiredTechnicianTypes — composite PK: (offerId, technicianTypeCode). Local rows may also have an id field.
const seenTypePairs = new Set();
for (const ort of offerRequiredTechnicianTypes) {
  if (!offerIds.has(ort.offerId)) errors.push('ort ' + (ort.id || '?') + ': offerId ' + ort.offerId + ' not found');
  if (!VALID_TECHNICIAN_TYPE_CODES.has(ort.technicianTypeCode)) errors.push('ort ' + (ort.id || '?') + ': invalid technicianTypeCode ' + ort.technicianTypeCode);
  const typePairKey = ort.offerId + '|' + ort.technicianTypeCode;
  if (seenTypePairs.has(typePairKey)) errors.push('ort ' + (ort.id || '?') + ': duplicate composite key offerId+technicianTypeCode');
  seenTypePairs.add(typePairKey);
}

// offerRequiredLicenses — composite PK: (offerId, licenseCode). Local rows may also have an id field.
const seenLicPairs = new Set();
for (const orl of offerRequiredLicenses) {
  if (!offerIds.has(orl.offerId)) errors.push('orl ' + (orl.id || '?') + ': offerId ' + orl.offerId + ' not found');
  if (!VALID_LICENSE_CODES.has(orl.licenseCode)) errors.push('orl ' + (orl.id || '?') + ': invalid licenseCode ' + orl.licenseCode);
  const licPairKey = orl.offerId + '|' + orl.licenseCode;
  if (seenLicPairs.has(licPairKey)) errors.push('orl ' + (orl.id || '?') + ': duplicate composite key offerId+licenseCode');
  seenLicPairs.add(licPairKey);
}

// offerRequiredAircraftTypes — composite PK: (offerId, aircraftTypeCode). Local rows may also have an id field.
const oratByOffer = new Map();
const seenAcftPairs = new Set();
for (const orat of offerRequiredAircraftTypes) {
  if (!offerIds.has(orat.offerId)) errors.push('orat ' + (orat.id || '?') + ': offerId ' + orat.offerId + ' not found');
  if (orat.aircraftTypeCode === 'GENERAL') errors.push('orat ' + (orat.id || '?') + ': aircraftTypeCode "GENERAL" is not a valid catalog code');
  else if (!VALID_AIRCRAFT_TYPE_CODES.has(orat.aircraftTypeCode)) errors.push('orat ' + (orat.id || '?') + ': invalid aircraftTypeCode ' + orat.aircraftTypeCode);
  const acftPairKey = orat.offerId + '|' + orat.aircraftTypeCode;
  if (seenAcftPairs.has(acftPairKey)) errors.push('orat ' + (orat.id || '?') + ': duplicate composite key offerId+aircraftTypeCode');
  seenAcftPairs.add(acftPairKey);
  if (!oratByOffer.has(orat.offerId)) oratByOffer.set(orat.offerId, []);
  oratByOffer.get(orat.offerId).push(orat.aircraftTypeCode);
}
// Warn (not error) if an offer mixes airplane and helicopter aircraft types
for (const [offerId, codes] of oratByOffer) {
  const cats = new Set(codes.map((c) => AIRCRAFT_CATEGORY_MAP.get(c)).filter(Boolean));
  if (cats.size > 1) {
    const offerObj = offers.find((o) => o.id === offerId);
    warnings.push('offer ' + offerId + ' (' + (offerObj ? offerObj.title : '?') + '): mixes airplane and helicopter aircraft types — ' + codes.join(', '));
  }
}

// companyMembers
const companyUserCompanies = new Map();
const adminMemberCountByCompany = new Map();
for (const m of companyMembers) {
  if (!companyIds.has(m.companyId)) errors.push('member ' + m.id + ': companyId ' + m.companyId + ' not found');
  if (!profileIds.has(m.userId)) errors.push('member ' + m.id + ': userId ' + m.userId + ' not found in profiles');
  if (!VALID_COMPANY_MEMBER_ROLES.has(m.role)) errors.push('member ' + m.id + ': invalid role ' + m.role);
  const profile = profileById.get(m.userId);
  if (profile && profile.role !== 'company_user') errors.push('member ' + m.id + ': profile ' + m.userId + ' role must be company_user, got ' + profile.role);
  if (companyUserCompanies.has(m.userId) && companyUserCompanies.get(m.userId) !== m.companyId)
    errors.push('member ' + m.id + ': userId ' + m.userId + ' belongs to multiple companies');
  companyUserCompanies.set(m.userId, m.companyId);
  if (m.role === 'admin') adminMemberCountByCompany.set(m.companyId, (adminMemberCountByCompany.get(m.companyId) || 0) + 1);
}
for (const c of companies) {
  if ((adminMemberCountByCompany.get(c.id) || 0) === 0)
    errors.push('company ' + c.id + ': must have at least one admin company member');
}

// verification status
for (const t of techProfiles) {
  if (t.verificationStatus === 'unverified')
    errors.push('tech ' + t.id + ': verificationStatus "unverified" is a V1 legacy value — migrate to "pending"');
  else if (!VALID_VER_STATUSES.has(t.verificationStatus))
    errors.push('tech ' + t.id + ': invalid verificationStatus ' + t.verificationStatus);
  if (!t.locationCityId) errors.push('tech ' + t.id + ': missing locationCityId');
  if (t.locationCityId && !VALID_LOCATION_CITY_IDS.has(t.locationCityId))
    errors.push('tech ' + t.id + ': invalid locationCityId ' + t.locationCityId);
  if ('country' in t || 'city' in t || 'baseAirport' in t || 'latitude' in t || 'longitude' in t)
    errors.push('tech ' + t.id + ': technicianProfiles must persist only locationCityId for location');
}
for (const c of companies) {
  if (c.verificationStatus === 'unverified')
    errors.push('company ' + c.id + ': verificationStatus "unverified" is a V1 legacy value — migrate to "pending"');
  else if (!VALID_VER_STATUSES.has(c.verificationStatus))
    errors.push('company ' + c.id + ': invalid verificationStatus ' + c.verificationStatus);
  if (!VALID_COMPANY_TYPE_CODES.has(c.companyType)) errors.push('company ' + c.id + ': invalid companyType ' + c.companyType);
  if (!c.locationCityId) errors.push('company ' + c.id + ': missing locationCityId');
  if (c.locationCityId && !VALID_LOCATION_CITY_IDS.has(c.locationCityId))
    errors.push('company ' + c.id + ': invalid locationCityId ' + c.locationCityId);
  if ('country' in c || 'city' in c || 'baseAirport' in c || 'latitude' in c || 'longitude' in c)
    errors.push('company ' + c.id + ': companies must persist only locationCityId for location');
}

// chat room invariant: every accepted offerRequest/offerApplication must have a corresponding room
const roomByRequestId = new Map(chatRooms.filter((r) => r.offerRequestId).map((r) => [r.offerRequestId, r]));
const roomByApplicationId = new Map(chatRooms.filter((r) => r.offerApplicationId).map((r) => [r.offerApplicationId, r]));
const offerRequestById = new Map(offerRequests.map((r) => [r.id, r]));
const offerApplicationById = new Map(offerApplications.map((a) => [a.id, a]));
for (const r of offerRequests) {
  if (r.status === 'accepted' && !roomByRequestId.has(r.id))
    errors.push('oreq ' + r.id + ': accepted but no chat room found in chatRooms.json');
}
for (const a of offerApplications) {
  if (a.status === 'accepted' && !roomByApplicationId.has(a.id))
    errors.push('oapp ' + a.id + ': accepted but no chat room found in chatRooms.json');
}
const seenRoomRequestSources = new Set();
const seenRoomApplicationSources = new Set();
for (const room of chatRooms) {
  if (room.offerRequestId && room.offerApplicationId)
    errors.push('room ' + room.id + ': cannot reference both offerRequestId and offerApplicationId');
  if (!room.offerRequestId && !room.offerApplicationId)
    errors.push('room ' + room.id + ': missing offerRequestId or offerApplicationId');
  if (room.offerRequestId) {
    if (seenRoomRequestSources.has(room.offerRequestId))
      errors.push('room ' + room.id + ': duplicate chat room for offerRequestId ' + room.offerRequestId);
    seenRoomRequestSources.add(room.offerRequestId);
    const request = offerRequestById.get(room.offerRequestId);
    if (!request) {
      errors.push('room ' + room.id + ': offerRequestId ' + room.offerRequestId + ' not found');
    } else {
      if (request.status !== 'accepted')
        errors.push('room ' + room.id + ': offerRequestId ' + room.offerRequestId + ' status=' + request.status + ' but chat rooms require accepted');
      if (request.technicianId !== room.technicianId || request.companyId !== room.companyId)
        errors.push('room ' + room.id + ': technician/company mismatch for offerRequestId ' + room.offerRequestId);
    }
  }
  if (room.offerApplicationId) {
    if (seenRoomApplicationSources.has(room.offerApplicationId))
      errors.push('room ' + room.id + ': duplicate chat room for offerApplicationId ' + room.offerApplicationId);
    seenRoomApplicationSources.add(room.offerApplicationId);
    const application = offerApplicationById.get(room.offerApplicationId);
    if (!application) {
      errors.push('room ' + room.id + ': offerApplicationId ' + room.offerApplicationId + ' not found');
    } else {
      if (application.status !== 'accepted')
        errors.push('room ' + room.id + ': offerApplicationId ' + room.offerApplicationId + ' status=' + application.status + ' but chat rooms require accepted');
      if (application.technicianId !== room.technicianId || application.companyId !== room.companyId)
        errors.push('room ' + room.id + ': technician/company mismatch for offerApplicationId ' + room.offerApplicationId);
    }
  }
}

const chatRoomIds = new Set(chatRooms.map((room) => room.id));
const chatRoomById = new Map(chatRooms.map((room) => [room.id, room]));
for (const message of chatMessages) {
  if (!chatRoomIds.has(message.chatRoomId))
    errors.push('message ' + message.id + ': chatRoomId ' + message.chatRoomId + ' not found in chatRooms.json');
  if (!message.senderUserId || !profileIds.has(message.senderUserId))
    errors.push('message ' + message.id + ': senderUserId ' + message.senderUserId + ' not found in profiles.json');
  if (message.senderRole !== 'technician' && message.senderRole !== 'company')
    errors.push('message ' + message.id + ': invalid senderRole ' + message.senderRole);

  const profile = profileById.get(message.senderUserId);
  const room = chatRoomById.get(message.chatRoomId);
  if (message.senderRole === 'technician') {
    if (message.senderCompanyMemberId)
      errors.push('message ' + message.id + ': technician message must not have senderCompanyMemberId');
    const tech = techByUserId.get(message.senderUserId);
    if (profile && profile.role !== 'technician')
      errors.push('message ' + message.id + ': technician senderUserId profile role must be technician');
    if (!tech)
      errors.push('message ' + message.id + ': technician senderUserId must belong to a technician profile');
    else if (room && tech.id !== room.technicianId)
      errors.push('message ' + message.id + ': technician sender does not match chat room technicianId');
  }
  if (message.senderRole === 'company') {
    if (profile && profile.role !== 'company_user')
      errors.push('message ' + message.id + ': company senderUserId profile role must be company_user');
    if (message.senderCompanyMemberId) {
      const member = companyMemberById.get(message.senderCompanyMemberId);
      if (!member) {
        errors.push('message ' + message.id + ': senderCompanyMemberId ' + message.senderCompanyMemberId + ' not found');
      } else {
        if (member.userId !== message.senderUserId)
          errors.push('message ' + message.id + ': senderCompanyMemberId userId does not match senderUserId');
        if (room && member.companyId !== room.companyId)
          errors.push('message ' + message.id + ': senderCompanyMemberId company does not match chat room companyId');
      }
    }
  }
}

// activities
// MVP Phase 1 event types: application_* and direct_offer_*
// Future scope (not Phase 1 Supabase): chat_message_received
// Both are valid in the local demo seeds.
const VALID_ACTIVITY_TYPES = new Set([
  'application_received','application_accepted','application_rejected',
  'direct_offer_received','direct_offer_accepted','direct_offer_rejected',
  'chat_message_received', // local demo only — future scope for Supabase
]);
const offerRequestIds = new Set(offerRequests.map((r) => r.id));
const offerApplicationIds = new Set(offerApplications.map((a) => a.id));
for (const act of activities) {
  if (!VALID_ACTIVITY_TYPES.has(act.type)) errors.push('act ' + act.id + ': invalid type ' + act.type);
  if (act.recipientRole !== 'technician' && act.recipientRole !== 'company')
    errors.push('act ' + act.id + ': invalid recipientRole ' + act.recipientRole);
  if (act.recipientRole === 'technician' && !techIds.has(act.recipientId))
    errors.push('act ' + act.id + ': recipientId ' + act.recipientId + ' not found in technicianProfiles');
  if (act.recipientRole === 'company' && !companyIds.has(act.recipientId))
    errors.push('act ' + act.id + ': recipientId ' + act.recipientId + ' not found in companies');
  if (act.type.startsWith('direct_offer') && !offerRequestIds.has(act.entityId))
    errors.push('act ' + act.id + ': entityId ' + act.entityId + ' not found in offerRequests');
  if (act.type.startsWith('application') && !offerApplicationIds.has(act.entityId))
    errors.push('act ' + act.id + ': entityId ' + act.entityId + ' not found in offerApplications');
  if (act.type.startsWith('chat_message') && !chatMessages.some((m) => m.id === act.entityId))
    errors.push('act ' + act.id + ': entityId ' + act.entityId + ' not found in chatMessages');
}

// Summary
console.log('=== SEED VALIDATION REPORT ===');
console.log('Tech profiles: ' + techProfiles.length);
console.log('Companies: ' + companies.length);
console.log('Profiles: ' + profiles.length);
console.log('Offers: ' + offers.length + ' (published:' + offers.filter((o) => o.status === 'published').length + ' draft:' + offers.filter((o) => o.status === 'draft').length + ')');
console.log('OfferRequests: ' + offerRequests.length);
console.log('OfferApplications: ' + offerApplications.length);
console.log('Documents: ' + documents.length);
console.log('Licenses: ' + licenses.length);
console.log('Habilitations: ' + habilitations.length);
console.log('AircraftExperience: ' + experience.length);
console.log('OfferRequiredTechnicianTypes: ' + offerRequiredTechnicianTypes.length);
console.log('OfferRequiredLicenses: ' + offerRequiredLicenses.length);
console.log('OfferRequiredAircraftTypes: ' + offerRequiredAircraftTypes.length);
console.log('AircraftTypeCatalogCodes: ' + VALID_AIRCRAFT_TYPE_CODES.size);
console.log('CompanyMembers: ' + companyMembers.length);
console.log('ChatRooms: ' + chatRooms.length);
console.log('ChatMessages: ' + chatMessages.length);
console.log('Activities: ' + activities.length + ' (unread:' + activities.filter((a) => !a.read).length + ')');
console.log('Warnings: ' + warnings.length);
console.log('Errors: ' + errors.length);

const acceptedReqs = offerRequests.filter((r) => r.status === 'accepted');
const acceptedApps = offerApplications.filter((a) => a.status === 'accepted');
const nonAcceptedReqs = offerRequests.filter((r) => r.status !== 'accepted');
const nonAcceptedApps = offerApplications.filter((a) => a.status !== 'accepted');

console.log('\n--- Status invariant results ---');
console.log('Accepted offerRequests: ' + acceptedReqs.length +
  ' | identityRevealed=true: ' + acceptedReqs.every((r) => r.identityRevealed === true) +
  ' | documentsUnlocked=true: ' + acceptedReqs.every((r) => r.documentsUnlocked === true));
console.log('Non-accepted offerRequests: ' + nonAcceptedReqs.length +
  ' | identityRevealed=false: ' + nonAcceptedReqs.every((r) => r.identityRevealed === false) +
  ' | documentsUnlocked=false: ' + nonAcceptedReqs.every((r) => r.documentsUnlocked === false));
console.log('Accepted offerApplications: ' + acceptedApps.length +
  ' | identityRevealed=true: ' + acceptedApps.every((a) => a.identityRevealed === true) +
  ' | documentsUnlocked=true: ' + acceptedApps.every((a) => a.documentsUnlocked === true));
console.log('Non-accepted offerApplications: ' + nonAcceptedApps.length +
  ' | identityRevealed=false: ' + nonAcceptedApps.every((a) => a.identityRevealed === false) +
  ' | documentsUnlocked=false: ' + nonAcceptedApps.every((a) => a.documentsUnlocked === false));

console.log('\n--- offerRequests/applications vs offer.companyId cross-check ---');
const companyMismatch = [];
for (const r of offerRequests) {
  if (r.offerId) {
    const offerObj = offers.find((o) => o.id === r.offerId);
    if (offerObj && offerObj.companyId !== r.companyId)
      companyMismatch.push('oreq ' + r.id + ': offer belongs to ' + offerObj.companyId + ' but request from ' + r.companyId);
  }
}
if (companyMismatch.length === 0) console.log('All companyId cross-refs OK');
else companyMismatch.forEach((m) => console.log('  MISMATCH: ' + m));

console.log('\n--- Warnings ---');
if (warnings.length === 0) {
  console.log('No warnings');
} else {
  warnings.forEach((w) => console.log('  WARN: ' + w));
}

console.log('\n--- Errors ---');
if (errors.length === 0) {
  console.log('NO ERRORS FOUND — all checks passed');
  console.log('\nRESULT: PASS');
} else {
  errors.forEach((e) => console.log('  ERROR: ' + e));
  console.log('\nRESULT: FAIL');
  process.exitCode = 1;
}
