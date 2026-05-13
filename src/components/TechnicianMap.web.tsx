import React, { Suspense, lazy } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import type { TechnicianMapProps } from './TechnicianMap.native';
import { colors } from '../theme';

// Leaflet requires `window` and cannot run during SSR/Node.js evaluation.
// Dynamic import defers module loading to the client, preventing the crash.
const LeafletMap = lazy(() => import('./TechnicianMapLeafletImpl'));

export function TechnicianMap(props: TechnicianMapProps) {
  return (
    <Suspense fallback={<View style={styles.loader}><ActivityIndicator color={colors.navy} /></View>}>
      <LeafletMap {...props} />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
