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
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { ArrowLeft, CheckCircle, Clock, Send, SlidersHorizontal } from 'lucide-react-native';
import { SafeTechnicianView } from '../types';
import { TechnicianHabilitation } from '../types/technician';
import { MapFilters, MapFilterValue } from '../types/filters';
import { MapOfferMatchOption } from '../types/mapOffers';
import { colors, spacing } from '../theme';
import { LICENSE_CATEGORIES } from '../constants/licenses';
import { useAircraftTypeRatingsCatalog } from '../state/useAircraftTypeRatingsCatalog';
import { getFamilies } from '../constants/aircraftTypeRatingViews';
import { buildAircraftRatingIndex } from '../constants/aircraftTypeRatings';
import { resolveTypeRatingLabels } from '../utils/v2CompatAdapters';
import { CollapsibleAircraftFilter } from './CollapsibleAircraftFilter';
import { notify, confirmAction } from '../utils/platformAlert';

// ─── types ────────────────────────────────────────────────────────────────────

export interface TechnicianMapProps {
  technicians: SafeTechnicianView[];
  // Raw habilitations per technician id, keyed the same way as
  // technicians — used to resolve "Type ratings" catalog displayName
  // labels for pins/popups instead of the flattened
  // technician.aircraftTypes family/legacy-code strings.
  habilitationsById: Record<string, TechnicianHabilitation[]>;
  filters: MapFilters;
  onFilterChange: (key: keyof MapFilters, value: MapFilterValue) => void;
  loading: boolean;
  onBack?: () => void;
  offerMatchesByTechnician?: Record<string, MapOfferMatchOption[]>;
  loadingOfferMatches?: boolean;
  onSendOffer?: (technicianId: string, offerId: string) => Promise<void>;
}

