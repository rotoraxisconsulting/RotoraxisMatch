import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import type { OfferMapProps } from './OfferMap.native';
import {
  groupOfferMapItems,
  OfferMapFilterSheet,
  OfferMapHeader,
  OfferMapLegend,
  OfferMapMarkerGroup,
  OfferMapStatusOverlay,
  offerMapApplicationLabel,
  offerMapContractLabel,
  offerMapLabelColor,
  offerMapMarkerColor,
  offerMapProductLabel,
} from './offer-map/OfferMapControls';
import { activeOfferMapFilterCount, OfferMapItem } from '../types/offerMap';
import { techUi } from './technician/TechnicianUI';

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

    if (!document.getElementById('offer-map-leaflet-overrides')) {
      const style = document.createElement('style');
      style.id = 'offer-map-leaflet-overrides';
      style.textContent = `
        .leaflet-top.leaflet-left { top: 96px; left: 12px; }
        .leaflet-popup-content-wrapper {
          border-radius: 16px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
        }
        .leaflet-popup-content { margin: 14px; min-width: 232px; max-width: 286px; }
        .leaflet-popup-tip-container { display: none; }
        .leaflet-popup-close-button { top: 8px; right: 8px; font-size: 20px; color: #527088; }
        .offer-map-count {
          background: #0A1520;
          border: 2px solid #FFFFFF;
          border-radius: 12px;
          color: #FFFFFF;
          box-shadow: none;
          font-size: 10px;
          font-weight: 800;
          line-height: 18px;
          min-width: 18px;
          padding: 0 4px;
          text-align: center;
        }
        .offer-map-count:before { display: none; }
      `;
      document.head.appendChild(style);
    }
  }, []);
}

function OfferMapAutoFit({ groups }: { groups: OfferMapMarkerGroup[] }) {
  const map = useMap();
  const coordinateKey = groups
    .map((group) => `${group.key}:${group.latitude},${group.longitude}`)
    .join('|');

  useEffect(() => {
    const bounds = groups.map((group) => [group.latitude, group.longitude] as [number, number]);
    if (bounds.length === 1) map.setView(bounds[0], 6);
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [58, 58], maxZoom: 7 });
  // coordinateKey captures coordinate changes without making the array identity a dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinateKey, groups.length, map]);

  return null;
}

function PopupChip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      marginRight: 4,
      marginBottom: 4,
      padding: '3px 7px',
      borderRadius: 10,
      backgroundColor: techUi.surfaceSoft,
      color,
      fontSize: 10,
      fontWeight: 700,
    }}>
      {label}
    </span>
  );
}

