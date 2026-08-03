import { MatchDisplayLabel } from './matching';
import { OfferRequestStatus } from './enums';

export interface MapOfferMatchOption {
  offerId: string;
  title: string;
  contractType: string;
  location: string;
  score: number;
  // MatchDisplayLabel, not MatchLabel: an offer aimed at non-licensed trades
  // reads "General compatibility" instead of a band label, since it has no
  // Part-66 requirement to have matched. Still a CLOSED union — fill it via
  // getMatchDisplayLabel, never straight from score.label and never with a
  // hand-typed string.
  label: MatchDisplayLabel;
  requestStatus?: OfferRequestStatus;
}
