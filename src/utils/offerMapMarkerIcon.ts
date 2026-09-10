import type { ContractTypeCode } from '../types/catalog';
import type { OfferMapMarkerTier } from '../types/offerMap';
import type { OfferSalary } from '../types/offerSalary';
import { formatOfferSalaryAmount } from './offerSalary';

export type OfferMapMarkerShape = 'circle' | 'square' | 'diamond' | 'cluster';

export interface OfferMapMarkerIconOptions {
  shape: OfferMapMarkerShape;
  color: string;
  count?: number;
  salary?: OfferSalary | null;
  /** Defaults to `label`: sin decisión de nivel, el marcador es el de cerca. */
  tier?: OfferMapMarkerTier;
}

/** Leaflet geometry, separable del SVG para poder medir sin construirlo. */
export interface OfferMapMarkerGeometry {
  iconSize: [number, number];
  iconAnchor: [number, number];
  popupAnchor: [number, number];
}

/** SVG and Leaflet geometry travel together in web and native payloads. */
export interface OfferMapMarkerIcon extends OfferMapMarkerGeometry {
  markerSvg: string;
}

export function offerMapMarkerShape(contractType: ContractTypeCode): OfferMapMarkerShape {
  if (contractType === 'long_term') return 'square';
  if (contractType === 'short_term') return 'diamond';
  return 'circle';
}

function safeSvgColor(value: string): string {
  return /^#[0-9A-F]{6}$/i.test(value) ? value : '#527088';
}

function escapeSvgText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const FONT = '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif';

function salaryLabelParts(salary: OfferSalary): { amount: string; unit: string; width: number } {
  const amount = formatOfferSalaryAmount(salary);
  const unit = `/ ${salary.period} · gross`;
  // Conservative character widths avoid clipping across native/web fonts.
  // Never abbreviate or round the stored amount to make it fit.
  const width = Math.ceil(Math.max(132, 52 + amount.length * 8.5, 52 + unit.length * 6.2));
  return { amount, unit, width };
}

function markerCount(count?: number): number {
  return Math.max(1, Math.floor(Number(count) || 1));
}

/**
 * Qué variante toca de verdad, una vez descontado lo que el nivel pedido no
 * puede dar: un grupo siempre es cluster, y sin salario no hay burbuja.
 */
function resolveVariant(options: OfferMapMarkerIconOptions): 'cluster' | 'label' | 'shape' | 'dot' {
  if (options.shape === 'cluster' || markerCount(options.count) > 1) return 'cluster';
  const tier = options.tier ?? 'label';
  if (tier === 'label') return options.salary ? 'label' : 'shape';
  return tier;
}

export function offerMapMarkerIconGeometry(options: OfferMapMarkerIconOptions): OfferMapMarkerGeometry {
  const variant = resolveVariant(options);
  if (variant === 'label' && options.salary) {
    const { width } = salaryLabelParts(options.salary);
    return { iconSize: [width, 66], iconAnchor: [width / 2, 60], popupAnchor: [0, -54] };
  }
  if (variant === 'dot') {
    return { iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -14] };
  }
  return { iconSize: [56, 56], iconAnchor: [28, 28], popupAnchor: [0, -23] };
}

export function buildOfferMapMarkerIcon(options: OfferMapMarkerIconOptions): OfferMapMarkerIcon {
  const { shape, color, salary } = options;
  const fill = safeSvgColor(color);
  const variant = resolveVariant(options);
  const geometry = offerMapMarkerIconGeometry(options);

  if (variant === 'label' && salary) {
    const { amount, unit, width } = salaryLabelParts(salary);
    const symbol = shape === 'square'
      ? `<rect x="16" y="24" width="12" height="12" rx="2" fill="${fill}" />`
      : shape === 'diamond'
        ? `<path d="M22 22 30 30 22 38 14 30Z" fill="${fill}" />`
        : `<circle cx="22" cy="30" r="6" fill="${fill}" />`;
    const markerSvg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="66" viewBox="0 0 ${width} 66" aria-hidden="true" focusable="false">`,
      `<rect class="offer-marker-selection" x="2" y="2" width="${width - 4}" height="61" rx="18" fill="none" stroke="#0891B2" stroke-width="3" opacity="0" />`,
      `<rect x="6" y="6" width="${width - 12}" height="48" rx="14" fill="#FFFFFF" stroke="${fill}" stroke-width="2" />`,
      `<path d="M${width / 2 - 6} 53 ${width / 2} 60 ${width / 2 + 6} 53" fill="#FFFFFF" stroke="${fill}" stroke-width="2" stroke-linejoin="round" />`,
      symbol,
      `<text x="38" y="27" fill="#0B1520" font-family="${FONT}" font-size="14" font-weight="800">${escapeSvgText(amount)}</text>`,
      `<text x="38" y="43" fill="#43576B" font-family="${FONT}" font-size="11" font-weight="600">${escapeSvgText(unit)}</text>`,
      '</svg>',
    ].join('');
    return { markerSvg, ...geometry };
  }

  if (variant === 'dot') {
    const symbol = shape === 'square'
      ? `<rect x="8" y="8" width="16" height="16" rx="3" fill="${fill}" stroke="#FFFFFF" stroke-width="2.5" />`
      : shape === 'diamond'
        ? `<path d="M16 6 26 16 16 26 6 16Z" fill="${fill}" stroke="#FFFFFF" stroke-width="2.5" stroke-linejoin="round" />`
        : `<circle cx="16" cy="16" r="8" fill="${fill}" stroke="#FFFFFF" stroke-width="2.5" />`;
    return {
      markerSvg: [
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false">',
        '<circle class="offer-marker-selection" cx="16" cy="16" r="13" fill="none" stroke="#0891B2" stroke-width="2.5" opacity="0" />',
        symbol,
        '</svg>',
      ].join(''),
      ...geometry,
    };
  }

  const safeCount = markerCount(options.count);
  const countLabel = safeCount > 99 ? '99+' : String(safeCount);

  let visibleShape: string;
  if (variant === 'cluster') {
    visibleShape = [
      '<circle cx="28" cy="28" r="19" fill="#0A1520" stroke="#FFFFFF" stroke-width="3" />',
      `<text x="28" y="28" dy="0.35em" fill="#FFFFFF" font-family="${FONT}" font-size="${countLabel.length > 2 ? 12 : 15}" font-weight="800" text-anchor="middle">${countLabel}</text>`,
    ].join('');
  } else if (shape === 'square') {
    visibleShape = `<rect x="12" y="12" width="32" height="32" rx="5" fill="${fill}" stroke="#FFFFFF" stroke-width="3" />`;
  } else if (shape === 'diamond') {
    visibleShape = `<path d="M28 9 47 28 28 47 9 28Z" fill="${fill}" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round" />`;
  } else {
    visibleShape = `<circle cx="28" cy="28" r="16" fill="${fill}" stroke="#FFFFFF" stroke-width="3" />`;
  }

  return {
    markerSvg: [
      '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true" focusable="false">',
      '<circle class="offer-marker-selection" cx="28" cy="28" r="23" fill="none" stroke="#0891B2" stroke-width="3" opacity="0" />',
      visibleShape,
      '</svg>',
    ].join(''),
    ...geometry,
  };
}

export function buildOfferMapMarkerSvg(options: OfferMapMarkerIconOptions): string {
  return buildOfferMapMarkerIcon(options).markerSvg;
}