// ─── Leaflet HTML ────────────────────────────────────────────────────────────
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
    .leaflet-top.leaflet-left {
      top: 92px !important;
      left: 12px !important;
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
      rejected:   { hex: '#EF4444', bg: 'rgba(239,68,68,0.12)',   br: 'rgba(239,68,68,0.3)'  },
    };

    function availLabel(s) {
      return s === 'open_to_offers' ? 'Open to offers' : 'Unavailable';
    }
    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function escAttr(s) {
      return escHtml(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    function chip(text, c) {
      return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:'+c.bg+';color:'+c.hex+';border:1px solid '+c.br+';margin:0 3px 3px 0;">'+escHtml(text)+'</span>';
    }
    function buildPopup(m) {
      var ac = AVAIL[m.availability] || AVAIL.unavailable;
      var vc = VERIF[m.verificationStatus] || VERIF.pending;
      var licenses = (m.licenseCategories || []).map(function(l) {
        return '<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:600;background:rgba(10,22,40,0.07);color:#1E3A5F;border:1px solid rgba(10,22,40,0.15);margin:0 3px 3px 0;">'+escHtml(l)+'</span>';
      }).join('');
      var tr = m.typeRatings || [];
      var typeRatings = tr.slice(0,4).map(escHtml).join(' &bull; ') + (tr.length>4 ? ' +' + (tr.length-4) : '');
      var sendButton = '<button type="button" data-tech-id="'+escAttr(m.id)+'" onclick="post(\\'map-select-technician:\\' + this.getAttribute(\\'data-tech-id\\'))" style="width:100%;min-height:38px;margin-top:10px;border:0;border-radius:11px;background:#0A1628;color:#FFFFFF;font-size:12px;font-weight:700;">Send direct offer</button>';
      return '<div>' +
        '<div style="font-weight:700;font-size:15px;color:#1A2332;margin-bottom:2px;">'+escHtml(m.anonymousCode)+'</div>' +
        '<div style="font-size:12px;color:#475569;margin-bottom:8px;">'+escHtml(m.city)+', '+escHtml(m.country)+(m.baseAirport?' &bull; '+escHtml(m.baseAirport):'')+' &bull; '+escHtml(String(m.yearsExperience))+' yrs exp</div>' +
        '<div style="margin-bottom:8px;">'+chip(availLabel(m.availability),ac)+chip(m.verificationStatus,vc)+'</div>' +
        (licenses ? '<div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Licenses</div><div style="margin-bottom:8px;">'+licenses+'</div>' : '') +
        (typeRatings ? '<div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Type ratings</div><div style="font-size:12px;color:#475569;margin-bottom:6px;">'+typeRatings+'</div>' : '') +
        sendButton +
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

        if (bounds.length === 1) {
          map.setView(bounds[0], 5);
        } else if (bounds.length > 1) {
          map.fitBounds(bounds, { padding: [54, 54], maxZoom: 7 });
        }

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

// ─── helpers ─────────────────────────────────────────────────────────────────

type MultiFilterKey =
  | 'licenseCategories'
  | 'aircraftFamilyKeys'
  | 'verificationStatuses'
  | 'availabilityStatuses';

// aircraftFamilyKeys has no legacy single-value fallback — the old
// singular filters.aircraftType held a legacy code/label, not a family
// key, and is unused since Fase 3b screen 4 (2026-07-22).
const LEGACY_FILTER_KEYS: Partial<Record<MultiFilterKey, keyof MapFilters>> = {
  licenseCategories: 'licenseCategory',
  verificationStatuses: 'verificationStatus',
  availabilityStatuses: 'availabilityStatus',
};

function selectedFilterValues(filters: MapFilters, key: MultiFilterKey): string[] {
  const value = filters[key];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  const legacyKey = LEGACY_FILTER_KEYS[key];
  const legacyValue = legacyKey ? filters[legacyKey] : undefined;
  return typeof legacyValue === 'string' ? [legacyValue] : [];
}

function activeFilterCount(f: MapFilters): number {
  return (
    selectedFilterValues(f, 'licenseCategories').length +
    selectedFilterValues(f, 'aircraftFamilyKeys').length +
    selectedFilterValues(f, 'verificationStatuses').length +
    selectedFilterValues(f, 'availabilityStatuses').length
  );
}

function optionLabel(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function hasMapCoordinates(t: SafeTechnicianView): boolean {
  return Number.isFinite(Number(t.latitude)) && Number.isFinite(Number(t.longitude));
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
  { value: 'rejected', label: 'Rejected' },
] as const;

// Dos estados desde 2026-07-29 — ver la nota gemela en
// TechnicianMapLeafletImpl.tsx. Las dos implementaciones del mapa ofrecen las
// mismas opciones por construcción.
const AVAILABILITY_OPTIONS = [
  { value: 'open_to_offers', label: 'Open to offers' },
  { value: 'unavailable', label: 'Unavailable' },
] as const;

interface FilterSheetProps {
  visible: boolean;
  filters: MapFilters;
  onFilterChange: (key: keyof MapFilters, value: MapFilterValue) => void;
  onClose: () => void;
}

function FilterSheet({ visible, filters, onFilterChange, onClose }: FilterSheetProps) {
  const selectedLicenses = selectedFilterValues(filters, 'licenseCategories');
  const selectedAircraft = selectedFilterValues(filters, 'aircraftFamilyKeys');
  const selectedVerification = selectedFilterValues(filters, 'verificationStatuses');
  const selectedAvailability = selectedFilterValues(filters, 'availabilityStatuses');

  function setMultiFilter(key: MultiFilterKey, values: string[]) {
    onFilterChange(key, values.length > 0 ? values : undefined);
  }

  function toggle(key: MultiFilterKey, value: string) {
    const selected = selectedFilterValues(filters, key);
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    setMultiFilter(key, next);
  }
  function clearAll() {
    onFilterChange('licenseCategories', undefined);
    onFilterChange('aircraftFamilyKeys', undefined);
    onFilterChange('verificationStatuses', undefined);
    onFilterChange('availabilityStatuses', undefined);
    onFilterChange('licenseCategory', undefined);
    onFilterChange('verificationStatus', undefined);
    onFilterChange('availabilityStatus', undefined);
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
          <Text style={styles.sheetHelper}>
            Select multiple options in each group. Results combine all active groups.
          </Text>

          <Text style={styles.sheetSectionLabel}>License Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {LICENSE_CATEGORIES.map((l) => (
                <FilterChip
                  key={l.code}
                  label={l.code}
                  selected={selectedLicenses.includes(l.code)}
                  onPress={() => toggle('licenseCategories', l.code)}
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
                selected={selectedVerification.includes(v.value)}
                onPress={() => toggle('verificationStatuses', v.value)}
              />
            ))}
          </View>

          <Text style={[styles.sheetSectionLabel, styles.sectionGap]}>Availability</Text>
          <View style={styles.chipRow}>
            {AVAILABILITY_OPTIONS.map((a) => (
              <FilterChip
                key={a.value}
                label={a.label}
                selected={selectedAvailability.includes(a.value)}
                onPress={() => toggle('availabilityStatuses', a.value)}
              />
            ))}
          </View>

          <View style={styles.sectionGap}>
            <CollapsibleAircraftFilter
              selectedKeys={selectedAircraft}
              onChange={(next) => setMultiFilter('aircraftFamilyKeys', next)}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

function offerScoreColor(score: number): string {
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.blue;
  if (score >= 40) return colors.warning;
  return colors.textMuted;
}

function requestStatusLabel(status?: string): string {
  if (status === 'pending') return 'Pending';
  if (status === 'accepted') return 'Accepted';
  if (status === 'rejected' || status === 'withdrawn') return 'Send again';
  return 'Send';
}

function isRequestLocked(status?: string): boolean {
  return status === 'pending' || status === 'accepted';
}

function OfferSelectionSheet({
  visible,
  technician,
  options,
  loading,
  sendingOfferId,
  onSend,
  onClose,
}: {
  visible: boolean;
  technician: SafeTechnicianView | null;
  options: MapOfferMatchOption[];
  loading: boolean;
  sendingOfferId: string | null;
  onSend: (offerId: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <View style={styles.offerSheetTitleWrap}>
            <Text style={styles.sheetTitle}>Send direct offer</Text>
            {technician ? <Text style={styles.offerSheetSub}>{technician.anonymousCode}</Text> : null}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll}>
          {loading ? (
            <View style={styles.offerLoadingRow}>
              <ActivityIndicator color={colors.navy} />
              <Text style={styles.offerLoadingText}>Calculating offer matches...</Text>
            </View>
          ) : null}

          {!loading && options.length === 0 ? (
            <View style={styles.offerEmptyState}>
              <Text style={styles.offerEmptyTitle}>No published offers</Text>
              <Text style={styles.offerEmptyText}>Publish a job offer before sending direct offers from the map.</Text>
            </View>
          ) : null}

          {!loading && options.map((option) => {
            const locked = isRequestLocked(option.requestStatus);
            const sending = sendingOfferId === option.offerId;
            const accent = offerScoreColor(option.score);

            return (
              <View key={option.offerId} style={styles.offerOption}>
                <View style={styles.offerOptionTop}>
                  <View style={styles.offerOptionText}>
                    <Text style={styles.offerOptionTitle} numberOfLines={2}>{option.title}</Text>
                    <Text style={styles.offerOptionMeta} numberOfLines={1}>
                      {option.location} - {option.contractType.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <View style={[styles.offerScoreBadge, { borderColor: accent }]}>
                    <Text style={[styles.offerScoreValue, { color: accent }]}>{option.score}%</Text>
                    <Text style={styles.offerScoreLabel}>match</Text>
                  </View>
                </View>

                <View style={styles.offerOptionBottom}>
                  <Text style={styles.offerMatchLabel}>{option.label}</Text>
                  <TouchableOpacity
                    style={[
                      styles.offerSendButton,
                      (locked || sending) && styles.offerSendButtonLocked,
                    ]}
                    onPress={() => onSend(option.offerId)}
                    activeOpacity={0.75}
                    disabled={locked || sending}
                  >
                    {sending ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : locked ? (
                      option.requestStatus === 'accepted'
                        ? <CheckCircle color={colors.white} size={14} strokeWidth={2.2} />
                        : <Clock color={colors.white} size={14} strokeWidth={2.2} />
                    ) : (
                      <Send color={colors.white} size={14} strokeWidth={2.2} />
                    )}
                    <Text style={styles.offerSendButtonText}>
                      {option.requestStatus ? requestStatusLabel(option.requestStatus) : 'Send'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function TechnicianMap({
  technicians,
  habilitationsById,
  filters,
  onFilterChange,
  loading,
  onBack,
  offerMatchesByTechnician = {},
  loadingOfferMatches = false,
  onSendOffer,
}: TechnicianMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [selectedOfferTechId, setSelectedOfferTechId] = useState<string | null>(null);
  const [sendingOfferId, setSendingOfferId] = useState<string | null>(null);

  // Step 3: debug state visible in the RN layer
  const [, setWebViewStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [, setLastMessage] = useState<string>('—');
  const [, setWebViewError] = useState<string | null>(null);

  const { ratings } = useAircraftTypeRatingsCatalog();
  const ratingIndex = useMemo(() => buildAircraftRatingIndex(ratings), [ratings]);
  const familyByKey = useMemo(() => new Map(getFamilies(ratings).map((f) => [f.key, f])), [ratings]);

  const markerPayload = useMemo(
    () =>
      technicians
        .filter(hasMapCoordinates)
        .map((t) => ({
          id: t.id,
          anonymousCode: t.anonymousCode,
          latitude: Number(t.latitude),
          longitude: Number(t.longitude),
          baseAirport: t.baseAirport,
          city: t.city,
          country: t.country,
          licenseCategories: t.licenseCategories,
          typeRatings: resolveTypeRatingLabels(habilitationsById[t.id] ?? [], ratingIndex),
          // `specialties` se quito del payload el 2026-07-29: el campo no tiene
          // almacenamiento (siempre []) y la plantilla HTML inyectada nunca lo
          // leyo. Ver app/technician/profile.tsx.
          verificationStatus: t.verificationStatus,
          yearsExperience: t.yearsExperience,
          availability: t.availability.status,
          matchingScore: t.matchingScore,
        })),
    [technicians, habilitationsById, ratingIndex],
  );

  useEffect(() => {
    if (!mapReady || !webViewRef.current) return;
    const payload = JSON.stringify(markerPayload);
    webViewRef.current.injectJavaScript(
      `window.updateMarkers(${JSON.stringify(payload)});true;`,
    );
  }, [markerPayload, mapReady]);

  const filterCount = activeFilterCount(filters);
  const selectedLicenses = selectedFilterValues(filters, 'licenseCategories');
  const selectedAircraft = selectedFilterValues(filters, 'aircraftFamilyKeys');
  const selectedVerification = selectedFilterValues(filters, 'verificationStatuses');
  const selectedAvailability = selectedFilterValues(filters, 'availabilityStatuses');
  const activeChips = [
    ...selectedLicenses.map((value) => ({ key: 'licenseCategories' as const, value, label: value })),
    ...selectedVerification.map((value) => ({
      key: 'verificationStatuses' as const,
      value,
      label: optionLabel(VERIFICATION_OPTIONS, value),
    })),
    ...selectedAvailability.map((value) => ({
      key: 'availabilityStatuses' as const,
      value,
      label: optionLabel(AVAILABILITY_OPTIONS, value),
    })),
    ...selectedAircraft.map((value) => ({
      key: 'aircraftFamilyKeys' as const,
      value,
      label: familyByKey.get(value)?.displayName ?? value,
    })),
  ];

  function removeFilterValue(key: MultiFilterKey, value: string) {
    const next = selectedFilterValues(filters, key).filter((item) => item !== value);
    onFilterChange(key, next.length > 0 ? next : undefined);
  }

  const selectedOfferTechnician = selectedOfferTechId
    ? technicians.find((technician) => technician.id === selectedOfferTechId) ?? null
    : null;
  const selectedOfferOptions = selectedOfferTechId ? offerMatchesByTechnician[selectedOfferTechId] ?? [] : [];

  async function handleSendOffer(offerId: string) {
    if (!selectedOfferTechId || !onSendOffer) return;
    setSendingOfferId(offerId);
    try {
      await onSendOffer(selectedOfferTechId, offerId);
    } catch (error: any) {
      notify('Could not send offer', error?.message ?? 'An error occurred while sending this direct offer.');
    } finally {
      setSendingOfferId(null);
    }
  }

  return (
    <View style={styles.container}>

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
          source={{ html: LEAFLET_HTML }}
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
            if (typeof msg === 'string' && msg.startsWith('map-select-technician:')) {
              setSelectedOfferTechId(msg.replace('map-select-technician:', ''));
              return;
            }
            // Leaflet: consider map ready once initMap completes
            if (msg === 'map-ready') {
              setMapReady(true);
            }
          }}
        />
      </View>

      {/* Filter button + count pill */}
      <View style={styles.topOverlay}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft color={colors.navy} size={17} strokeWidth={2.3} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => setFilterSheetOpen(true)}
          activeOpacity={0.85}
        >
          <SlidersHorizontal color={colors.navy} size={17} strokeWidth={2.2} />
          <Text style={styles.filterBtnText}>Filters</Text>
          {filterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <View style={styles.countPill}>
          {loading ? (
            <ActivityIndicator color={colors.navy} size="small" />
          ) : (
            <>
              <Text style={styles.countNumber}>{technicians.length}</Text>
              <Text style={styles.countLabel}>{technicians.length === 1 ? 'result' : 'results'}</Text>
            </>
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
            {activeChips.map((chip) => (
              <TouchableOpacity
                key={`${chip.key}-${chip.value}`}
                style={styles.activeChip}
                onPress={() => removeFilterValue(chip.key, chip.value)}
              >
                <Text style={styles.activeChipText}>{chip.label} x</Text>
              </TouchableOpacity>
            ))}
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

      <OfferSelectionSheet
        visible={selectedOfferTechId !== null}
        technician={selectedOfferTechnician}
        options={selectedOfferOptions}
        loading={loadingOfferMatches}
        sendingOfferId={sendingOfferId}
        onSend={handleSendOffer}
        onClose={() => setSelectedOfferTechId(null)}
      />
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

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
    top: spacing.xl +48,
    right: spacing.md,
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: spacing.sm,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  filterBtn: {
    minHeight: 44,
    minWidth: 122,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  filterBtnText: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '700',
  },
  filterBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: colors.white,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  countPill: {
    minHeight: 44,
    minWidth: 82,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  countNumber: {
    color: colors.navy,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '800',
  },
  countLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  activeFiltersOverlay: {
    position: 'absolute',
    top: 68,
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
  offerSheetTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  offerSheetSub: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
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
  offerLoadingRow: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  offerLoadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  offerEmptyState: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: 6,
  },
  offerEmptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  offerEmptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  offerOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 12,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  offerOptionTop: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  offerOptionText: {
    flex: 1,
    minWidth: 0,
  },
  offerOptionTitle: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
  },
  offerOptionMeta: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  offerScoreBadge: {
    minWidth: 58,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  offerScoreValue: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900',
  },
  offerScoreLabel: {
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  offerOptionBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  offerMatchLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  offerSendButton: {
    minHeight: 36,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  offerSendButtonLocked: {
    backgroundColor: colors.textMuted,
  },
  offerSendButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  sheetHelper: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginBottom: spacing.md,
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
