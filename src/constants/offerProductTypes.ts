import { OfferProductType } from '../types/offer';

/**
 * Las dos opciones de `offers.product_type` (migración 047), con la etiqueta
 * que ve el usuario.
 *
 * `code` es el valor EASA que guarda la base ('Aeroplane' / 'Helicopter', el
 * mismo vocabulario que `aircraft_type_ratings.product_type`, que es lo que
 * hace posible cruzarlos con una FK compuesta). `label` es lo que se pinta:
 * "Airplanes" / "Helicopters", en plural, porque el selector describe el
 * ámbito de la oferta, no una aeronave concreta.
 *
 * Catálogo cerrado en TypeScript a propósito, no una tabla: son dos valores
 * fijados por el CHECK de la columna, no un catálogo que la empresa amplíe.
 */
export const OFFER_PRODUCT_TYPES: readonly { code: OfferProductType; label: string }[] = [
  { code: 'Aeroplane', label: 'Airplanes' },
  { code: 'Helicopter', label: 'Helicopters' },
];

export function getOfferProductTypeLabel(code: OfferProductType): string {
  return OFFER_PRODUCT_TYPES.find((p) => p.code === code)?.label ?? code;
}
