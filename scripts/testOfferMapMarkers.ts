import assert from 'node:assert/strict';
import type { OfferMapItem } from '../src/types/offerMap';
import { buildOfferMapMarkerIcon, offerMapMarkerIconGeometry } from '../src/utils/offerMapMarkerIcon';
import {
  OFFER_MAP_SHAPE_MIN_ZOOM,
  offerMapBaseTier,
  offerMapGroupTierInput,
  projectToPixels,
  resolveOfferMapMarkerTiers,
  type OfferMapTierGroup,
} from '../src/utils/offerMapMarkerTier';

type GroupOffer = OfferMapTierGroup['offers'][number];

function offer(overrides: Partial<GroupOffer> = {}): GroupOffer {
  return {
    contractType: 'long_term' as OfferMapItem['contractType'],
    salary: { amount: 35000, currency: 'USD', period: 'year' },
    score: 70,
    blockers: [],
    ...overrides,
  };
}

function group(
  key: string,
  latitude: number,
  longitude: number,
  offers: GroupOffer[] = [offer()],
): OfferMapTierGroup {
  return { key, latitude, longitude, offers };
}

function tiersFor(groups: OfferMapTierGroup[], zoom: number) {
  return resolveOfferMapMarkerTiers(groups.map(offerMapGroupTierInput), zoom);
}

