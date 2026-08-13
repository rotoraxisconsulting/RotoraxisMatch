import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { OfferMapFilters, OfferMapItem } from '../types/offerMap';
import {
  activeOfferMapFilterCount,
} from '../types/offerMap';
import {
  groupOfferMapItems,
  OfferMapFilterSheet,
  OfferMapHeader,
  OfferMapLegend,
  OfferMapStatusOverlay,
  offerMapApplicationLabel,
  offerMapContractLabel,
  offerMapLabelColor,
  offerMapMarkerColor,
  offerMapProductLabel,
} from './offer-map/OfferMapControls';
import { techUi } from './technician/TechnicianUI';
import { buildOfferMapMarkerUpdateScript } from '../utils/offerMapWebViewBridge';

export interface OfferMapProps {
  offers: OfferMapItem[];
  filters: OfferMapFilters;
  onFiltersChange: (filters: OfferMapFilters) => void;
  loading: boolean;
  error: Error | null;
  totalCount: number;
  unmappedCount: number;
  onRetry: () => void;
  onBack?: () => void;
  onViewOffer: (offerId: string) => void;
}

const MAP_READY_TIMEOUT_MS = 12_000;

const LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
    #map { position: absolute; inset: 0; background: #E2EBF2; }
    .leaflet-top.leaflet-left { top: 96px !important; left: 12px !important; }
    .leaflet-popup-content-wrapper {
      border-radius: 16px !important;
      padding: 0 !important;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .leaflet-popup-content { margin: 14px !important; min-width: 232px; max-width: 286px; }
    .leaflet-popup-tip-container { display: none; }
    .leaflet-popup-close-button { top: 8px !important; right: 8px !important; font-size: 20px !important; color: #527088 !important; }
    .leaflet-control-attribution { font-size: 8px !important; }
    .offer-list { max-height: 320px; overflow-y: auto; padding-right: 2px; }
    .offer-count-label {
      background: #0A1520 !important;
      border: 2px solid #FFFFFF !important;
      border-radius: 12px !important;
      color: #FFFFFF !important;
      box-shadow: none !important;
      font-size: 10px !important;
      font-weight: 800 !important;
      line-height: 18px !important;
      min-width: 18px !important;
      padding: 0 4px !important;
      text-align: center !important;
    }
    .offer-count-label:before { display: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    (function installEarlyErrorRelay() {
      function earlyPost(message) {
        try { window.ReactNativeWebView.postMessage(message); } catch (error) {}
      }
      window.__offerMapPost = earlyPost;
      window.onerror = function(message, source, line, column, error) {
        var detail = error && error.message ? error.message : String(message || 'unknown JavaScript error');
        earlyPost('offer-map-error:JavaScript error: ' + detail);
        return false;
      };
      window.onunhandledrejection = function(event) {
        var reason = event && event.reason;
        var detail = reason && reason.message ? reason.message : String(reason || 'unhandled promise rejection');
        earlyPost('offer-map-error:JavaScript error: ' + detail);
      };
      earlyPost('offer-map-html-started');
    })();
  </script>
  <script>
    function post(message) {
      try {
        if (typeof window.__offerMapPost === 'function') window.__offerMapPost(message);
        else window.ReactNativeWebView.postMessage(message);
      } catch (error) {}
    }
    function escHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    function escAttr(value) { return escHtml(value); }
    function chip(label, color, background) {
      return '<span style="display:inline-block;margin:0 4px 4px 0;padding:3px 7px;border-radius:10px;background:'+background+';color:'+color+';font-size:10px;font-weight:700;">'+escHtml(label)+'</span>';
    }
    function buildOfferCard(offer, showDivider) {
      var application = offer.applicationLabel
        ? chip(offer.applicationLabel, '#065F46', '#C6F0E1')
        : '';
      var eligibility = offer.blocked
        ? chip('Not eligible', '#B91C1C', '#FECACA')
        : chip(offer.matchLabel, offer.labelColor, '#EBF2F8');
      return '<div style="'+(showDivider ? 'border-top:1px solid #CCDAE8;padding-top:12px;margin-top:12px;' : '')+'">' +
        '<div style="padding-right:18px;font-size:14px;line-height:18px;font-weight:800;color:#0A1520;">'+escHtml(offer.title)+'</div>' +
        '<div style="margin-top:2px;font-size:11px;line-height:15px;font-weight:600;color:#2B3D52;">'+escHtml(offer.companyName)+'</div>' +
        '<div style="margin-top:7px;font-size:11px;line-height:15px;color:#527088;">'+escHtml(offer.location)+(offer.approximate ? ' &bull; Country-level location' : '')+'</div>' +
        '<div style="margin-top:7px;">'+chip(offer.score+'% match', offer.labelColor, '#EBF2F8')+eligibility+application+'</div>' +
        '<div style="margin-top:2px;font-size:10px;line-height:14px;color:#527088;">'+escHtml(offer.contractLabel)+' &bull; '+escHtml(offer.productLabel)+'</div>' +
        '<button type="button" data-offer-id="'+escAttr(offer.id)+'" style="width:100%;min-height:44px;margin-top:10px;border:0;border-radius:12px;background:#0891B2;color:#FFFFFF;font-size:12px;font-weight:800;">View offer</button>' +
      '</div>';
    }
    function buildPopup(group) {
      var heading = group.offers.length > 1
        ? '<div style="margin-bottom:10px;font-size:11px;font-weight:800;color:#527088;">'+group.offers.length+' offers at this location</div>'
        : '';
      return '<div class="offer-list">'+heading+group.offers.map(function(offer, index) {
        return buildOfferCard(offer, index > 0);
      }).join('')+'</div>';
    }

    document.addEventListener('click', function(event) {
      var target = event.target;
      while (target && target !== document) {
        if (target.getAttribute) {
          var offerId = target.getAttribute('data-offer-id');
          if (offerId) {
            post('offer-map-view:' + offerId);
            return;
          }
        }
        target = target.parentNode;
      }
    });

    var map = null;
    var markersLayer = null;
    var ready = false;
    var pendingPayload = null;

    function renderGroups(groups) {
      markersLayer.clearLayers();
      var bounds = [];
      groups.forEach(function(group) {
        var latitude = Number(group.latitude);
        var longitude = Number(group.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !group.offers.length) return;
        var representative = group.offers[0];
        var approximate = group.locationPrecision === 'country';
        var marker = L.circleMarker([latitude, longitude], {
          radius: group.offers.length > 1 ? 13 : 10,
          fillColor: representative.markerColor,
          fillOpacity: approximate ? 0.34 : 0.92,
          color: approximate ? representative.markerColor : '#FFFFFF',
          weight: approximate ? 3 : 2.5,
          dashArray: approximate ? '5 4' : null,
        });
        marker.bindPopup(buildPopup(group), { maxWidth: 310, closeButton: true });
        if (group.offers.length > 1) {
          marker.bindTooltip(String(group.offers.length), {
            permanent: true,
            direction: 'center',
            className: 'offer-count-label',
          });
        }
        marker.addTo(markersLayer);
        bounds.push([latitude, longitude]);
      });

      if (bounds.length === 1) map.setView(bounds[0], 6);
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [58, 58], maxZoom: 7 });
      post('offer-map-markers:' + groups.length);
    }

    function parseGroups(payload) {
      var groups = JSON.parse(payload);
      if (!Array.isArray(groups)) throw new Error('Offer marker payload is not an array');
      return groups;
    }

    window.updateOfferMarkers = function(payload) {
      post('offer-map-update-received');
      try {
        if (!ready || !markersLayer) {
          pendingPayload = payload;
          return;
        }
        renderGroups(parseGroups(payload));
      } catch (error) {
        post('offer-map-error:' + (error.message || 'marker error'));
      }
    };

    function initMap() {
      try {
        post('offer-map-leaflet-loaded');
        map = L.map('map', { zoomControl: true }).setView([48.5, 8.0], 3);
        post('offer-map-created');
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
          maxZoom: 18,
        }).addTo(map);
        markersLayer = L.layerGroup().addTo(map);
        post('offer-map-marker-layer-created');
        ready = true;
        post('offer-map-ready');
        if (pendingPayload !== null) {
          var payload = pendingPayload;
          pendingPayload = null;
          renderGroups(parseGroups(payload));
        }
      } catch (error) {
        post('offer-map-error:' + (error.message || 'initialization error'));
      }
    }
  </script>
  <script
    src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"
    crossorigin=""
    onload="initMap()"
    onerror="window.__offerMapPost && window.__offerMapPost('offer-map-error:Leaflet failed to load')"
  ></script>
