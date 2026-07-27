import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Search, UserRound } from 'lucide-react-native';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { AdminTechnicianCard } from '../../src/components/AdminTechnicianCard';
import { useAdminDashboard } from '../../src/state/useAdminDashboard';
import type { Technician, TechnicianWithRelations, VerificationStatus } from '../../src/types';
import {
  AdminCard,
  AdminChip,
  AdminEmptyPanel,
  AdminIconBox,
  AdminPageHeader,
  AdminScreen,
  adminUi,
} from '../../src/components/admin/AdminUI';
import { spacing } from '../../src/theme';

type StatusFilter = 'all' | 'pending' | 'verified' | 'rejected';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
];

// Fase 5.3 — see the identical note in app/admin/companies.tsx:
// LegacyVerificationStatus's 'unverified' branch was unreachable both by
// the type checker (Technician.verificationStatus is VerificationStatus)
// and at runtime (technician_profiles.verification_status is a genuine
// Postgres ENUM, confirmed against rotoaxismatch-dev).
function normalizedStatus(status: VerificationStatus): StatusFilter {
  return status;
}

function filterTechnicians(
  techs: Technician[],
  detailsMap: Record<string, TechnicianWithRelations>,
  status: StatusFilter,
  query: string,
): Technician[] {
  let result = techs;
  if (status !== 'all') {
    result = result.filter((technician) => normalizedStatus(technician.verificationStatus) === status);
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    result = result.filter((technician) => {
      const details = detailsMap[technician.id];
      const searchable = [
        technician.fullName,
        technician.anonymousCode,
        technician.city,
        technician.country,
        technician.baseAirport,
        details?.technicianType,
        ...technician.licenseCategories,
        ...technician.aircraftTypes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(q);
    });
  }
  return [...result].sort((a, b) => {
    const order: Record<StatusFilter, number> = { pending: 0, rejected: 1, verified: 2, all: 3 };
    return order[normalizedStatus(a.verificationStatus)] - order[normalizedStatus(b.verificationStatus)];
  });
}

export default function AdminTechniciansScreen() {
  const router = useRouter();
  const {
    technicians,
    technicianDetailsMap,
    loading,
    refresh,
    updateTechnicianVerification,
  } = useAdminDashboard();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const filtered = useMemo(
    () => filterTechnicians(technicians, technicianDetailsMap, statusFilter, query),
    [technicians, technicianDetailsMap, statusFilter, query],
  );
  const pendingCount = technicians.filter((technician) => normalizedStatus(technician.verificationStatus) === 'pending').length;

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={adminUi.accent} role="admin" />
      </>
    );
  }

  return (
    <AdminScreen>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topContent, isWide && styles.contentWide]}>
        <AdminPageHeader
          eyebrow="Moderation"
          title="Technician management"
          subtitle="Review identity, license coverage and operational readiness before marketplace access."
          onBack={() => router.back()}
        />

        <AdminCard style={styles.controls}>
          <View style={styles.searchShell}>
            <Search size={18} color={adminUi.textMuted} strokeWidth={2.2} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search name, code, city, license or aircraft"
              placeholderTextColor={adminUi.textMuted}
              value={query}
              onChangeText={setQuery}
              clearButtonMode="while-editing"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {STATUS_TABS.map(({ key, label }) => (
              <AdminChip
                key={key}
                label={label}
                selected={statusFilter === key}
                onPress={() => setStatusFilter(key)}
              />
            ))}
          </ScrollView>
        </AdminCard>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, isWide && styles.contentWide]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View>
              <Text style={styles.resultCount}>
                {filtered.length} technician{filtered.length !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.resultSub}>
                {pendingCount} pending verification
              </Text>
            </View>
            <AdminIconBox icon={UserRound} size={17} color={adminUi.accent} backgroundColor={adminUi.accentSoft} />
          </View>
        }
        ListEmptyComponent={
          <AdminEmptyPanel
            title="No technicians found"
            subtitle="Adjust the search or moderation filter to widen the queue."
          />
        }
        renderItem={({ item }) => (
          <AdminTechnicianCard
            technician={item}
            details={technicianDetailsMap[item.id]}
            onUpdateStatus={updateTechnicianVerification}
          />
        )}
      />
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  topContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  contentWide: {
    maxWidth: 920,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: spacing.lg,
  },
  controls: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  searchShell: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: adminUi.border,
    borderRadius: 14,
    backgroundColor: adminUi.surfaceSoft,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
    color: adminUi.text,
    paddingVertical: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  resultCount: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: adminUi.text,
  },
  resultSub: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: adminUi.textMuted,
  },
});
