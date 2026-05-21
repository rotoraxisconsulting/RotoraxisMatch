import profiles from '../data/seeds/profiles.json';
import technicianProfiles from '../data/seeds/technicianProfiles.json';
import technicianLicenses from '../data/seeds/technicianLicenses.json';
import technicianHabilitations from '../data/seeds/technicianHabilitations.json';
import technicianAircraftExperience from '../data/seeds/technicianAircraftExperience.json';
import companies from '../data/seeds/companies.json';
import companyMembers from '../data/seeds/companyMembers.json';
import offers from '../data/seeds/offers.json';
import offerRequiredTechnicianTypes from '../data/seeds/offerRequiredTechnicianTypes.json';
import offerRequiredLicenses from '../data/seeds/offerRequiredLicenses.json';
import offerRequiredAircraftTypes from '../data/seeds/offerRequiredAircraftTypes.json';
import offerRequests from '../data/seeds/offerRequests.json';
import offerApplications from '../data/seeds/offerApplications.json';
import documents from '../data/seeds/documents.json';
import { AIRCRAFT_TYPE_CATALOG } from '../constants/aircraftTypes';
import { LICENSE_CATEGORIES } from '../constants/licenses';
import { CONTRACT_TYPES } from '../constants/contractTypes';

const VALID_PROFILE_ROLES = new Set(['technician', 'company_user', 'admin']);
const VALID_USER_STATUSES = new Set(['pending_verification', 'active', 'blocked', 'suspended']);
const VALID_TECHNICIAN_TYPES = new Set(['mechanic', 'avionic', 'sheet_metal_worker', 'painter', 'composite', 'pilot']);
const VALID_VERIFICATION_STATUSES = new Set(['pending', 'verified', 'rejected']);
const VALID_OFFER_STATUSES = new Set(['draft', 'published', 'closed', 'expired']);
const VALID_OFFER_REQUEST_STATUSES = new Set(['pending', 'accepted', 'rejected', 'expired', 'withdrawn']);
const VALID_DOCUMENT_STATUSES = new Set(['pending', 'verified', 'rejected', 'expired']);
const VALID_COMPANY_MEMBER_ROLES = new Set(['admin', 'recruiter', 'viewer']);
const VALID_COMPANY_TYPES = new Set(['MRO', 'airline', 'recruitment_agency', 'helicopter_operator', 'other']);
const VALID_CONTRACT_TYPES = new Set<string>(CONTRACT_TYPES.map((c) => c.code));
const VALID_LICENSE_CODES = new Set<string>(LICENSE_CATEGORIES.map((l) => l.code));
const VALID_AIRCRAFT_CODES = new Set<string>(AIRCRAFT_TYPE_CATALOG.map((a) => a.code));

export interface SeedValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary: Record<string, number>;
}

