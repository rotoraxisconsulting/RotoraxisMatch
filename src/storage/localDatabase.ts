import { storageAdapter } from './asyncStorageAdapter';

// V1 seeds (keep for backward compat with V1 repositories)
import technicianSeeds from '../data/technicians.json';
import companySeeds from '../data/companies.json';
import matchRequestSeeds from '../data/matchRequests.json';
import documentSeeds from '../data/documents.json';

// V2 seeds
import v2Profiles from '../data/seeds/profiles.json';
import v2TechnicianProfiles from '../data/seeds/technicianProfiles.json';
import v2TechnicianLicenses from '../data/seeds/technicianLicenses.json';
import v2TechnicianHabilitations from '../data/seeds/technicianHabilitations.json';
import v2TechnicianAircraftExperience from '../data/seeds/technicianAircraftExperience.json';
import v2Companies from '../data/seeds/companies.json';
import v2CompanyMembers from '../data/seeds/companyMembers.json';
import v2Offers from '../data/seeds/offers.json';
import v2OfferRequiredTechnicianTypes from '../data/seeds/offerRequiredTechnicianTypes.json';
import v2OfferRequiredLicenses from '../data/seeds/offerRequiredLicenses.json';
import v2OfferRequiredAircraftTypes from '../data/seeds/offerRequiredAircraftTypes.json';
import v2OfferRequests from '../data/seeds/offerRequests.json';
import v2OfferApplications from '../data/seeds/offerApplications.json';
import v2Documents from '../data/seeds/documents.json';

export const DB_KEYS = {
  // V1 — keep for backward compat with existing repositories
  initialized: 'db:initialized',
  technicians: 'db:technicians',
  companies: 'db:companies',
  matchRequests: 'db:matchRequests',
  documents: 'db:documents',

  // V2
  v2Initialized: 'db:v2:initialized',
  v2Profiles: 'db:v2:profiles',
  v2TechnicianProfiles: 'db:v2:technicianProfiles',
  v2TechnicianLicenses: 'db:v2:technicianLicenses',
  v2TechnicianHabilitations: 'db:v2:technicianHabilitations',
  v2TechnicianAircraftExperience: 'db:v2:technicianAircraftExperience',
  v2Companies: 'db:v2:companies',
  v2CompanyMembers: 'db:v2:companyMembers',
  v2Offers: 'db:v2:offers',
  v2OfferRequiredTechnicianTypes: 'db:v2:offerRequiredTechnicianTypes',
  v2OfferRequiredLicenses: 'db:v2:offerRequiredLicenses',
  v2OfferRequiredAircraftTypes: 'db:v2:offerRequiredAircraftTypes',
  v2OfferRequests: 'db:v2:offerRequests',
  v2OfferApplications: 'db:v2:offerApplications',
  v2Documents: 'db:v2:documents',
  v2ChatRooms: 'db:v2:chatRooms',
  v2ChatMessages: 'db:v2:chatMessages',
} as const;

export const localDatabase = {
  async isInitialized(): Promise<boolean> {
    const flag = await storageAdapter.get<boolean>(DB_KEYS.initialized);
    return flag === true;
  },

  async isV2Initialized(): Promise<boolean> {
    const flag = await storageAdapter.get<boolean>(DB_KEYS.v2Initialized);
    return flag === true;
  },

  async initializeFromSeeds(): Promise<void> {
    const v1Done = await this.isInitialized();
    if (!v1Done) {
      await this.resetToSeeds();
    }
    const v2Done = await this.isV2Initialized();
    if (!v2Done) {
      await this.seedV2Data();
    }
  },

  async resetToSeeds(): Promise<void> {
    // V1 data
    await storageAdapter.set(DB_KEYS.technicians, technicianSeeds);
    await storageAdapter.set(DB_KEYS.companies, companySeeds);
    await storageAdapter.set(DB_KEYS.matchRequests, matchRequestSeeds);
    await storageAdapter.set(DB_KEYS.documents, documentSeeds);
    await storageAdapter.set(DB_KEYS.initialized, true);

    // V2 data
    await this.seedV2Data();
  },

  async seedV2Data(): Promise<void> {
    await storageAdapter.set(DB_KEYS.v2Profiles, v2Profiles);
    await storageAdapter.set(DB_KEYS.v2TechnicianProfiles, v2TechnicianProfiles);
    await storageAdapter.set(DB_KEYS.v2TechnicianLicenses, v2TechnicianLicenses);
    await storageAdapter.set(DB_KEYS.v2TechnicianHabilitations, v2TechnicianHabilitations);
    await storageAdapter.set(DB_KEYS.v2TechnicianAircraftExperience, v2TechnicianAircraftExperience);
    await storageAdapter.set(DB_KEYS.v2Companies, v2Companies);
    await storageAdapter.set(DB_KEYS.v2CompanyMembers, v2CompanyMembers);
    await storageAdapter.set(DB_KEYS.v2Offers, v2Offers);
    await storageAdapter.set(DB_KEYS.v2OfferRequiredTechnicianTypes, v2OfferRequiredTechnicianTypes);
    await storageAdapter.set(DB_KEYS.v2OfferRequiredLicenses, v2OfferRequiredLicenses);
    await storageAdapter.set(DB_KEYS.v2OfferRequiredAircraftTypes, v2OfferRequiredAircraftTypes);
    await storageAdapter.set(DB_KEYS.v2OfferRequests, v2OfferRequests);
    await storageAdapter.set(DB_KEYS.v2OfferApplications, v2OfferApplications);
    await storageAdapter.set(DB_KEYS.v2Documents, v2Documents);
    await storageAdapter.set(DB_KEYS.v2ChatRooms, []);
    await storageAdapter.set(DB_KEYS.v2ChatMessages, []);
    await storageAdapter.set(DB_KEYS.v2Initialized, true);
  },

  async resetV2Data(): Promise<void> {
    await storageAdapter.remove(DB_KEYS.v2Initialized);
    await this.seedV2Data();
  },
};
