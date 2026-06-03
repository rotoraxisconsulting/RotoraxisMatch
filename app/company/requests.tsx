// Legacy route kept for backward navigation only.
// TODO: Remove this screen once all deep links to /company/requests are gone.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { BriefcaseBusiness, ClipboardCheck } from 'lucide-react-native';
import {
  CompanyCard,
  CompanyPageHeader,
  CompanyScreen,
  IconBox,
  companyUi,
} from '../../src/components/company/CompanyUI';

export default function CompanyRequestsLegacy() {
  const router = useRouter();

  return (
    <CompanyScreen>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.wrap}>
        <CompanyCard style={styles.card}>
          <CompanyPageHeader
            eyebrow="Legacy route"
            title="Requests moved"
            subtitle="Incoming applications and direct offer responses now live in dedicated company workspaces."
            onBack={() => router.back()}
          />

          <TouchableOpacity
            style={styles.routeCard}
            onPress={() => router.replace('/company/applications' as any)}
            activeOpacity={0.75}
          >
            <IconBox icon={ClipboardCheck} color={companyUi.blue} backgroundColor={companyUi.blueSoft} />
            <View style={styles.routeCopy}>
              <Text style={styles.routeTitle}>Applications</Text>
              <Text style={styles.routeSub}>Review incoming applications and accepted technicians.</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.routeCard}
            onPress={() => router.replace('/company/offers' as any)}
            activeOpacity={0.75}
          >
            <IconBox icon={BriefcaseBusiness} color={companyUi.accent} backgroundColor={companyUi.accentSoft} />
            <View style={styles.routeCopy}>
              <Text style={styles.routeTitle}>Job offers</Text>
              <Text style={styles.routeSub}>Manage published offers and direct-offer workflows.</Text>
            </View>
          </TouchableOpacity>
        </CompanyCard>
      </View>
    </CompanyScreen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    gap: 12,
  },
  routeCard: {
    borderWidth: 1,
    borderColor: companyUi.border,
    borderRadius: 18,
    backgroundColor: companyUi.surfaceSoft,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeCopy: { flex: 1, minWidth: 0 },
  routeTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: companyUi.text,
  },
  routeSub: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
});
