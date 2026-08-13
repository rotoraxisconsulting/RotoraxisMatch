import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import { SafeTechnicianView, AvailabilityStatus, VerificationStatus } from '../types';
import { TechnicianHabilitation } from '../types/technician';
import { MapFilters, MapFilterValue } from '../types/filters';
import { MapOfferMatchOption } from '../types/mapOffers';
import { TechnicianTypeCode } from '../types/catalog';
import { colors, spacing } from '../theme';
import { LICENSE_CATEGORIES } from '../constants/licenses';
import { useAircraftTypeRatingsCatalog } from '../state/useAircraftTypeRatingsCatalog';
import { buildAircraftRatingIndex } from '../constants/aircraftTypeRatings';
import { resolveTypeRatingLabels } from '../utils/v2CompatAdapters';
import { groupTechnicianMapMarkers } from '../utils/technicianMapMarkers';
import { CollapsibleAircraftFilter } from './CollapsibleAircraftFilter';
import {
  TECHNICIAN_MAP_AVAILABILITY,
  TechnicianMapHeader,
  TechnicianMapLegend,
} from './technician-map/TechnicianMapControls';
import { techUi } from './technician/TechnicianUI';
import { technicianTypeLabel } from '../constants/technicianTypes';

export interface TechnicianMapProps {
  technicians: SafeTechnicianView[];
  // Raw habilitations per technician id, keyed the same way as
  // technicians — used to resolve "Type ratings" catalog displayName
  // labels for pins/popups instead of the flattened
  // technician.aircraftTypes family/legacy-code strings.
  habilitationsById: Record<string, TechnicianHabilitation[]>;
  technicianTypesById: Record<string, TechnicianTypeCode[]>;
  filters: MapFilters;
  onFilterChange: (key: keyof MapFilters, value: MapFilterValue) => void;
  loading: boolean;
  onBack?: () => void;
  offerMatchesByTechnician?: Record<string, MapOfferMatchOption[]>;
  loadingOfferMatches?: boolean;
  onSendOffer?: (technicianId: string, offerId: string) => Promise<void>;
  onViewProfile?: (technicianId: string) => void;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function markerColor(s: AvailabilityStatus): string {
  return s === 'open_to_offers' ? colors.success : colors.textMuted;
}

function hasMapCoordinates(t: SafeTechnicianView): boolean {
  return Number.isFinite(Number(t.latitude)) && Number.isFinite(Number(t.longitude));
}

function availLabel(s: AvailabilityStatus): string {
  return s === 'open_to_offers' ? 'Open to offers' : 'Unavailable';
}

function availColor(s: AvailabilityStatus): string {
  return markerColor(s);
}

function verifColor(s: VerificationStatus): string {
  if (s === 'verified') return colors.success;
  if (s === 'pending') return colors.warning;
  return colors.textMuted;
}

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

// ─── popup inline styles (DOM context inside Leaflet popup) ──────────────────

const popupLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: 4,
};

const navyChipStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 7px',
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
  backgroundColor: `${colors.navy}18`,
  color: colors.navy,
  border: `1px solid ${colors.navy}30`,
  marginRight: 3,
  marginBottom: 3,
};

function statusChipStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    backgroundColor: `${color}22`,
    color,
    border: `1px solid ${color}44`,
    marginRight: 4,
  };
}

const popupActionButtonStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 44,
  marginTop: 10,
  border: 0,
  borderRadius: 11,
  backgroundColor: colors.navy,
  color: colors.white,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const popupProfileButtonStyle: React.CSSProperties = {
  ...popupActionButtonStyle,
  border: `1px solid #0369A1`,
  backgroundColor: colors.white,
  color: '#0369A1',
};

const popupOfferListStyle: React.CSSProperties = {
  marginTop: 8,
  paddingTop: 8,
  borderTop: `1px solid ${colors.border}`,
  maxHeight: 220,
  overflowY: 'auto',
};

const popupOfferEmptyStyle: React.CSSProperties = {
  marginTop: 8,
  padding: '9px 10px',
  borderRadius: 10,
  backgroundColor: colors.background,
  color: colors.textSecondary,
  fontSize: 12,
  lineHeight: '16px',
  fontWeight: 600,
};

const popupOfferRowStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 12,
  padding: 9,
  marginBottom: 7,
  backgroundColor: colors.white,
};

const tradeChipStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '3px 8px',
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 700,
  backgroundColor: '#E0F2FE',
  color: '#075985',
  border: '1px solid #7DD3FC',
  marginRight: 3,
  marginBottom: 3,
};