async function main() {
  // --- Proyección Web Mercator -------------------------------------------
  // Los mismos números que devuelve Leaflet en map.project.
  assert.deepEqual(projectToPixels(0, 0, 0), { x: 128, y: 128 });
  assert.equal(projectToPixels(0, 180, 0).x, 256);
  assert.equal(projectToPixels(0, -180, 0).x, 0);
  assert.ok(projectToPixels(85.05112878, 0, 0).y < 0.001, 'El tope de Mercator es el borde superior');
  assert.ok(projectToPixels(-85.05112878, 0, 0).y > 255.999, 'El tope sur es el borde inferior');
  assert.deepEqual(projectToPixels(0, 0, 2), { x: 512, y: 512 }, 'Cada zoom duplica la escala');
  // Latitudes imposibles se recortan en vez de devolver Infinity.
  assert.ok(Number.isFinite(projectToPixels(90, 0, 4).y));
  assert.ok(Number.isFinite(projectToPixels(-90, 0, 4).y));
  // Un zoom corrupto no puede tumbar el mapa.
  for (const zoom of [NaN, Infinity, -Infinity, undefined as unknown as number]) {
    assert.ok(Number.isFinite(projectToPixels(48, 2, zoom).x), String(zoom));
  }

  // --- Nivel de reserva por zoom -----------------------------------------
  assert.equal(offerMapBaseTier(OFFER_MAP_SHAPE_MIN_ZOOM), 'shape');
  assert.equal(offerMapBaseTier(OFFER_MAP_SHAPE_MIN_ZOOM - 1), 'dot');
  assert.equal(offerMapBaseTier(18), 'shape');
  assert.equal(offerMapBaseTier(NaN), 'dot');

  // --- Geometría de cada nivel -------------------------------------------
  const salary = { amount: 35000, currency: 'USD', period: 'year' } as const;
  const labelGeometry = offerMapMarkerIconGeometry({ shape: 'circle', color: '#0891B2', salary, tier: 'label' });
  const shapeGeometry = offerMapMarkerIconGeometry({ shape: 'circle', color: '#0891B2', salary, tier: 'shape' });
  const dotGeometry = offerMapMarkerIconGeometry({ shape: 'circle', color: '#0891B2', salary, tier: 'dot' });
  assert.deepEqual(shapeGeometry.iconSize, [56, 56]);
  assert.deepEqual(dotGeometry.iconSize, [32, 32]);
  assert.ok(labelGeometry.iconSize[0] >= 132, 'La burbuja nunca baja del ancho mínimo');
  assert.ok(
    labelGeometry.iconSize[0] > shapeGeometry.iconSize[0] * 2,
    'La burbuja ocupa el doble de largo que la forma: por eso colisiona antes',
  );

  // Sin nivel explícito el marcador sigue siendo el de cerca (compatibilidad).
  assert.deepEqual(
    offerMapMarkerIconGeometry({ shape: 'circle', color: '#0891B2', salary }),
    labelGeometry,
  );

  // El importe se pinta entero en la burbuja, jamás abreviado para caber.
  const bubble = buildOfferMapMarkerIcon({
    shape: 'circle',
    color: '#0891B2',
    salary: { amount: 1234567.89, currency: 'EUR', period: 'year' },
    tier: 'label',
  });
  assert.ok(bubble.markerSvg.includes('1,234,567.89 EUR'), 'El importe viaja completo');

  // Bajar de nivel quita el texto, no lo recorta.
  for (const tier of ['shape', 'dot'] as const) {
    const icon = buildOfferMapMarkerIcon({ shape: 'circle', color: '#0891B2', salary, tier });
    assert.ok(!icon.markerSvg.includes('<text'), tier + ' no lleva texto');
    assert.ok(icon.markerSvg.includes('offer-marker-selection'), tier + ' conserva el anillo de selección');
  }

  // Un cluster ignora el nivel: siempre recuento, nunca importe.
  for (const tier of ['label', 'shape', 'dot'] as const) {
    const cluster = buildOfferMapMarkerIcon({ shape: 'cluster', color: '#0A1520', count: 7, salary, tier });
    assert.deepEqual(cluster.iconSize, [56, 56], 'cluster a ' + tier);
    assert.ok(cluster.markerSvg.includes('>7<'), 'El cluster pinta su recuento');
    assert.ok(!cluster.markerSvg.includes('USD'), 'El cluster no pinta importes');
  }
  // Un grupo con varias ofertas es cluster aunque le pidan burbuja.
  assert.deepEqual(
    buildOfferMapMarkerIcon({ shape: 'circle', color: '#0891B2', count: 3, salary, tier: 'label' }).iconSize,
    [56, 56],
  );

  // --- Quién puede aspirar a burbuja -------------------------------------
  assert.ok(offerMapGroupTierInput(group('a', 48, 2)).label, 'Una oferta suelta con salario sí');
  assert.equal(
    offerMapGroupTierInput(group('a', 48, 2, [offer({ salary: null })])).label,
    null,
    'Sin salario no hay burbuja que medir',
  );
  assert.equal(
    offerMapGroupTierInput(group('a', 48, 2, [offer(), offer()])).label,
    null,
    'Un cluster no tiene burbuja',
  );

  // --- Colocación: el caso disperso no se toca ---------------------------
  // Berlín y Madrid a zoom 6 caben de sobra: hoy se ven bien y deben seguir.
  const spread = tiersFor([group('berlin', 52.52, 13.4), group('madrid', 40.41, -3.7)], 6);
  assert.equal(spread.get('berlin'), 'label');
  assert.equal(spread.get('madrid'), 'label');

  // --- Colocación: el caso de la captura ---------------------------------
  // Tres ofertas europeas a zoom 4, que es donde hoy se solapan.
  const crowded = [
    group('berlin', 52.52, 13.4, [offer({ score: 90 })]),
    group('paris', 48.85, 2.35, [offer({ score: 70 })]),
    group('madrid', 40.41, -3.7, [offer({ score: 50 })]),
  ];
  const packed = tiersFor(crowded, 4);
  assert.ok(
    [...packed.values()].filter((tier) => tier === 'label').length < 3,
    'A zoom continental no caben las tres burbujas',
  );
  assert.equal(packed.get('berlin'), 'label', 'La burbuja se la queda el mejor match');
  assert.equal(packed.size, 3, 'Ninguna oferta se queda sin marcador');
  for (const tier of packed.values()) {
    assert.ok(tier === 'label' || tier === 'dot', 'Debajo de zoom 6 se degrada a punto');
  }

  // El mismo conjunto muy de cerca: todas recuperan su importe.
  const zoomedIn = tiersFor(crowded, 12);
  assert.deepEqual([...zoomedIn.values()], ['label', 'label', 'label']);

  // --- Prioridad ----------------------------------------------------------
  // Separadas ~120px a zoom 9: cabe una burbuja, no dos. Se la queda la oferta
  // que el técnico puede firmar, aunque la otra puntúe casi el doble — una
  // cualificación que falta es un bloqueo legal, no una preferencia.
  const contested = [
    group('blocked', 48.85, 2.35, [offer({ score: 99, blockers: ['Missing B1 licence'] })]),
    group('eligible', 48.85, 2.68, [offer({ score: 41 })]),
  ];
  const byEligibility = tiersFor(contested, 9);
  assert.equal(byEligibility.get('eligible'), 'label', 'Cualificar pesa más que puntuar alto');
  assert.equal(byEligibility.get('blocked'), 'shape');

  // Prácticamente encima (~6px): no rotula ninguna. Una burbuja colocada entre
  // dos pines no dice de quién es el importe, así que se baja de nivel y el
  // número se lee al tocar. Ningún marcador se esconde por ello.
  const stacked = tiersFor([
    group('near-a', 48.85, 2.35, [offer({ score: 90 })]),
    group('near-b', 48.86, 2.36, [offer({ score: 80 })]),
  ], 9);
  assert.deepEqual([...stacked.values()], ['shape', 'shape']);

  // El reparto es estable: mismo dato, mismo resultado, sin importar el orden.
  const shuffled = tiersFor([...contested].reverse(), 9);
  assert.deepEqual([...shuffled.entries()].sort(), [...byEligibility.entries()].sort());

  // --- Nadie desaparece ---------------------------------------------------
  // Cien ofertas apiladas a zoom 3: el peor caso de solape.
  const dense = Array.from({ length: 100 }, (_, index) => group(
    'offer-' + String(index).padStart(3, '0'),
    45 + (index % 10) * 0.05,
    5 + Math.floor(index / 10) * 0.05,
    [offer({ score: index })],
  ));
  const denseTiers = tiersFor(dense, 3);
  assert.equal(denseTiers.size, 100, 'Cada grupo recibe un nivel: ninguno se descarta');
  // Ni siquiera la mejor rotula aquí, y es lo que toca: un importe suelto
  // encima de una pila de cien no dice de cuál de las cien es.
  assert.ok(
    [...denseTiers.values()].every((tier) => tier === 'dot'),
    'Apiladas a zoom continental, todas bajan a punto',
  );
  // Y en cuanto hay sitio, la mejor recupera su importe.
  assert.equal(tiersFor(dense, 14).get('offer-099'), 'label');

  // --- Sin datos ----------------------------------------------------------
  assert.equal(tiersFor([], 5).size, 0);

  console.log('Offer map marker tests passed: projection, zoom tiers, label collisions, priority and cluster fallbacks.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
