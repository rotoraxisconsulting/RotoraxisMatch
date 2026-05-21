import { AIRCRAFT_TYPE_CATALOG, AircraftTypeCode } from '../../constants/aircraftTypes';
import { LICENSE_CATEGORIES, LicenseCode } from '../../constants/licenses';
import { CONTRACT_TYPES } from '../../constants/contractTypes';
import { TECHNICIAN_TYPES } from '../../constants/technicianTypes';
import { COMPANY_TYPES } from '../../constants/companyTypes';
import { ContractTypeCode, TechnicianTypeCode, CompanyTypeCode } from '../../types/catalog';

export const catalogRepository = {
  async getAircraftTypes() {
    return [...AIRCRAFT_TYPE_CATALOG];
  },

  async getAircraftType(code: AircraftTypeCode) {
    return AIRCRAFT_TYPE_CATALOG.find((a) => a.code === code) ?? null;
  },

  async getLicenseCategories() {
    return [...LICENSE_CATEGORIES];
  },

  async getLicenseCategory(code: LicenseCode) {
    return LICENSE_CATEGORIES.find((l) => l.code === code) ?? null;
  },

  async getContractTypes() {
    return [...CONTRACT_TYPES];
  },

  async getContractType(code: ContractTypeCode) {
    return CONTRACT_TYPES.find((c) => c.code === code) ?? null;
  },

  async getTechnicianTypes() {
    return [...TECHNICIAN_TYPES];
  },

  async getTechnicianType(code: TechnicianTypeCode) {
    return TECHNICIAN_TYPES.find((t) => t.code === code) ?? null;
  },

  async getCompanyTypes() {
    return [...COMPANY_TYPES];
  },

  async getCompanyType(code: CompanyTypeCode) {
    return COMPANY_TYPES.find((c) => c.code === code) ?? null;
  },
};
