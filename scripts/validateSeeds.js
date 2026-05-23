const fs = require('fs');
const path = require('path');
const seedsPath = path.join(__dirname, '..', 'src', 'data', 'seeds');
const read = (f) => JSON.parse(fs.readFileSync(path.join(seedsPath, f), 'utf8'));

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

const techIds = new Set(techProfiles.map((t) => t.id));
const companyIds = new Set(companies.map((c) => c.id));
const offerIds = new Set(offers.map((o) => o.id));
const profileIds = new Set(profiles.map((p) => p.id));

const VALID_OFFER_REQ_STATUSES = new Set(['pending', 'accepted', 'rejected', 'expired', 'withdrawn']);
const VALID_DOC_STATUSES = new Set(['pending', 'verified', 'rejected', 'expired']);
const VALID_VER_STATUSES = new Set(['pending', 'verified', 'rejected']);
const VALID_OFFER_STATUSES = new Set(['draft', 'published', 'closed', 'expired']);
const VALID_LICENSE_CODES = new Set(['A1','A2','A3','A4','B1.1','B1.2','B1.3','B1.4','B2','B2L','B3','L','C']);

const errors = [];

// offerRequests
const seenPendingDirect = new Set();
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
  if (r.status === 'pending') {
    const key = r.companyId + '|' + r.technicianId + '|' + (r.offerId || '');
    if (seenPendingDirect.has(key)) errors.push('oreq ' + r.id + ': duplicate pending direct offer');
    seenPendingDirect.add(key);
  }
}

// offerApplications
const seenPendingApp = new Set();
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
  if (a.status === 'pending') {
    const key = a.technicianId + '|' + a.offerId;
    if (seenPendingApp.has(key)) errors.push('oapp ' + a.id + ': duplicate pending application for tech+offer');
    seenPendingApp.add(key);
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
}

// aircraft experience
for (const e of experience) {
  if (!techIds.has(e.technicianId)) errors.push('exp ' + e.id + ': technicianId ' + e.technicianId + ' not found');
  if (e.unit !== 'hours' && e.unit !== 'years') errors.push('exp ' + e.id + ': invalid unit ' + e.unit);
}

// offers
for (const o of offers) {
  if (!companyIds.has(o.companyId)) errors.push('offer ' + o.id + ': companyId ' + o.companyId + ' not found');
  if (!VALID_OFFER_STATUSES.has(o.status)) errors.push('offer ' + o.id + ': invalid status ' + o.status);
}

// companyMembers
for (const m of companyMembers) {
  if (!companyIds.has(m.companyId)) errors.push('member ' + m.id + ': companyId ' + m.companyId + ' not found');
  if (!profileIds.has(m.userId)) errors.push('member ' + m.id + ': userId ' + m.userId + ' not found in profiles');
}

// verification status
for (const t of techProfiles) {
  if (!VALID_VER_STATUSES.has(t.verificationStatus))
    errors.push('tech ' + t.id + ': invalid verificationStatus ' + t.verificationStatus);
}
for (const c of companies) {
  if (!VALID_VER_STATUSES.has(c.verificationStatus))
    errors.push('company ' + c.id + ': invalid verificationStatus ' + c.verificationStatus);
}

// Chat rooms: seed is empty (correct — chatRooms only created on acceptance at runtime)
// The seed file is not in seeds dir — chatRooms start empty, created dynamically.

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
console.log('CompanyMembers: ' + companyMembers.length);

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

console.log('\n--- Errors ---');
if (errors.length === 0) {
  console.log('NO ERRORS FOUND — all checks passed');
} else {
  errors.forEach((e) => console.log('  ERROR: ' + e));
}