</body>
</html>`;

export function OfferMap({
  offers,
  filters,
  onFiltersChange,
  loading,
  error,
  totalCount,
  unmappedCount,
  onRetry,
  onBack,
  onViewOffer,
}: OfferMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const groups = useMemo(() => groupOfferMapItems(offers), [offers]);
  const payload = useMemo(() => groups.map((group) => ({
    ...group,
    offers: group.offers.map((offer) => ({
      id: offer.id,
      title: offer.title,
      companyName: offer.companyName,
      location: offer.location,
      score: offer.score,
      matchLabel: offer.matchLabel,
      blocked: offer.blockers.length > 0,
      markerColor: offerMapMarkerColor(offer),
      labelColor: offerMapLabelColor(offer),
      contractLabel: offerMapContractLabel(offer.contractType),
      productLabel: offerMapProductLabel(offer.productType),
      applicationLabel: offerMapApplicationLabel(offer.applicationStatus),
      approximate: offer.locationPrecision === 'country',
    })),
  })), [groups]);
  const markerUpdateScript = useMemo(
    () => buildOfferMapMarkerUpdateScript(payload),
    [payload],
  );

  useEffect(() => {
    if (!mapReady) return;
    webViewRef.current?.injectJavaScript(markerUpdateScript);
  }, [markerUpdateScript, mapReady]);

  useEffect(() => {
    if (mapReady || mapError || error) return;
    const timeout = setTimeout(() => {
      setMapError('The map took too long to initialize. Check your connection and try again.');
    }, MAP_READY_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [error, mapKey, mapReady, mapError]);

  function handleMessage(event: WebViewMessageEvent) {
    const message = event.nativeEvent.data;
    if (message === 'offer-map-ready') {
      setMapReady(true);
      setMapError(null);
      return;
    }
    if (message.startsWith('offer-map-view:')) {
      onViewOffer(message.slice('offer-map-view:'.length));
      return;
    }
    if (message.startsWith('offer-map-error:')) {
      setMapReady(false);
      setMapError(message.slice('offer-map-error:'.length));
    }
  }

  function retryMap() {
    setMapReady(false);
    setMapError(null);
    setMapKey((value) => value + 1);
  }

  const filterCount = activeOfferMapFilterCount(filters);
  const effectiveError = error?.message ?? mapError;
  const emptyBecauseFilters = !loading && !effectiveError && offers.length === 0 && totalCount > 0 && filterCount > 0;
  const emptyBecauseLocations = !loading && !effectiveError && offers.length === 0 && totalCount > 0 && unmappedCount === totalCount;
  const emptyPublished = !loading && !effectiveError && totalCount === 0;

  return (
    <View style={styles.container}>
      <View style={styles.webViewContainer}>
        <WebView
          key={mapKey}
          ref={webViewRef}
          source={{ html: LEAFLET_HTML }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          onLoadStart={() => {
            setMapReady(false);
            setMapError(null);
          }}
          onMessage={handleMessage}
          onError={(event) => {
            setMapReady(false);
            setMapError(event.nativeEvent.description || 'The map document could not be loaded.');
          }}
          onHttpError={(event) => {
            setMapReady(false);
            setMapError(`Map request failed with HTTP ${event.nativeEvent.statusCode}.`);
          }}
          onContentProcessDidTerminate={() => {
            setMapReady(false);
            setMapError('The iOS map process stopped unexpectedly. Try loading it again.');
          }}
          style={styles.map}
        />
      </View>

      <OfferMapHeader
        visibleCount={offers.length}
        totalCount={totalCount}
        unmappedCount={unmappedCount}
        filters={filters}
        onBack={onBack}
        onOpenFilters={() => setFilterOpen(true)}
      />

      {!loading && !effectiveError && offers.length > 0 ? <OfferMapLegend /> : null}

      {!effectiveError && (loading || !mapReady) ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View style={styles.loadingCard}>
            <ActivityIndicator color={techUi.accent} size="large" />
          </View>
        </View>
      ) : null}

      {effectiveError ? (
        <OfferMapStatusOverlay
          kind="error"
          title="Map unavailable"
          message={effectiveError}
          actionLabel="Try again"
          onAction={() => {
            onRetry();
            retryMap();
          }}
        />
      ) : null}

      {emptyBecauseFilters ? (
        <OfferMapStatusOverlay
          kind="empty"
          title="No offers match these filters"
          message="Reset the filters to see all published opportunities."
          actionLabel="Reset filters"
          onAction={() => onFiltersChange({})}
        />
      ) : null}

      {emptyBecauseLocations ? (
        <OfferMapStatusOverlay
          kind="empty"
          title="No mappable locations"
          message="Published offers are available, but none currently has a location that can be placed on the map."
        />
      ) : null}

      {emptyPublished ? (
        <OfferMapStatusOverlay
          kind="empty"
          title="No published offers"
          message="New opportunities will appear here as soon as companies publish them."
        />
      ) : null}

      <OfferMapFilterSheet
        visible={filterOpen}
        filters={filters}
        onChange={onFiltersChange}
        onClose={() => setFilterOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: techUi.page },
  webViewContainer: { flex: 1, width: '100%' },
  map: { flex: 1, width: '100%', backgroundColor: techUi.page },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingCard: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: techUi.border,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
});