const groupedPopupListStyle: React.CSSProperties = {
  maxHeight: 320,
  overflowY: 'auto',
  paddingRight: 3,
};

const groupedPopupCardStyle: React.CSSProperties = {
  borderTop: `1px solid ${colors.border}`,
  paddingTop: 12,
  marginTop: 12,
};

// ─── inject leaflet css once (Metro web doesn't process CSS imports) ──────────

function useLeafletCss() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = '';
      document.head.appendChild(link);
    }

    if (!document.getElementById('technician-map-leaflet-css')) {
      const style = document.createElement('style');
      style.id = 'technician-map-leaflet-css';
      style.textContent = `
        .leaflet-top.leaflet-left { top: 96px; left: 12px; }
        .technician-marker-count.leaflet-tooltip {
          background: transparent;
          border: 0;
          box-shadow: none;
          color: #FFFFFF;
          font-size: 12px;
          font-weight: 800;
          line-height: 1;
          pointer-events: none;
        }
        .technician-marker-count.leaflet-tooltip::before { display: none; }
      `;
      document.head.appendChild(style);
    }
  }, []);
}

// ─── map auto-fit ─────────────────────────────────────────────────────────────

function MapAutoFit({ technicians }: { technicians: SafeTechnicianView[] }) {
  const map = useMap();
  const coordinateKey = technicians
    .map((t) => `${t.id}:${t.latitude},${t.longitude}`)
    .join('|');

  useEffect(() => {
    if (technicians.length === 0) return;
    const bounds = technicians
      .map((t) => [Number(t.latitude), Number(t.longitude)] as [number, number])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (bounds.length === 0) return;
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 7 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technicians.length, coordinateKey]);
  return null;
}

// ─── filter constants ─────────────────────────────────────────────────────────

const VERIFICATION_OPTIONS = [
  { value: 'verified' as const, label: 'Verified' },
  { value: 'pending' as const, label: 'Pending' },
  { value: 'rejected' as const, label: 'Rejected' },
];

// Dos estados desde 2026-07-29 — mismas opciones que la búsqueda, mismo campo
// y misma función de repositorio. Cierra el hallazgo I9 (mapa con 3 estados
// frente a búsqueda con 2) por construcción, no por convención.
const AVAILABILITY_OPTIONS = TECHNICIAN_MAP_AVAILABILITY.map(({ value, label }) => ({ value, label }));

type MultiFilterKey =
  | 'licenseCategories'
  | 'aircraftFamilyKeys'
  | 'verificationStatuses'
  | 'availabilityStatuses';

// aircraftFamilyKeys has no legacy singular fallback — it's a new field
// (Fase 3b screen 4), unlike the other three which predate the array-based
// multi-select and still support a single legacy value in MapFilters.
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

function activeFilterCount(filters: MapFilters): number {
  return (
    selectedFilterValues(filters, 'licenseCategories').length +
    selectedFilterValues(filters, 'aircraftFamilyKeys').length +
    selectedFilterValues(filters, 'verificationStatuses').length +
    selectedFilterValues(filters, 'availabilityStatuses').length
  );
}

// ─── main component ───────────────────────────────────────────────────────────

