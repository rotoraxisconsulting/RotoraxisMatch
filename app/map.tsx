import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter } from 'expo-router';
import { TechnicianMap } from '../src/components/TechnicianMap';
import { useMapTechnicians } from '../src/state/useMapTechnicians';
import { offerRequestRepository } from '../src/repositories/v2/offerRequestRepository';
import { getOfferMatchesForTechnician } from '../src/utils/matchingV2';
import { useCompanySession } from '../src/state/SessionContext';
import { MapFilters, MapFilterValue } from '../src/types/filters';
import { MapOfferMatchOption } from '../src/types/mapOffers';
import { colors } from '../src/theme';

export default function MapScreen() {
  const router = useRouter();
  const { companyId } = useCompanySession();
  const [filters, setFilters] = useState<MapFilters>({});
  const [offerMatchesByTechnician, setOfferMatchesByTechnician] = useState<Record<string, MapOfferMatchOption[]>>({});
  const [loadingOfferMatches, setLoadingOfferMatches] = useState(false);

  function handleFilterChange(key: keyof MapFilters, value: MapFilterValue) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const { technicians, loading } = useMapTechnicians(filters);

  useEffect(() => {
    let active = true;

    async function loadOfferMatches() {
      if (technicians.length === 0) {
        setOfferMatchesByTechnician({});
        setLoadingOfferMatches(false);
        return;
      }

      setLoadingOfferMatches(true);
      const requests = await offerRequestRepository.getForCompany(companyId);
      const entries = await Promise.all(
        technicians.map(async (technician) => {
          const matches = await getOfferMatchesForTechnician(technician.id);
          const options: MapOfferMatchOption[] = matches
            .filter(({ offer }) => offer.companyId === companyId)
            .map(({ offer, score }) => {
              const existing = requests.find(
                (request) => request.technicianId === technician.id && request.offerId === offer.id,
              );

              return {
                offerId: offer.id,
                title: offer.title,
                contractType: offer.contractType,
                location: [offer.locationCity, offer.locationCountry].filter(Boolean).join(', '),
                score: score.total,
                label: score.label,
                requestStatus: existing?.status,
              };
            });

          return [technician.id, options] as const;
        }),
      );

      if (!active) return;
      setOfferMatchesByTechnician(Object.fromEntries(entries));
      setLoadingOfferMatches(false);
    }

    loadOfferMatches().catch(() => {
      if (!active) return;
      setOfferMatchesByTechnician({});
      setLoadingOfferMatches(false);
    });

    return () => {
      active = false;
    };
  }, [technicians, companyId]);

  async function handleSendOfferFromMap(technicianId: string, offerId: string) {
    await offerRequestRepository.create({
      companyId,
      technicianId,
      offerId,
    });

    setOfferMatchesByTechnician((prev) => ({
      ...prev,
      [technicianId]: (prev[technicianId] ?? []).map((option) => (
        option.offerId === offerId ? { ...option, requestStatus: 'pending' } : option
      )),
    }));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <Stack.Screen options={{ headerShown: false }} />
      <TechnicianMap
        technicians={technicians}
        filters={filters}
        onFilterChange={handleFilterChange}
        loading={loading}
        onBack={() => router.back()}
        offerMatchesByTechnician={offerMatchesByTechnician}
        loadingOfferMatches={loadingOfferMatches}
        onSendOffer={handleSendOfferFromMap}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
});
