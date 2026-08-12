import React, { lazy, Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { OfferMapProps } from './OfferMap.native';
import { techUi } from './technician/TechnicianUI';

const LeafletOfferMap = lazy(() => import('./OfferMapLeafletImpl'));

export function OfferMap(props: OfferMapProps) {
  return (
    <Suspense
      fallback={(
        <View style={styles.loader}>
          <ActivityIndicator color={techUi.accent} size="large" />
        </View>
      )}
    >
      <LeafletOfferMap {...props} />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: techUi.page,
  },
});
