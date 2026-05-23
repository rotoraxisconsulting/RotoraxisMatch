import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeTechnicianView } from '../types';
import { MapFilters } from '../types/filters';
import { colors, spacing } from '../theme';
import { LICENSE_CATEGORIES } from '../constants/licenses';
import { AIRCRAFT_TYPES } from '../constants/aircraftTypes';

// ─── types ────────────────────────────────────────────────────────────────────

export interface TechnicianMapProps {
  technicians: SafeTechnicianView[];
  filters: MapFilters;
  onFilterChange: (key: keyof MapFilters, value: string | undefined) => void;
  loading: boolean;
}

// ─── STEP 1 — minimal static HTML (no Leaflet, no CDN) ───────────────────────
// Purpose: prove the WebView renders at all before introducing Leaflet.
// Once "WebView is working" is visible in the emulator, swap this for LEAFLET_HTML.

function buildMinimalHtml(techCount: number): string {
  const coordText = 'Initial center: 48.5, 8.0 (Europe)';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: #0A1628;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    h1 { color: #ffffff; font-size: 28px; margin: 0 0 16px; text-align: center; }
    p  { color: #94C5FF; font-size: 16px; margin: 6px 0; text-align: center; }
  </style>
</head>
<body>
  <h1>WebView is working</h1>
  <p>Technicians: ${techCount}</p>
  <p>${coordText}</p>
  <script>
    try {
      window.ReactNativeWebView.postMessage("minimal-webview-loaded");
    } catch(e) {}
  </script>
</body>
</html>`;
}

// ─── STEP 6+7 — Leaflet HTML (reintroduced once static WebView is confirmed) ──
// Uses jsdelivr CDN (HTTPS). All JS wrapped in try/catch.
// Posts status messages: leaflet-script-start | leaflet-loaded | map-created | markers-added
// Full html/body/#map sizing so the map fills the WebView.

const LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"
        crossorigin=""/>
  <style>
    html, body, #map {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
    }
    #map { position: absolute; inset: 0; background: #F8FAFC; }
    .leaflet-popup-content-wrapper {
      border-radius: 12px !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 0 !important;
    }
    .leaflet-popup-content { margin: 14px 16px !important; min-width: 200px; max-width: 240px; }
    .leaflet-popup-tip-container { display: none; }
    .leaflet-popup-close-button { top: 8px !important; right: 8px !important; font-size: 18px !important; color: #94A3B8 !important; }
    .leaflet-control-attribution { font-size: 8px !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    function post(msg) {
      try { window.ReactNativeWebView.postMessage(msg); } catch(e) {}
    }

    var map = null;
    var markersLayer = null;
    var pendingPayload = null;
    var isMapReady = false;

    post("html-started");

    var AVAIL = {
      available:      { hex: '#10B981', bg: 'rgba(16,185,129,0.12)', br: 'rgba(16,185,129,0.3)' },
      open_to_offers: { hex: '#00B4D8', bg: 'rgba(0,180,216,0.12)',  br: 'rgba(0,180,216,0.3)' },
      unavailable:    { hex: '#94A3B8', bg: 'rgba(148,163,184,0.12)',br: 'rgba(148,163,184,0.3)' },
    };
    var VERIF = {
      verified:   { hex: '#10B981', bg: 'rgba(16,185,129,0.12)',  br: 'rgba(16,185,129,0.3)' },
      pending:    { hex: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  br: 'rgba(245,158,11,0.3)' },
      unverified: { hex: '#94A3B8', bg: 'rgba(148,163,184,0.12)',br: 'rgba(148,163,184,0.3)' },
    };

    function availLabel(s) {
      return s === 'available' ? 'Available' : s === 'open_to_offers' ? 'Open to offers' : 'Unavailable';
    }
    function scoreColor(n) { return n >= 70 ? '#10B981' : n >= 40 ? '#F59E0B' : '#94A3B8'; }
    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function chip(text, c) {
      return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:'+c.bg+';color:'+c.hex+';border:1px solid '+c.br+';margin:0 3px 3px 0;">'+escHtml(text)+'</span>';
    }
    function buildPopup(m) {
      var ac = AVAIL[m.availability] || AVAIL.unavailable;
      var vc = VERIF[m.verificationStatus] || VERIF.unverified;
      var licenses = (m.licenseCategories || []).map(function(l) {
        return '<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;background:rgba(10,22,40,0.07);color:#1E3A5F;border:1px solid rgba(10,22,40,0.15);margin:0 3px 3px 0;">'+escHtml(l)+'</span>';
      }).join('');
      var at = m.aircraftTypes || [];
      var aircraft = at.slice(0,4).map(escHtml).join(' &bull; ') + (at.length>4 ? ' +' + (at.length-4) : '');
      var scoreHtml = (m.matchingScore != null)
        ? '<div style="margin-top:6px;font-size:12px;font-weight:600;color:'+scoreColor(m.matchingScore)+';">'+m.matchingScore+'% match</div>'
        : '';
      return '<div>' +
        '<div style="font-weight:700;font-size:15px;color:#1A2332;margin-bottom:2px;">'+escHtml(m.anonymousCode)+'</div>' +
        '<div style="font-size:12px;color:#475569;margin-bottom:8px;">'+escHtml(m.city)+', '+escHtml(m.country)+(m.baseAirport?' &bull; '+escHtml(m.baseAirport):'')+' &bull; '+escHtml(String(m.yearsExperience))+' yrs exp</div>' +
        '<div style="margin-bottom:8px;">'+chip(availLabel(m.availability),ac)+chip(m.verificationStatus,vc)+'</div>' +
        (licenses ? '<div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Licenses</div><div style="margin-bottom:8px;">'+licenses+'</div>' : '') +
        (aircraft ? '<div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Aircraft</div><div style="font-size:12px;color:#475569;margin-bottom:6px;">'+aircraft+'</div>' : '') +
        scoreHtml +
        '<div style="margin-top:8px;font-size:11px;color:#94A3B8;font-style:italic;">Use Search to send a direct offer.</div>' +
      '</div>';
    }

    function renderMarkers(arr) {
      try {
        markersLayer.clearLayers();
        var bounds = [];
        var added = 0;
        arr.forEach(function(m) {
          var lat = Number(m.latitude);
          var lng = Number(m.longitude);
          if (!m.anonymousCode || isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
            post("invalid-coordinates:" + (m.anonymousCode || "unknown"));
            return;
          }
          var ac = AVAIL[m.availability] || AVAIL.unavailable;
          var circle = L.circleMarker([lat, lng], {
            radius: 10,
            fillColor: ac.hex,
            color: '#ffffff',
            fillOpacity: 0.9,
            weight: 2.5,
          });
          circle.bindPopup(buildPopup(m), { maxWidth: 260, closeButton: true });
          circle.addTo(markersLayer);
          bounds.push([lat, lng]);
          added++;
        });

        post("markers-added:" + added);
      } catch(e) {
        post("update-markers-error:" + (e.message || "render-error"));
      }
    }

    function initMap() {
      try {
        post("leaflet-loaded");

        map = L.map('map', { zoomControl: true }).setView([48.5, 8.0], 3);
        post("map-created");

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
          maxZoom: 18,
        }).addTo(map);

        markersLayer = L.layerGroup().addTo(map);
        post("marker-layer-created");

        isMapReady = true;
        post("map-ready");

        if (pendingPayload !== null) {
          var p = pendingPayload;
          pendingPayload = null;
          try {
            var arr = JSON.parse(p);
            if (Array.isArray(arr)) {
              post("update-markers-parsed:" + arr.length);
              renderMarkers(arr);
            }
          } catch(e) {
            post("update-markers-error:" + (e.message || "flush-error"));
          }
        }
      } catch(e) {
        post("map-init-error:" + (e.message || "init-error"));
      }
    }

    window.updateMarkers = function(payload) {
      post("update-markers-received");
      try {
        if (!isMapReady || !markersLayer) {
          pendingPayload = payload;
          return;
        }
        var arr = JSON.parse(payload);
        if (!Array.isArray(arr)) {
          post("update-markers-error:not-an-array");
          return;
        }
        post("update-markers-parsed:" + arr.length);
        renderMarkers(arr);
      } catch(e) {
        post("update-markers-error:" + (e.message || "parse-error"));
      }
    };

    post("leaflet-loading");
  </script>
  <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"
          crossorigin=""
          onload="initMap()"
          onerror="post('leaflet-load-error')"></script>
</body>
</html>`;

// ─── toggle: set USE_MINIMAL=true to test static WebView; false for Leaflet ───
const USE_MINIMAL = false;

// ─── helpers ─────────────────────────────────────────────────────────────────

function activeFilterCount(f: MapFilters): number {
  return [f.licenseCategory, f.aircraftType, f.verificationStatus].filter(Boolean).length;
}

// ─── filter chip ─────────────────────────────────────────────────────────────

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterChip, selected && styles.filterChipActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── filter sheet ─────────────────────────────────────────────────────────────

const VERIFICATION_OPTIONS = [
  { value: 'verified', label: 'Verified' },
  { value: 'pending', label: 'Pending' },
  { value: 'unverified', label: 'Unverified' },
] as const;

interface FilterSheetProps {
  visible: boolean;
  filters: MapFilters;
  onFilterChange: (key: keyof MapFilters, value: string | undefined) => void;
  onClose: () => void;
}

function FilterSheet({ visible, filters, onFilterChange, onClose }: FilterSheetProps) {
  function toggle(key: keyof MapFilters, value: string) {
    onFilterChange(key, filters[key] === value ? undefined : value);
  }
  function clearAll() {
    onFilterChange('licenseCategory', undefined);
    onFilterChange('aircraftType', undefined);
    onFilterChange('verificationStatus', undefined);
  }
  const hasFilters = activeFilterCount(filters) > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Filter Technicians</Text>
          <View style={styles.sheetHeaderRight}>
            {hasFilters && (
              <TouchableOpacity onPress={clearAll} style={styles.clearAllBtn}>
                <Text style={styles.clearAllText}>Clear all</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll}>
          <Text style={styles.sheetSectionLabel}>License Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {LICENSE_CATEGORIES.map((l) => (
                <FilterChip
                  key={l.code}
                  label={l.code}
                  selected={filters.licenseCategory === l.code}
                  onPress={() => toggle('licenseCategory', l.code)}
                />
              ))}
            </View>
          </ScrollView>

          <Text style={[styles.sheetSectionLabel, styles.sectionGap]}>Verification Status</Text>
          <View style={styles.chipRow}>
            {VERIFICATION_OPTIONS.map((v) => (
              <FilterChip
                key={v.value}
                label={v.label}
                selected={filters.verificationStatus === v.value}
                onPress={() => toggle('verificationStatus', v.value)}
              />
            ))}
          </View>

          <Text style={[styles.sheetSectionLabel, styles.sectionGap]}>Aircraft Type</Text>
          <View style={styles.chipGrid}>
            {AIRCRAFT_TYPES.map((a) => (
              <FilterChip
                key={a}
                label={a}
                selected={filters.aircraftType === a}
                onPress={() => toggle('aircraftType', a)}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function TechnicianMap({
  technicians,
  filters,
  onFilterChange,
  loading,
}: TechnicianMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Step 3: debug state visible in the RN layer
  const [webViewStatus, setWebViewStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [lastMessage, setLastMessage] = useState<string>('—');
  const [webViewError, setWebViewError] = useState<string | null>(null);

  const markerPayload = useMemo(
    () =>
      technicians.map((t) => ({
        id: t.id,
        anonymousCode: t.anonymousCode,
        latitude: Number(t.latitude),
        longitude: Number(t.longitude),
        baseAirport: t.baseAirport,
        city: t.city,
        country: t.country,
        licenseCategories: t.licenseCategories,
        aircraftTypes: t.aircraftTypes,
        specialties: t.specialties,
        verificationStatus: t.verificationStatus,
        yearsExperience: t.yearsExperience,
        availability: t.availability.status,
        matchingScore: t.matchingScore,
      })),
    [technicians],
  );

  useEffect(() => {
    if (!mapReady || !webViewRef.current || USE_MINIMAL) return;
    const payload = JSON.stringify(markerPayload);
    webViewRef.current.injectJavaScript(
      `window.updateMarkers(${JSON.stringify(payload)});true;`,
    );
  }, [markerPayload, mapReady]);

  const filterCount = activeFilterCount(filters);

  const htmlSource = USE_MINIMAL
    ? buildMinimalHtml(technicians.length)
    : LEAFLET_HTML;

  return (
    <View style={styles.container}>

      {/* Step 3: debug panel — visible RN text outside the WebView */}
      <View style={styles.debugPanel}>
        <Text style={styles.debugText}>WV: {webViewStatus}</Text>
        <Text style={styles.debugText}>msg: {lastMessage}</Text>
        <Text style={styles.debugText}>techs: {technicians.length}</Text>
        <Text style={styles.debugText}>
          coords: 48.500, 8.000 (Europe)
        </Text>
        {webViewError ? <Text style={styles.debugError}>err: {webViewError}</Text> : null}
      </View>

      {/* WebView container — explicit height so it is never zero */}
      <View style={styles.webViewContainer}>
        <WebView
          ref={webViewRef}
          // Step 9: required props
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          source={{ html: htmlSource }}
          style={styles.webView}
          // Step 4: all WebView event callbacks
          onLoadStart={() => setWebViewStatus('loading')}
          onLoadEnd={() => {
            setWebViewStatus('loaded');
            // Do NOT set mapReady here — wait for "map-ready" postMessage
            // (Leaflet script still needs to load from CDN after onLoadEnd fires)
          }}
          onError={(e) => {
            setWebViewStatus('error');
            setWebViewError(e.nativeEvent.description ?? 'unknown error');
          }}
          onHttpError={(e) => {
            setWebViewError(`HTTP ${e.nativeEvent.statusCode} ${e.nativeEvent.url}`);
          }}
          // Step 4+5: receive postMessage from HTML
          onMessage={(e) => {
            const msg = e.nativeEvent.data;
            setLastMessage(msg);
            // Leaflet: consider map ready once initMap completes
            if (!USE_MINIMAL && msg === 'map-ready') {
              setMapReady(true);
            }
          }}
        />
      </View>

      {/* Filter button + count pill */}
      <View style={styles.topOverlay}>
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => setFilterSheetOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.filterBtnText}>
            Filters{filterCount > 0 ? ` · ${filterCount} active` : ''}
          </Text>
        </TouchableOpacity>

        <View style={styles.countPill}>
          {loading ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.countPillText}>
              {technicians.length} {technicians.length === 1 ? 'result' : 'results'}
            </Text>
          )}
        </View>
      </View>

      {/* Active filter chips */}
      {filterCount > 0 && (
        <View style={styles.activeFiltersOverlay}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeFiltersRow}
          >
            {filters.licenseCategory && (
              <TouchableOpacity
                style={styles.activeChip}
                onPress={() => onFilterChange('licenseCategory', undefined)}
              >
                <Text style={styles.activeChipText}>{filters.licenseCategory} ×</Text>
              </TouchableOpacity>
            )}
            {filters.verificationStatus && (
              <TouchableOpacity
                style={styles.activeChip}
                onPress={() => onFilterChange('verificationStatus', undefined)}
              >
                <Text style={styles.activeChipText}>{filters.verificationStatus} ×</Text>
              </TouchableOpacity>
            )}
            {filters.aircraftType && (
              <TouchableOpacity
                style={styles.activeChip}
                onPress={() => onFilterChange('aircraftType', undefined)}
              >
                <Text style={styles.activeChipText}>{filters.aircraftType} ×</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        {[
          { color: colors.success, label: 'Available' },
          { color: colors.technician, label: 'Open to offers' },
          { color: colors.textMuted, label: 'Unavailable' },
        ].map(({ color, label }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Filter sheet */}
      <FilterSheet
        visible={filterSheetOpen}
        filters={filters}
        onFilterChange={onFilterChange}
        onClose={() => setFilterSheetOpen(false)}
      />
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Step 3: debug panel at top of screen
  debugPanel: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 100,
  },
  debugText: {
    color: '#00FF88',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  debugError: {
    color: '#FF4444',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Step 2: explicit container dimensions so WebView is never zero-height
  webViewContainer: {
    flex: 1,
    width: '100%',
    minHeight: 450,
  },
  webView: {
    flex: 1,
    width: '100%',
  },

  topOverlay: {
    position: 'absolute',
    top: spacing.sm + 68, // below debug panel
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 10,
  },
  filterBtn: {
    flex: 1,
    backgroundColor: colors.navy,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  filterBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  countPill: {
    backgroundColor: colors.navy,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  countPillText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },

  activeFiltersOverlay: {
    position: 'absolute',
    top: 54 + 68, // below debug panel
    left: 0,
    right: 0,
    zIndex: 9,
  },
  activeFiltersRow: {
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  activeChip: {
    backgroundColor: colors.blue,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeChipText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },

  legend: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.md,
    backgroundColor: 'rgba(10,22,40,0.85)',
    borderRadius: 10,
    padding: spacing.sm,
    gap: 4,
    zIndex: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '500',
  },

  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.lg,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  sheetHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  clearAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.borderLight,
    borderRadius: 8,
  },
  clearAllText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  closeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.blue,
    borderRadius: 8,
  },
  closeBtnText: {
    fontSize: 13,
    color: colors.white,
    fontWeight: '600',
  },
  sheetScroll: {
    padding: spacing.lg,
  },
  sheetSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  sectionGap: {
    marginTop: spacing.lg,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingBottom: 4,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingBottom: spacing.xl,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  filterChipActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
});