function OfferPopupCard({
  offer,
  divided,
  onViewOffer,
}: {
  offer: OfferMapItem;
  divided: boolean;
  onViewOffer: (offerId: string) => void;
}) {
  const markerColor = offerMapMarkerColor(offer);
  const labelColor = offerMapLabelColor(offer);
  const applicationLabel = offerMapApplicationLabel(offer.applicationStatus);

  return (
    <div style={{
      borderTop: divided ? `1px solid ${techUi.borderSoft}` : undefined,
      paddingTop: divided ? 12 : 0,
      marginTop: divided ? 12 : 0,
    }}>
      <div style={{ paddingRight: 18, fontSize: 14, lineHeight: '18px', fontWeight: 800, color: techUi.text }}>
        {offer.title}
      </div>
      <div style={{ marginTop: 2, fontSize: 11, lineHeight: '15px', fontWeight: 600, color: techUi.textSoft }}>
        {offer.companyName}
      </div>
      <div style={{ marginTop: 7, fontSize: 11, lineHeight: '15px', color: techUi.textMuted }}>
        {offer.location}
        {offer.locationPrecision === 'country' ? ' · Country-level location' : ''}
      </div>
      <div style={{ marginTop: 7 }}>
        <PopupChip label={`${offer.score}% match`} color={labelColor} />
        <PopupChip
          label={offer.blockers.length > 0 ? 'Not eligible' : offer.matchLabel}
          color={offer.blockers.length > 0 ? techUi.red : labelColor}
        />
        {applicationLabel ? <PopupChip label={applicationLabel} color={techUi.green} /> : null}
      </div>
      <div style={{ marginTop: 2, fontSize: 10, lineHeight: '14px', color: techUi.textMuted }}>
        {offerMapContractLabel(offer.contractType)} · {offerMapProductLabel(offer.productType)}
      </div>
      <button
        type="button"
        aria-label={`View offer ${offer.title}`}
        onClick={() => onViewOffer(offer.id)}
        style={{
          width: '100%',
          minHeight: 44,
          marginTop: 10,
          border: 0,
          borderRadius: 12,
          backgroundColor: techUi.accent,
          color: '#FFFFFF',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        View offer
      </button>
    </div>
  );
}

export default function OfferMapLeafletImpl({
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
  useLeafletCss();
  const [filterOpen, setFilterOpen] = useState(false);
  const groups = useMemo(() => groupOfferMapItems(offers), [offers]);
  const filterCount = activeOfferMapFilterCount(filters);
  const emptyBecauseFilters = !loading && !error && offers.length === 0 && totalCount > 0 && filterCount > 0;
  const emptyBecauseLocations = !loading && !error && offers.length === 0 && totalCount > 0 && unmappedCount === totalCount;
  const emptyPublished = !loading && !error && totalCount === 0;

  return (
    <View style={styles.container}>
      <View style={styles.mapFrame}>
        <MapContainer
          center={[48.5, 8]}
          zoom={3}
          zoomControl
          style={{ width: '100%', height: '100%', backgroundColor: techUi.page }}
        >
          <TileLayer
            attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <OfferMapAutoFit groups={groups} />
          {groups.map((group) => {
            const representative = group.offers[0];
            const color = offerMapMarkerColor(representative);
            const approximate = group.locationPrecision === 'country';

            return (
              <CircleMarker
                key={group.key}
                center={[group.latitude, group.longitude]}
                radius={group.offers.length > 1 ? 13 : 10}
                pathOptions={{
                  color: approximate ? color : '#FFFFFF',
                  fillColor: color,
                  fillOpacity: approximate ? 0.34 : 0.92,
                  weight: approximate ? 3 : 2.5,
                  dashArray: approximate ? '5 4' : undefined,
                }}
              >
                {group.offers.length > 1 ? (
                  <Tooltip permanent direction="center" className="offer-map-count">
                    {group.offers.length}
                  </Tooltip>
                ) : null}
                <Popup maxWidth={310} closeButton>
                  <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 2 }}>
                    {group.offers.length > 1 ? (
                      <div style={{ marginBottom: 10, fontSize: 11, fontWeight: 800, color: techUi.textMuted }}>
                        {group.offers.length} offers at this location
                      </div>
                    ) : null}
                    {group.offers.map((offer, index) => (
                      <OfferPopupCard
                        key={offer.id}
                        offer={offer}
                        divided={index > 0}
                        onViewOffer={onViewOffer}
                      />
                    ))}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </View>

      <OfferMapHeader
        visibleCount={offers.length}
        totalCount={totalCount}
        unmappedCount={unmappedCount}
        filters={filters}
        onBack={onBack}
        onOpenFilters={() => setFilterOpen(true)}
      />

      {!loading && !error && offers.length > 0 ? <OfferMapLegend /> : null}

      {loading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View style={styles.loadingCard}>
            <ActivityIndicator color={techUi.accent} size="large" />
          </View>
        </View>
      ) : null}

      {error ? (
        <OfferMapStatusOverlay
          kind="error"
          title="Map unavailable"
          message={error.message}
          actionLabel="Try again"
          onAction={onRetry}
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
  container: { flex: 1, position: 'relative', backgroundColor: techUi.page },
  mapFrame: { flex: 1 },
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
