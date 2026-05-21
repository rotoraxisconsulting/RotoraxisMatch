import { OfferInboxRecord } from '../../types/offerRequest';
import { offerRequestRepository } from './offerRequestRepository';
import { offerApplicationRepository } from './offerApplicationRepository';

export const inboxRepository = {
  async getTechnicianInbox(technicianId: string): Promise<OfferInboxRecord[]> {
    const [requests, applications] = await Promise.all([
      offerRequestRepository.getForTechnician(technicianId),
      offerApplicationRepository.getForTechnician(technicianId),
    ]);
    const combined: OfferInboxRecord[] = [...requests, ...applications];
    return combined.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async getCompanyInbox(companyId: string): Promise<OfferInboxRecord[]> {
    const [requests, applications] = await Promise.all([
      offerRequestRepository.getForCompany(companyId),
      offerApplicationRepository.getForCompany(companyId),
    ]);
    const combined: OfferInboxRecord[] = [...requests, ...applications];
    return combined.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async getTechnicianPendingCount(technicianId: string): Promise<number> {
    const inbox = await this.getTechnicianInbox(technicianId);
    return inbox.filter((r) => r.status === 'pending').length;
  },

  async getCompanyPendingCount(companyId: string): Promise<number> {
    const inbox = await this.getCompanyInbox(companyId);
    return inbox.filter((r) => r.status === 'pending').length;
  },
};
