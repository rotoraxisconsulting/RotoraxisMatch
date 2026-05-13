import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { SafeTechnicianView, AvailabilityStatus, VerificationStatus } from '../types';
import { MapFilters } from '../types/filters';
import { colors, spacing } from '../theme';
import { LICENSE_CATEGORIES } from '../constants/licenses';
import { AIRCRAFT_TYPES } from '../constants/aircraftTypes';

export interface TechnicianMapProps {
  technicians: SafeTechnicianView[];
  filters: MapFilters;
  onFilterChange: (key: keyof MapFilters, value: string | undefined) => void;
  loading: boolean;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function markerColor(s: AvailabilityStatus): string {
  if (s === 'available') return colors.success;
  if (s === 'open_to_offers') return colors.technician;
  return colors.textMuted;
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

function scoreColor(score: number): string {
  if (score >= 70) return colors.success;
  if (score >= 40) return colors.warning;
  return colors.textMuted;
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
  useEffect(() => {
    if (technicians.length === 0) return;
    const bounds = technicians.map((t) => [t.latitude, t.longitude] as [number, number]);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 7 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technicians.length]);
  return null;
}

// ─── filter constants ─────────────────────────────────────────────────────────

const VERIFICATION_OPTIONS = [
  { value: 'verified' as const, label: 'Verified' },
  { value: 'pending' as const, label: 'Pending' },
  { value: 'unverified' as const, label: 'Unverified' },
];

// ─── main component ───────────────────────────────────────────────────────────

export default function TechnicianMapLeafletImpl({
  technicians,
  filters,
  onFilterChange,
  loading,
}: TechnicianMapProps) {
  useLeafletCss();
  const [filterOpen, setFilterOpen] = useState(false);

  function toggle(key: keyof MapFilters, value: string) {
    onFilterChange(key, filters[key] === value ? undefined : value);
  }

  function clearAll() {
    onFilterChange('licenseCategory', undefined);
    onFilterChange('aircraftType', undefined);
    onFilterChange('verificationStatus', undefined);
  }

  const filterCount = [
    filters.licenseCategory,
    filters.aircraftType,
    filters.verificationStatus,
  ].filter(Boolean).length;

  return (
    <View style={styles.container}>
      {/* Leaflet map fills the container */}
      <MapContainer
        center={[48.5, 8.0]}
        zoom={4}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
        zoomControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {/* <MapAutoFit technicians={technicians} /> */}

        {technicians.map((t) => (
          <CircleMarker
            key={t.id}
            center={[t.latitude, t.longitude]}
            radius={9}
            pathOptions={{
              fillColor: markerColor(t.availability.status),
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
                  <span style={statusChipStyle(availColor(t.availability.status))}>
                    {availLabel(t.availability.status)}
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

                {t.matchingScore !== undefined && (
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: scoreColor(t.matchingScore) }}>
                    {t.matchingScore}% match
                  </div>
                )}

                <div style={{ marginTop: 8, fontSize: 11, color: colors.textMuted, fontStyle: 'italic' }}>
                  Use Search to send a contact request.
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* ── Top overlay bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => setFilterOpen((v) => !v)}
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

      {/* ── Active filter chips ── */}
      {filterCount > 0 && !filterOpen && (
        <View style={styles.activeChipsBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeChipsRow}
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

      {/* ── Filter dropdown panel ── */}
      {filterOpen && (
        <View style={styles.filterPanel}>
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

            <Text style={styles.sectionLabel}>License Category</Text>
            <View style={styles.chipRow}>
              {LICENSE_CATEGORIES.map((l) => (
                <TouchableOpacity
                  key={l.code}
                  style={[styles.chip, filters.licenseCategory === l.code && styles.chipActive]}
                  onPress={() => toggle('licenseCategory', l.code)}
                >
                  <Text style={[styles.chipText, filters.licenseCategory === l.code && styles.chipTextActive]}>
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
                  style={[styles.chip, filters.verificationStatus === v.value && styles.chipActive]}
                  onPress={() => toggle('verificationStatus', v.value)}
                >
                  <Text style={[styles.chipText, filters.verificationStatus === v.value && styles.chipTextActive]}>
                    {v.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Aircraft Type</Text>
            <View style={styles.chipRow}>
              {AIRCRAFT_TYPES.map((a) => (
                <TouchableOpacity
                  key={a}
                  style={[styles.chip, filters.aircraftType === a && styles.chipActive]}
                  onPress={() => toggle('aircraftType', a)}
                >
                  <Text style={[styles.chipText, filters.aircraftType === a && styles.chipTextActive]}>
                    {a}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Legend ── */}
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
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: spacing.sm,
    zIndex: 1002,
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
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  filterBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  countPill: {
    backgroundColor: colors.navy,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 90,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  countPillText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '600',
  },

  // Active chips
  activeChipsBar: {
    position: 'absolute',
    top: 56,
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
    top: 56,
    left: 12,
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
    color: colors.white,
    fontSize: 11,
    fontWeight: '500',
  },
});
