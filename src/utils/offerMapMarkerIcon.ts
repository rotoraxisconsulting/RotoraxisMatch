import type { ContractTypeCode } from '../types/catalog';

export type OfferMapMarkerShape = 'circle' | 'square' | 'diamond' | 'cluster';

export interface OfferMapMarkerIconOptions {
  shape: OfferMapMarkerShape;
  color: string;
  count?: number;
}

export function offerMapMarkerShape(contractType: ContractTypeCode): OfferMapMarkerShape {
  if (contractType === 'long_term') return 'square';
  if (contractType === 'short_term') return 'diamond';
  return 'circle';
}

function safeSvgColor(value: string): string {
  return /^#[0-9A-F]{6}$/i.test(value) ? value : '#527088';
}

export function buildOfferMapMarkerSvg({
  shape,
  color,
  count,
}: OfferMapMarkerIconOptions): string {
  const fill = safeSvgColor(color);
  const safeCount = Math.max(1, Math.floor(Number(count) || 1));
  const countLabel = safeCount > 99 ? '99+' : String(safeCount);

  let visibleShape: string;
  if (shape === 'cluster') {
    visibleShape = [
      '<circle cx="24" cy="24" r="14" fill="#0A1520" stroke="#FFFFFF" stroke-width="2.5" />',
      `<text x="24" y="24" dy="0.35em" fill="#FFFFFF" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="${countLabel.length > 2 ? 9 : 11}" font-weight="800" text-anchor="middle">${countLabel}</text>`,
    ].join('');
  } else if (shape === 'square') {
    visibleShape = `<rect x="12" y="12" width="24" height="24" rx="4" fill="${fill}" stroke="#FFFFFF" stroke-width="2.5" />`;
  } else if (shape === 'diamond') {
    visibleShape = `<path d="M24 9.5 38.5 24 24 38.5 9.5 24Z" fill="${fill}" stroke="#FFFFFF" stroke-width="2.5" stroke-linejoin="round" />`;
  } else {
    visibleShape = `<circle cx="24" cy="24" r="12" fill="${fill}" stroke="#FFFFFF" stroke-width="2.5" />`;
  }

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" focusable="false">',
    '<circle class="offer-marker-selection" cx="24" cy="24" r="18" fill="none" stroke="#0891B2" stroke-width="3" opacity="0" />',
    visibleShape,
    '</svg>',
  ].join('');
}
