import React, { useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { DemoModeBanner } from '../src/components/DemoModeBanner';
import { TechnicianMap } from '../src/components/TechnicianMap';
import { useMapTechnicians } from '../src/state/useMapTechnicians';
import { MapFilters } from '../src/types/filters';
import { colors } from '../src/theme';

export default function MapScreen() {
  const [filters, setFilters] = useState<MapFilters>({});

  function handleFilterChange(key: keyof MapFilters, value: string | undefined) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const { technicians, loading } = useMapTechnicians(filters);

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Technician Map' }} />
      <DemoModeBanner role="company" />
      <TechnicianMap
        technicians={technicians}
        filters={filters}
        onFilterChange={handleFilterChange}
        loading={loading}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
});
