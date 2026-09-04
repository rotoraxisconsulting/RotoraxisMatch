import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { AvailabilityStatus, SafeTechnicianView } from '../types';
import type { TechnicianHabilitation } from '../types/technician';
import type { MapFilters, MapFilterValue } from '../types/filters';
import type { MapOfferMatchOption } from '../types/mapOffers';
import type { TechnicianTypeCode } from '../types/catalog';
import { colors } from '../theme';
import { useAircraftTypeRatingsCatalog } from '../state/useAircraftTypeRatingsCatalog';
import { buildAircraftRatingIndex } from '../constants/aircraftTypeRatings';
import { technicianTypeLabel } from '../constants/technicianTypes';
import { resolveTypeRatingLabels } from '../utils/v2CompatAdapters';
import { groupTechnicianMapMarkers } from '../utils/technicianMapMarkers';
import { TechnicianMapHeader, TechnicianMapLegend } from './technician-map/TechnicianMapControls';
import {
  activeTechnicianMapFilterCount,
  TechnicianMapDetailSheet,
  TechnicianMapFilterSheet,
  TechnicianOfferSelectionSheet,
} from './technician-map/TechnicianMapSheets';

export interface TechnicianMapProps {
  technicians: SafeTechnicianView[];
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

function markerColor(status: AvailabilityStatus): string {
  return status === 'open_to_offers' ? colors.success : colors.textMuted;
}

function hasMapCoordinates(technician: SafeTechnicianView): boolean {
  return Number.isFinite(Number(technician.latitude)) && Number.isFinite(Number(technician.longitude));
}

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

function MapAutoFit({ technicians }: { technicians: SafeTechnicianView[] }) {
  const map = useMap();
  const coordinateKey = technicians
    .map((technician) => `${technician.id}:${technician.latitude},${technician.longitude}`)
    .join('|');

  useEffect(() => {
    if (technicians.length === 0) return;
    const bounds = technicians
      .map((technician) => [Number(technician.latitude), Number(technician.longitude)] as [number, number])
      .filter(([latitude, longitude]) => Number.isFinite(latitude) && Number.isFinite(longitude));
    if (bounds.length > 0) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 7 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technicians.length, coordinateKey]);
  return null;
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
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedOfferTechId, setSelectedOfferTechId] = useState<string | null>(null);
  const [sendingOfferId, setSendingOfferId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const mappedTechnicians = useMemo(() => technicians.filter(hasMapCoordinates), [technicians]);
  const markerGroups = useMemo(() => groupTechnicianMapMarkers(mappedTechnicians), [mappedTechnicians]);
  const selectedGroup = selectedGroupKey
    ? markerGroups.find((group) => group.key === selectedGroupKey) ?? null
    : null;
  const selectedOfferTechnician = selectedOfferTechId
    ? technicians.find((technician) => technician.id === selectedOfferTechId) ?? null
    : null;
  const selectedOfferOptions = selectedOfferTechId
    ? offerMatchesByTechnician[selectedOfferTechId] ?? []
    : [];
  const tradeLabelsById = useMemo(
    () => Object.fromEntries(
      technicians.map((technician) => [
        technician.id,
        (technicianTypesById[technician.id] ?? []).map(technicianTypeLabel),
      ]),
    ),
    [technicians, technicianTypesById],
  );
  const typeRatingLabelsById = useMemo(
    () => Object.fromEntries(
      technicians.map((technician) => [
        technician.id,
        resolveTypeRatingLabels(habilitationsById[technician.id] ?? [], ratingIndex),
      ]),
    ),
    [technicians, habilitationsById, ratingIndex],
  );

  useEffect(() => {
    if (selectedGroupKey && !selectedGroup) setSelectedGroupKey(null);
  }, [selectedGroup, selectedGroupKey]);

  async function handleSendOffer(offerId: string) {
    if (!selectedOfferTechId || !onSendOffer) return;
    setSendError(null);
    setSendingOfferId(offerId);
    try {
      await onSendOffer(selectedOfferTechId, offerId);
    } catch (error: any) {
      setSendError(error?.message ?? 'Could not send this direct offer.');
    } finally {
      setSendingOfferId(null);
    }
  }

  return (
    <View style={styles.container}>
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
          const isSelected = selectedGroupKey === group.key;
          const singleTechnician = group.technicians[0];

          return (
            <CircleMarker
              key={group.key}
              center={[group.latitude, group.longitude]}
              radius={isGroup ? 22 : isApproximate ? 12 : 9}
              eventHandlers={{ click: () => setSelectedGroupKey(group.key) }}
              pathOptions={{
                fillColor: isGroup
                  ? colors.navy
                  : markerColor(singleTechnician.availability.status ?? 'unavailable'),
                color: isSelected ? colors.blue : isApproximate && !isGroup ? colors.navy : colors.white,
                fillOpacity: isGroup ? 0.92 : isApproximate ? 0.34 : 0.92,
                weight: isSelected ? 5 : isApproximate ? 3 : 2,
                dashArray: isApproximate ? '4 3' : undefined,
              }}
            >
              {isGroup ? (
                <Tooltip permanent direction="center" className="technician-marker-count" opacity={1}>
                  {group.technicians.length}
                </Tooltip>
              ) : isApproximate ? (
                <Tooltip direction="top">Approximate country location</Tooltip>
              ) : null}
            </CircleMarker>
          );
        })}
      </MapContainer>

      <TechnicianMapHeader
        visibleCount={technicians.length}
        filterCount={activeTechnicianMapFilterCount(filters)}
        loading={loading}
        onBack={onBack}
        onOpenFilters={() => setFilterOpen(true)}
      />

      {!loading && mappedTechnicians.length > 0 ? <TechnicianMapLegend /> : null}

      <TechnicianMapFilterSheet
        visible={filterOpen}
        filters={filters}
        onFilterChange={onFilterChange}
        onClose={() => setFilterOpen(false)}
      />

      <TechnicianMapDetailSheet
        group={selectedGroup}
        tradeLabelsById={tradeLabelsById}
        typeRatingLabelsById={typeRatingLabelsById}
        onClose={() => setSelectedGroupKey(null)}
        onViewProfile={onViewProfile}
        onStartDirectOffer={(technicianId) => {
          setSelectedGroupKey(null);
          setSendError(null);
          setSelectedOfferTechId(technicianId);
        }}
      />

      <TechnicianOfferSelectionSheet
        technician={selectedOfferTechnician}
        options={selectedOfferOptions}
        loading={loadingOfferMatches}
        sendingOfferId={sendingOfferId}
        error={sendError}
        onSend={handleSendOffer}
        onClose={() => {
          setSelectedOfferTechId(null);
          setSendError(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: colors.background,
    padding: 12,
  },
});
