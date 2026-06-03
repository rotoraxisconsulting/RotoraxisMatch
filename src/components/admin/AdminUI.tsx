import {
  ActivityDot,
  CompanyBadge,
  CompanyCard,
  CompanyChip,
  CompanyPageHeader,
  CompanyScreen,
  EmptyPanel,
  IconBox,
  InfoRow,
  InitialAvatar,
  companyShadow,
  companyStyles,
  companyUi,
} from '../company/CompanyUI';
import type { CompanyTone } from '../company/CompanyUI';

export const adminUi = companyUi;
export const adminShadow = companyShadow;
export const adminStyles = companyStyles;

export const AdminScreen = CompanyScreen;
export const AdminCard = CompanyCard;
export const AdminPageHeader = CompanyPageHeader;
export const AdminBadge = CompanyBadge;
export const AdminChip = CompanyChip;
export const AdminIconBox = IconBox;
export const AdminInfoRow = InfoRow;
export const AdminEmptyPanel = EmptyPanel;
export const AdminInitialAvatar = InitialAvatar;
export const AdminActivityDot = ActivityDot;

export type AdminTone = CompanyTone;
