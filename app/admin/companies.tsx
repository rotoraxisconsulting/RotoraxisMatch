import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { AdminCompanyCard } from '../../src/components/AdminCompanyCard';
import { EmptyState } from '../../src/components/EmptyState';
import { useAdminDashboard } from '../../src/state/useAdminDashboard';
import { Company, VerificationStatus, CompanyType } from '../../src/types';
import { colors, spacing } from '../../src/theme';

type StatusFilter = 'all' | VerificationStatus;
type TypeFilter = 'all' | CompanyType;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'unverified', label: 'Unverified' },
];

const TYPE_OPTIONS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All types' },
  { key: 'airline', label: 'Airline' },
  { key: 'mro', label: 'MRO' },
  { key: 'operator', label: 'Operator' },
  { key: 'contractor', label: 'Contractor' },
  { key: 'recruiter', label: 'Recruiter' },
];

function filterCompanies(
  companies: Company[],
  status: StatusFilter,
  type: TypeFilter,
): Company[] {
  let result = companies;
  if (status !== 'all') result = result.filter((c) => c.verificationStatus === status);
  if (type !== 'all') result = result.filter((c) => c.companyType === type);
  return [...result].sort((a, b) => {
    const order = { pending: 0, unverified: 1, verified: 2 };
    return order[a.verificationStatus] - order[b.verificationStatus];
  });
}

export default function AdminCompaniesScreen() {
  const { companies, loading, refresh, updateCompanyVerification } = useAdminDashboard();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const filtered = useMemo(
    () => filterCompanies(companies, statusFilter, typeFilter),
    [companies, statusFilter, typeFilter],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Companies' }} />
      <DemoModeBanner role="admin" />

      {/* Status tabs */}
      <View style={styles.tabRow}>
        {STATUS_TABS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, statusFilter === key && styles.tabActive]}
            onPress={() => setStatusFilter(key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, statusFilter === key && styles.tabTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Type filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.typeScroll}
        contentContainerStyle={styles.typeChips}
      >
        {TYPE_OPTIONS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.chip, typeFilter === key && styles.chipActive]}
            onPress={() => setTypeFilter(key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, typeFilter === key && styles.chipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          !loading ? (
            <Text style={styles.resultCount}>
              {filtered.length} compan{filtered.length !== 1 ? 'ies' : 'y'}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="🏢"
              title="No companies found"
              subtitle="Try adjusting your filters."
            />
          ) : null
        }
        renderItem={({ item }) => (
          <AdminCompanyCard
            company={item}
            onUpdateStatus={updateCompanyVerification}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  tabActive: {
    backgroundColor: colors.admin,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.white,
  },
  typeScroll: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  typeChips: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
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
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  resultCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
});