function PopupOfferSelector({
  technicianId,
  options,
  loading,
  sendingOfferKey,
  error,
  onSend,
}: {
  technicianId: string;
  options: MapOfferMatchOption[];
  loading: boolean;
  sendingOfferKey: string | null;
  error: string | null;
  onSend: (technicianId: string, offerId: string) => void;
}) {
  if (loading) {
    return <div style={popupOfferEmptyStyle}>Calculating offer matches...</div>;
  }

  if (options.length === 0) {
    return <div style={popupOfferEmptyStyle}>No published offers available for direct offers.</div>;
  }

  return (
    <div style={popupOfferListStyle}>
      {error ? (
        <div style={{ ...popupOfferEmptyStyle, color: colors.error, backgroundColor: `${colors.error}12` }}>
          {error}
        </div>
      ) : null}
      {options.map((option) => {
        const locked = isRequestLocked(option.requestStatus);
        const sending = sendingOfferKey === `${technicianId}:${option.offerId}`;
        const accent = offerScoreColor(option.score);

        return (
          <div key={option.offerId} style={popupOfferRowStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, lineHeight: '16px', fontWeight: 800, color: colors.text }}>
                  {option.title}
                </div>
                <div style={{ marginTop: 2, fontSize: 11, lineHeight: '15px', fontWeight: 600, color: colors.textSecondary }}>
                  {option.location}
                </div>
              </div>
              <div style={{
                minWidth: 48,
                border: `1px solid ${accent}`,
                borderRadius: 12,
                padding: '4px 6px',
                textAlign: 'center',
                backgroundColor: colors.background,
              }}>
                <div style={{ color: accent, fontSize: 13, lineHeight: '15px', fontWeight: 900 }}>{option.score}%</div>
                <div style={{ color: colors.textMuted, fontSize: 8, lineHeight: '10px', fontWeight: 800, textTransform: 'uppercase' }}>match</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <div style={{ color: colors.textSecondary, fontSize: 11, lineHeight: '14px', fontWeight: 700 }}>
                {option.label}
              </div>
              <button
                type="button"
                disabled={locked || sending}
                onClick={() => onSend(technicianId, option.offerId)}
                style={{
                  minHeight: 30,
                  border: 0,
                  borderRadius: 10,
                  padding: '0 10px',
                  backgroundColor: locked || sending ? colors.textMuted : colors.navy,
                  color: colors.white,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: locked || sending ? 'default' : 'pointer',
                }}
              >
                {sending ? 'Sending...' : requestStatusLabel(option.requestStatus)}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TechnicianMapLeafletImpl({
  technicians,
  habilitationsById,
  technicianTypesById,
  filters,
  onFilterChange,
  loading,
  onBack,
  offerMatchesByTechnician = {},
  loadingOfferMatches = false,
  onSendOffer,
  onViewProfile,
}: TechnicianMapProps) {
  useLeafletCss();
  const { ratings } = useAircraftTypeRatingsCatalog();
  const ratingIndex = useMemo(() => buildAircraftRatingIndex(ratings), [ratings]);
  const { width } = useWindowDimensions();
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedOfferTechId, setSelectedOfferTechId] = useState<string | null>(null);
  const [sendingOfferKey, setSendingOfferKey] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const filterPanelFrame = { top: 100, right: 12, width: Math.min(width - 24, 360) };

  const selectedLicenses = selectedFilterValues(filters, 'licenseCategories');
  const selectedAircraft = selectedFilterValues(filters, 'aircraftFamilyKeys');
  const selectedVerification = selectedFilterValues(filters, 'verificationStatuses');
  const selectedAvailability = selectedFilterValues(filters, 'availabilityStatuses');
  const filterCount = activeFilterCount(filters);
  const mappedTechnicians = useMemo(
    () => technicians.filter(hasMapCoordinates),
    [technicians],
  );
  const markerGroups = useMemo(
    () => groupTechnicianMapMarkers(mappedTechnicians),
    [mappedTechnicians],
  );

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

  async function handleSendOffer(technicianId: string, offerId: string) {
    if (!onSendOffer) return;
    setSendError(null);
    const key = `${technicianId}:${offerId}`;
    setSendingOfferKey(key);
    try {
      await onSendOffer(technicianId, offerId);
    } catch (error: any) {
      setSendError(error?.message ?? 'Could not send this direct offer.');
    } finally {
      setSendingOfferKey(null);
    }
  }

  function renderTechnicianPopup(t: SafeTechnicianView) {
    const tradeLabels = (technicianTypesById[t.id] ?? []).map(technicianTypeLabel);

    return (
      <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '2px 0' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: colors.text, marginBottom: 3 }}>
          {t.fullName ?? t.anonymousCode}
        </div>
        <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
          {t.city}, {t.country}
          {t.baseAirport ? ` · ${t.baseAirport}` : ''}
          {' · '}
          {t.yearsExperience} yrs exp
        </div>

        {tradeLabels.length > 0 ? (
          <div style={{ marginBottom: 7 }}>
            {tradeLabels.map((label) => (
              <span key={label} style={tradeChipStyle}>{label}</span>
            ))}
          </div>
        ) : (
          <div style={{ marginBottom: 8, color: colors.textMuted, fontSize: 11 }}>
            Trade not specified
          </div>
        )}

        <div style={{ marginBottom: 8 }}>
          <span style={statusChipStyle(availColor(t.availability.status ?? 'unavailable'))}>
            {availLabel(t.availability.status ?? 'unavailable')}
          </span>
          <span style={statusChipStyle(verifColor(t.verificationStatus))}>
            {t.verificationStatus}
          </span>
        </div>

        {t.licenseCategories.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <div style={popupLabelStyle}>Licenses</div>
            <div>
              {t.licenseCategories.map((license) => (
                <span key={license} style={navyChipStyle}>{license}</span>
              ))}
            </div>
          </div>
        )}

        {(() => {
          const typeRatings = resolveTypeRatingLabels(habilitationsById[t.id] ?? [], ratingIndex);
          return typeRatings.length > 0 ? (
            <div style={{ marginBottom: 6 }}>
              <div style={popupLabelStyle}>Type ratings</div>
              <div style={{ fontSize: 12, color: colors.textSecondary }}>
                {typeRatings.slice(0, 4).join(' · ')}
                {typeRatings.length > 4 ? ` +${typeRatings.length - 4}` : ''}
              </div>
            </div>
          ) : null;
        })()}

        {t.fullName && onViewProfile ? (
          <button
            type="button"
            style={popupProfileButtonStyle}
            onClick={() => onViewProfile(t.id)}
          >
            View profile
          </button>
        ) : null}
        <button
          type="button"
          style={popupActionButtonStyle}
          onClick={() => {
            setSendError(null);
            setSelectedOfferTechId((current) => (current === t.id ? null : t.id));
          }}
        >
          Send direct offer
        </button>
        {selectedOfferTechId === t.id ? (
          <PopupOfferSelector
            technicianId={t.id}
            options={offerMatchesByTechnician[t.id] ?? []}
            loading={loadingOfferMatches}
            sendingOfferKey={sendingOfferKey}
            error={sendError}
            onSend={handleSendOffer}
          />
        ) : null}
      </div>
    );
  }

  return (
    <View style={styles.container}>
      {/* Leaflet map fills the container */}
      <MapContainer
        center={[48.5, 8.0]}
        zoom={4}
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          bottom: 12,
          width: 'auto',
          height: 'auto',
          borderRadius: 22,
          overflow: 'hidden',
          border: '1px solid rgba(15,23,42,0.10)',
          boxShadow: '0px 18px 42px rgba(15,23,42,0.12)',
        }}
        zoomControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MapAutoFit technicians={mappedTechnicians} />

        {markerGroups.map((group) => {
          const isGroup = group.technicians.length > 1;
          const isApproximate = group.locationPrecision !== 'city';
          const singleTechnician = group.technicians[0];

          return (
            <CircleMarker
              key={group.key}
              center={[group.latitude, group.longitude]}
              radius={isGroup ? 22 : isApproximate ? 12 : 9}
              pathOptions={{
                fillColor: isGroup
                  ? colors.navy
                  : markerColor(singleTechnician.availability.status ?? 'unavailable'),
                color: isApproximate && !isGroup ? colors.navy : colors.white,
                fillOpacity: isGroup ? 0.92 : isApproximate ? 0.34 : 0.92,
                weight: isApproximate ? 3 : 2,
                dashArray: isApproximate ? '4 3' : undefined,
              }}
            >
              {isGroup ? (
                <Tooltip
                  permanent
                  direction="center"
                  className="technician-marker-count"
                  opacity={1}
                >
                  {group.technicians.length}
                </Tooltip>
              ) : isApproximate ? (
                <Tooltip direction="top">Approximate country location</Tooltip>
              ) : null}

              <Popup maxWidth={isGroup ? 320 : 260} minWidth={isGroup ? 260 : 220}>
              {isGroup ? (
                <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  <div style={{ color: colors.text, fontSize: 16, fontWeight: 800 }}>
                    {group.technicians.length} technicians at this map point
                  </div>
                  <div style={{ ...groupedPopupListStyle, marginTop: 8 }}>
                    {group.technicians.map((technician, index) => (
                      <div
                        key={technician.id}
                        style={index === 0 ? undefined : groupedPopupCardStyle}
                      >
                        {renderTechnicianPopup(technician)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : renderTechnicianPopup(singleTechnician)}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <TechnicianMapHeader
        visibleCount={technicians.length}
        filterCount={filterCount}
        loading={loading}
        onBack={onBack}
        onOpenFilters={() => setFilterOpen((open) => !open)}
      />

      {!loading && mappedTechnicians.length > 0 ? <TechnicianMapLegend /> : null}

      {/* ── Filter dropdown panel ── */}
      {filterOpen && (
        <View style={[styles.filterPanel, filterPanelFrame]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.filterPanelContent}
          >
            <View style={styles.filterPanelHeader}>
              <Text style={styles.filterPanelTitle}>Filter Technicians</Text>
              <View style={styles.filterPanelActions}>
                {filterCount > 0 && (
                  <TouchableOpacity style={styles.clearBtn} onPress={clearAll}>
                    <Text style={styles.clearBtnText}>Clear all</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.doneBtn} onPress={() => setFilterOpen(false)}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.filterPanelHelper}>
              Select multiple options in each group. Results match any option inside a group and all active groups together.
            </Text>

            <Text style={styles.sectionLabel}>License Category</Text>
            <View style={styles.chipRow}>
              {LICENSE_CATEGORIES.map((l) => (
                <TouchableOpacity
                  key={l.code}
                  style={[styles.chip, selectedLicenses.includes(l.code) && styles.chipActive]}
                  onPress={() => toggle('licenseCategories', l.code)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selectedLicenses.includes(l.code) }}
                >
                  <Text style={[styles.chipText, selectedLicenses.includes(l.code) && styles.chipTextActive]}>
                    {l.code}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Verification Status</Text>
            <View style={styles.chipRow}>
              {VERIFICATION_OPTIONS.map((v) => (
                <TouchableOpacity
                  key={v.value}
                  style={[styles.chip, selectedVerification.includes(v.value) && styles.chipActive]}
                  onPress={() => toggle('verificationStatuses', v.value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selectedVerification.includes(v.value) }}
                >
                  <Text style={[styles.chipText, selectedVerification.includes(v.value) && styles.chipTextActive]}>
                    {v.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Availability</Text>
            <View style={styles.chipRow}>
              {AVAILABILITY_OPTIONS.map((a) => (
                <TouchableOpacity
                  key={a.value}
                  style={[styles.chip, selectedAvailability.includes(a.value) && styles.chipActive]}
                  onPress={() => toggle('availabilityStatuses', a.value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selectedAvailability.includes(a.value) }}
                >
                  <Text style={[styles.chipText, selectedAvailability.includes(a.value) && styles.chipTextActive]}>
                    {a.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Aircraft Type</Text>
            <CollapsibleAircraftFilter
              selectedKeys={selectedAircraft}
              onChange={(next) => setMultiFilter('aircraftFamilyKeys', next)}
            />
          </ScrollView>
        </View>
      )}

    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: colors.background,
    padding: 12,
  },
  sidePanel: {
    position: 'absolute',
    top: 89,
    left: 28,
    zIndex: 1002,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: colors.surface,
    padding: 12,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 10,
  },
  panelTopRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  backButton: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButtonText: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '700',
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    zIndex: 1002,
  },
  filterBtn: {
    minHeight: 44,
    width: '100%',
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
  filterBtnActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  filterBtnText: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '700',
  },
  filterBtnTextActive: {
    color: colors.white,
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
  filterBadgeActive: {
    backgroundColor: colors.white,
  },
  filterBadgeTextActive: {
    color: colors.navy,
  },
  resultsCard: {
    minHeight: 44,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
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
  activeFiltersBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    maxHeight: 112,
    overflow: 'hidden',
  },
  legendCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    backgroundColor: colors.background,
    padding: 12,
    gap: 8,
  },
  panelLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },

  // Active chips
  activeChipsBar: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    zIndex: 1001,
  },
  activeChipsRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
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

  // Filter panel
  filterPanel: {
    position: 'absolute',
    width: 320,
    maxHeight: 520,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: techUi.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
    zIndex: 1003,
    overflow: 'hidden',
  },
  filterPanelContent: {
    padding: spacing.lg,
  },
  filterPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  filterPanelTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    color: techUi.text,
  },
  filterPanelHelper: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: techUi.textMuted,
    marginBottom: spacing.md,
  },
  filterPanelActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  clearBtn: {
    minHeight: 36,
    paddingHorizontal: 10,
    justifyContent: 'center',
    backgroundColor: techUi.surfaceSoft,
    borderRadius: 11,
  },
  clearBtnText: {
    fontSize: 12,
    color: techUi.textSoft,
    fontWeight: '700',
  },
  doneBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: techUi.accent,
    borderRadius: 11,
  },
  doneBtnText: {
    fontSize: 12,
    color: colors.white,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: techUi.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: techUi.borderSoft,
    backgroundColor: techUi.surfaceSoft,
  },
  chipActive: {
    backgroundColor: techUi.accentSoft,
    borderColor: techUi.accent,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: techUi.textSoft,
  },
  chipTextActive: {
    color: techUi.accent,
    fontWeight: '800',
  },

  // Legend
  legend: {
    position: 'absolute',
    bottom: 36,
    right: 12,
    backgroundColor: 'rgba(10,22,40,0.85)',
    borderRadius: 10,
    padding: spacing.sm,
    gap: 5,
    zIndex: 1001,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  collapseToggle: {
    alignSelf: 'center',
    paddingVertical: 2,
    paddingHorizontal: 24,
  },
});
