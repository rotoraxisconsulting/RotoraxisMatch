import { MatchLabel } from './matching';
import { OfferRequestStatus } from './enums';

export interface MapOfferMatchOption {
  offerId: string;
  title: string;
  contractType: string;
  location: string;
  score: number;
  label: MatchLabel;
  requestStatus?: OfferRequestStatus;
}
