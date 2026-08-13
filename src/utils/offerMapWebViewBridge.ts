/**
 * Builds a WebView injection without interpolating offer data as JavaScript.
 *
 * The inner JSON string is the payload. JSON.stringify around that string is
 * the JavaScript string literal, so quotes, apostrophes, newlines and markup
 * remain data instead of becoming executable source.
 */
export function buildOfferMapMarkerUpdateScript(payload: unknown): string {
  const serializedPayload = JSON.stringify(payload) ?? 'null';
  return `window.updateOfferMarkers(${JSON.stringify(serializedPayload)}); true;`;
}
