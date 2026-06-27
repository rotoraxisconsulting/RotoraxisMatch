import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { ArrowLeft, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react-native';
import { SafeTechnicianView, AvailabilityStatus, VerificationStatus } from '../types';
import { MapFilters, MapFilterValue } from '../types/filters';
import { MapOfferMatchOption } from '../types/mapOffers';
import { colors, spacing } from '../theme';
import { LICENSE_CATEGORIES } from '../constants/licenses';
import { AIRCRAFT_TYPES } from '../constants/aircraftTypes';

export interface TechnicianMapProps {
  technicians: SafeTechnicianView[];
  filters: MapFilters;
  onFilterChange: (key: keyof MapFilters, value: MapFilterValue) => void;
  loading: boolean;
  onBack?: () => void;
  offerMatchesByTechnician?: Record<string, MapOfferMatchOption[]>;
  loadingOfferMatches?: boolean;
  onSendOffer?: (technicianId: string, offerId: string) => Promise<void>;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function markerColor(s: AvailabilityStatus): string {
  if (s === 'available') return colors.success;
  if (s === 'open_to_offers') return colors.technician;
  return colors.textMuted;
}

function hasMapCoordinates(t: SafeTechnicianView): boolean {
  return Number.isFinite(Number(t.latitude)) && Number.isFinite(Number(t.longitude));
}

function availLabel(s: AvailabilityStatus): string {
  if (s === 'available') return 'Available';
  if (s === 'open_to_offers') return 'Open to offers';
  return 'Unavailable';
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
  minHeight: 38,
  marginTop: 10,
  border: 0,
  borderRadius: 11,
  backgroundColor: colors.navy,
  color: colors.white,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
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

// ─── inject leaflet css once (Metro web doesn't process CSS imports) ──────────

function useLeafletCss() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'leaflet-css';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);
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

const AVAILABILITY_OPTIONS = [
  { value: 'available' as const, label: 'Available' },
  { value: 'open_to_offers' as const, label: 'Open to offers' },
  { value: 'unavailable' as const, label: 'Unavailable' },
];

type MultiFilterKey =
  | 'licenseCategories'
  | 'aircraftTypes'
  | 'verificationStatuses'
  | 'availabilityStatuses';

const LEGACY_FILTER_KEYS: Record<MultiFilterKey, keyof MapFilters> = {
  licenseCategories: 'licenseCategory',
  aircraftTypes: 'aircraftType',
  verificationStatuses: 'verificationStatus',
  availabilityStatuses: 'availabilityStatus',
};

function selectedFilterValues(filters: MapFilters, key: MultiFilterKey): string[] {
  const value = filters[key];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  const legacyValue = filters[LEGACY_FILTER_KEYS[key]];
  return typeof legacyValue === 'string' ? [legacyValue] : [];
}

function activeFilterCount(filters: MapFilters): number {
  return (
    selectedFilterValues(filters, 'licenseCategories').length +
    selectedFilterValues(filters, 'aircraftTypes').length +
    selectedFilterValues(filters, 'verificationStatuses').length +
    selectedFilterValues(filters, 'availabilityStatuses').length
  );
}

function optionLabel(options: readonly { value: string; label: string }[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
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
  filters,
  onFilterChange,
  loading,
  onBack,
  offerMatchesByTechnician = {},
  loadingOfferMatches = false,
  onSendOffer,
}: TechnicianMapProps) {
  useLeafletCss();
  const { width } = useWindowDimensions();
  const isCompactMap = width < 760;
  const [filterOpen, setFilterOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(isCompactMap);
  const [selectedOfferTechId, setSelectedOfferTechId] = useState<string | null>(null);
  const [sendingOfferKey, setSendingOfferKey] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const sidePanelWidth = Math.min(width - 40, isCompactMap ? 224 : 232);
  const filterPanelFrame = isCompactMap
    ? { top: 320, left: 20, width: Math.min(width - 40, 320) }
    : { left: sidePanelWidth + 40 };

  const selectedLicenses = selectedFilterValues(filters, 'licenseCategories');
  const selectedAircraft = selectedFilterValues(filters, 'aircraftTypes');
  const selectedVerification = selectedFilterValues(filters, 'verificationStatuses');
  const selectedAvailability = selectedFilterValues(filters, 'availabilityStatuses');
  const filterCount = activeFilterCount(filters);
  const mappedTechnicians = technicians.filter(hasMapCoordinates);

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
    onFilterChange('aircraftTypes', undefined);
    onFilterChange('verificationStatuses', undefined);
    onFilterChange('availabilityStatuses', undefined);
    onFilterChange('licenseCategory', undefined);
    onFilterChange('aircraftType', undefined);
    onFilterChange('verificationStatus', undefined);
    onFilterChange('availabilityStatus', undefined);
  }

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
    ...selectedAircraft.map((value) => ({ key: 'aircraftTypes' as const, value, label: value })),
  ];
  const legendItems = [
    { color: colors.success, label: 'Available' },
    { color: colors.technician, label: 'Open to offers' },
    { color: colors.textMuted, label: 'Unavailable' },
  ];

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

        {mappedTechnicians.map((t) => (
          <CircleMarker
            key={t.id}
            center={[Number(t.latitude), Number(t.longitude)]}
            radius={9}
            pathOptions={{
              fillColor: markerColor(t.availability.status ?? 'unavailable'),
              color: '#ffffff',
              fillOpacity: 0.92,
              weight: 2,
            }}
          >
            <Popup maxWidth={260} minWidth={220}>
              <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '2px 0' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: colors.text, marginBottom: 3 }}>
                  {t.anonymousCode}
                </div>
                <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                  {t.city}, {t.country}
                  {t.baseAirport ? ` · ${t.baseAirport}` : ''}
                  {' · '}
                  {t.yearsExperience} yrs exp
                </div>

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
                      {t.licenseCategories.map((l) => (
                        <span key={l} style={navyChipStyle}>{l}</span>
                      ))}
                    </div>
                  </div>
                )}

                {t.aircraftTypes.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={popupLabelStyle}>Aircraft</div>
                    <div style={{ fontSize: 12, color: colors.textSecondary }}>
                      {t.aircraftTypes.slice(0, 4).join(' · ')}
                      {t.aircraftTypes.length > 4 ? ` +${t.aircraftTypes.length - 4}` : ''}
                    </div>
                  </div>
                )}

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
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* ── Side panel ── */}
      <View style={[styles.sidePanel, { width: sidePanelWidth }]}>
        {/* Back + Results — always visible */}
        <View style={styles.panelTopRow}>
          <TouchableOpacity
            style={[styles.backButton, { flex: 1 }]}
            onPress={onBack}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft color={colors.navy} size={17} strokeWidth={2.3} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>

          <View style={[styles.resultsCard, { width: 76 }]}>
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

        {/* Expandable section — hidden on mobile when collapsed */}
        {(!isCompactMap || !panelCollapsed) && (
          <>
            <TouchableOpacity
              style={[styles.filterBtn, filterOpen && styles.filterBtnActive]}
              onPress={() => setFilterOpen((v) => !v)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Filters"
            >
              <SlidersHorizontal color={filterOpen ? colors.white : colors.navy} size={17} strokeWidth={2.2} />
              <Text style={[styles.filterBtnText, filterOpen && styles.filterBtnTextActive]}>Filters</Text>
              {filterCount > 0 ? (
                <View style={[styles.filterBadge, filterOpen && styles.filterBadgeActive]}>
                  <Text style={[styles.filterBadgeText, filterOpen && styles.filterBadgeTextActive]}>{filterCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>

            {filterCount > 0 ? (
              <View style={styles.activeFiltersBlock}>
                {activeChips.map((chip) => (
                  <TouchableOpacity
                    key={`${chip.key}-${chip.value}`}
                    style={styles.activeChip}
                    onPress={() => setMultiFilter(
                      chip.key,
                      selectedFilterValues(filters, chip.key).filter((item) => item !== chip.value),
                    )}
                  >
                    <Text style={styles.activeChipText}>{chip.label} x</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={styles.legendCard}>
              <Text style={styles.panelLabel}>Availability</Text>
              {legendItems.map(({ color, label }) => (
                <View key={label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: color }]} />
                  <Text style={styles.legendText}>{label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Collapse toggle — mobile only */}
        {isCompactMap && (
          <TouchableOpacity
            style={styles.collapseToggle}
            onPress={() => {
              setPanelCollapsed((v) => !v);
              if (!panelCollapsed) setFilterOpen(false);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={panelCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {panelCollapsed
              ? <ChevronDown color={colors.textMuted} size={16} strokeWidth={2.5} />
              : <ChevronUp color={colors.textMuted} size={16} strokeWidth={2.5} />
            }
          </TouchableOpacity>
        )}
      </View>

      {/* ── Active filter chips ── */}
      {false && filterCount > 0 && !filterOpen && (
        <View style={styles.activeChipsBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeChipsRow}
          >
            {activeChips.map((chip) => (
              <TouchableOpacity
                key={`${chip.key}-${chip.value}`}
                style={styles.activeChip}
                onPress={() => setMultiFilter(
                  chip.key,
                  selectedFilterValues(filters, chip.key).filter((item) => item !== chip.value),
                )}
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
                >
                  <Text style={[styles.chipText, selectedAvailability.includes(a.value) && styles.chipTextActive]}>
                    {a.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Aircraft Type</Text>
            <View style={styles.chipRow}>
              {AIRCRAFT_TYPES.map((a) => (
                <TouchableOpacity
                  key={a}
                  style={[styles.chip, selectedAircraft.includes(a) && styles.chipActive]}
                  onPress={() => toggle('aircraftTypes', a)}
                >
                  <Text style={[styles.chipText, selectedAircraft.includes(a) && styles.chipTextActive]}>
                    {a}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Legend ── */}
      {false && <View style={styles.legend}>
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
      </View>}
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
    top: 28,
    width: 320,
    maxHeight: 460,
    backgroundColor: colors.surface,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
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
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  filterPanelHelper: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  filterPanelActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  clearBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.borderLight,
    borderRadius: 8,
  },
  clearBtnText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  doneBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: colors.blue,
    borderRadius: 8,
  },
  doneBtnText: {
    fontSize: 12,
    color: colors.white,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
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
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: '600',
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