export function validateSeedData(): SeedValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Build lookup sets for referential integrity checks
  const profileIds = new Set(profiles.map((p) => p.id));
  const technicianIds = new Set(technicianProfiles.map((t) => t.id));
  const companyIds = new Set(companies.map((c) => c.id));
  const offerIds = new Set(offers.map((o) => o.id));

  // --- profiles ---
  for (const p of profiles) {
    if (!VALID_PROFILE_ROLES.has(p.role)) errors.push(`Profile ${p.id}: invalid role '${p.role}'`);
    if (!VALID_USER_STATUSES.has(p.status)) errors.push(`Profile ${p.id}: invalid status '${p.status}'`);
  }

  // --- technician profiles ---
  for (const t of technicianProfiles) {
    if (!profileIds.has(t.userId)) errors.push(`TechnicianProfile ${t.id}: userId '${t.userId}' not in profiles`);
    if (!VALID_TECHNICIAN_TYPES.has(t.technicianType)) errors.push(`TechnicianProfile ${t.id}: invalid technicianType '${t.technicianType}'`);
    if (!VALID_VERIFICATION_STATUSES.has(t.verificationStatus)) errors.push(`TechnicianProfile ${t.id}: invalid verificationStatus '${t.verificationStatus}'`);
    if (!t.firstName || !t.lastName) errors.push(`TechnicianProfile ${t.id}: missing firstName or lastName`);
    if (!t.birthDate) errors.push(`TechnicianProfile ${t.id}: missing birthDate`);
    const avail = t.availability as { contractTypes?: unknown[] };
    if (!avail.contractTypes || avail.contractTypes.length === 0) errors.push(`TechnicianProfile ${t.id}: availability.contractTypes is empty`);
    for (const ct of (avail.contractTypes ?? []) as string[]) {
      if (!VALID_CONTRACT_TYPES.has(ct)) errors.push(`TechnicianProfile ${t.id}: invalid contractType '${ct}'`);
    }
  }

  // --- technician licenses ---
  for (const l of technicianLicenses) {
    if (!technicianIds.has(l.technicianId)) errors.push(`TechnicianLicense ${l.id}: technicianId '${l.technicianId}' not found`);
    if (!VALID_LICENSE_CODES.has(l.licenseCode)) errors.push(`TechnicianLicense ${l.id}: invalid licenseCode '${l.licenseCode}'`);
  }

  // --- technician habilitations ---
  for (const h of technicianHabilitations) {
    if (!technicianIds.has(h.technicianId)) errors.push(`Habilitation ${h.id}: technicianId '${h.technicianId}' not found`);
    if (!VALID_LICENSE_CODES.has(h.licenseCode)) errors.push(`Habilitation ${h.id}: invalid licenseCode '${h.licenseCode}'`);
    if (!VALID_AIRCRAFT_CODES.has(h.aircraftTypeCode)) errors.push(`Habilitation ${h.id}: invalid aircraftTypeCode '${h.aircraftTypeCode}'`);
  }

  // --- technician aircraft experience ---
  for (const e of technicianAircraftExperience) {
    if (!technicianIds.has(e.technicianId)) errors.push(`AircraftExperience ${e.id}: technicianId '${e.technicianId}' not found`);
    if (!VALID_AIRCRAFT_CODES.has(e.aircraftTypeCode)) errors.push(`AircraftExperience ${e.id}: invalid aircraftTypeCode '${e.aircraftTypeCode}'`);
    if (!['hours', 'years'].includes(e.unit)) errors.push(`AircraftExperience ${e.id}: invalid unit '${e.unit}'`);
    if (e.value <= 0) errors.push(`AircraftExperience ${e.id}: value must be > 0`);
  }

  // --- companies ---
  for (const c of companies) {
    if (!VALID_COMPANY_TYPES.has(c.companyType)) errors.push(`Company ${c.id}: invalid companyType '${c.companyType}'`);
    if (!VALID_VERIFICATION_STATUSES.has(c.verificationStatus)) errors.push(`Company ${c.id}: invalid verificationStatus '${c.verificationStatus}'`);
    if (!c.email) errors.push(`Company ${c.id}: missing email`);
  }

  // --- company members ---
  for (const m of companyMembers) {
    if (!companyIds.has(m.companyId)) errors.push(`CompanyMember ${m.id}: companyId '${m.companyId}' not found`);
    if (!profileIds.has(m.userId)) errors.push(`CompanyMember ${m.id}: userId '${m.userId}' not in profiles`);
    if (!VALID_COMPANY_MEMBER_ROLES.has(m.role)) errors.push(`CompanyMember ${m.id}: invalid role '${m.role}'`);
  }

  // --- offers ---
  for (const o of offers) {
    if (!companyIds.has(o.companyId)) errors.push(`Offer ${o.id}: companyId '${o.companyId}' not found`);
    if (!VALID_OFFER_STATUSES.has(o.status)) errors.push(`Offer ${o.id}: invalid status '${o.status}'`);
    if (!VALID_CONTRACT_TYPES.has(o.contractType)) errors.push(`Offer ${o.id}: invalid contractType '${o.contractType}'`);
    if (!o.title) errors.push(`Offer ${o.id}: missing title`);
  }

  // --- offer required technician types ---
  for (const ort of offerRequiredTechnicianTypes) {
    if (!offerIds.has(ort.offerId)) errors.push(`OfferRequiredType ${ort.id}: offerId '${ort.offerId}' not found`);
    if (!VALID_TECHNICIAN_TYPES.has(ort.technicianTypeCode)) errors.push(`OfferRequiredType ${ort.id}: invalid technicianTypeCode '${ort.technicianTypeCode}'`);
  }

  // --- offer required licenses ---
  for (const orl of offerRequiredLicenses) {
    if (!offerIds.has(orl.offerId)) errors.push(`OfferRequiredLicense ${orl.id}: offerId '${orl.offerId}' not found`);
    if (!VALID_LICENSE_CODES.has(orl.licenseCode)) errors.push(`OfferRequiredLicense ${orl.id}: invalid licenseCode '${orl.licenseCode}'`);
  }

  // --- offer required aircraft types ---
  for (const orat of offerRequiredAircraftTypes) {
    if (!offerIds.has(orat.offerId)) errors.push(`OfferRequiredAircraft ${orat.id}: offerId '${orat.offerId}' not found`);
    if (!VALID_AIRCRAFT_CODES.has(orat.aircraftTypeCode)) errors.push(`OfferRequiredAircraft ${orat.id}: invalid aircraftTypeCode '${orat.aircraftTypeCode}'`);
  }

  // --- offer requests ---
  for (const req of offerRequests) {
    if (req.kind !== 'direct_offer') errors.push(`OfferRequest ${req.id}: kind must be 'direct_offer', got '${req.kind}'`);
    if (!companyIds.has(req.companyId)) errors.push(`OfferRequest ${req.id}: companyId '${req.companyId}' not found`);
    if (!technicianIds.has(req.technicianId)) errors.push(`OfferRequest ${req.id}: technicianId '${req.technicianId}' not found`);
    if (!VALID_OFFER_REQUEST_STATUSES.has(req.status)) errors.push(`OfferRequest ${req.id}: invalid status '${req.status}'`);
    if (req.status === 'accepted') {
      if (!req.identityRevealed) errors.push(`OfferRequest ${req.id}: accepted record must have identityRevealed: true`);
      if (!req.documentsUnlocked) errors.push(`OfferRequest ${req.id}: accepted record must have documentsUnlocked: true`);
    } else {
      if (req.identityRevealed) errors.push(`OfferRequest ${req.id}: non-accepted record must have identityRevealed: false`);
      if (req.documentsUnlocked) errors.push(`OfferRequest ${req.id}: non-accepted record must have documentsUnlocked: false`);
    }
  }

  // --- offer applications ---
  for (const app of offerApplications) {
    if (app.kind !== 'application') errors.push(`OfferApplication ${app.id}: kind must be 'application', got '${app.kind}'`);
    if (!technicianIds.has(app.technicianId)) errors.push(`OfferApplication ${app.id}: technicianId '${app.technicianId}' not found`);
    if (!offerIds.has(app.offerId)) errors.push(`OfferApplication ${app.id}: offerId '${app.offerId}' not found`);
    if (!companyIds.has(app.companyId)) errors.push(`OfferApplication ${app.id}: companyId '${app.companyId}' not found`);
    if (!VALID_OFFER_REQUEST_STATUSES.has(app.status)) errors.push(`OfferApplication ${app.id}: invalid status '${app.status}'`);
    if (app.status === 'accepted') {
      if (!app.identityRevealed) errors.push(`OfferApplication ${app.id}: accepted record must have identityRevealed: true`);
      if (!app.documentsUnlocked) errors.push(`OfferApplication ${app.id}: accepted record must have documentsUnlocked: true`);
    } else {
      if (app.identityRevealed) errors.push(`OfferApplication ${app.id}: non-accepted record must have identityRevealed: false`);
      if (app.documentsUnlocked) errors.push(`OfferApplication ${app.id}: non-accepted record must have documentsUnlocked: false`);
    }
  }

  // --- documents ---
  for (const d of documents) {
    if (!technicianIds.has(d.technicianId)) errors.push(`Document ${d.id}: technicianId '${d.technicianId}' not found`);
    if (!VALID_DOCUMENT_STATUSES.has(d.status)) errors.push(`Document ${d.id}: invalid status '${d.status}'`);
    if (!d.storagePath) errors.push(`Document ${d.id}: missing storagePath`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    summary: {
      profiles: profiles.length,
      technicianProfiles: technicianProfiles.length,
      technicianLicenses: technicianLicenses.length,
      technicianHabilitations: technicianHabilitations.length,
      technicianAircraftExperience: technicianAircraftExperience.length,
      companies: companies.length,
      companyMembers: companyMembers.length,
      offers: offers.length,
      offerRequiredTechnicianTypes: offerRequiredTechnicianTypes.length,
      offerRequiredLicenses: offerRequiredLicenses.length,
      offerRequiredAircraftTypes: offerRequiredAircraftTypes.length,
      offerRequests: offerRequests.length,
      offerApplications: offerApplications.length,
      documents: documents.length,
    },
  };
}
