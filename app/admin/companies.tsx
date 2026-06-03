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
import { Building2, Search } from 'lucide-react-native';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { AdminCompanyCard } from '../../src/components/AdminCompanyCard';
import { useAdminDashboard } from '../../src/state/useAdminDashboard';
import type { Company, CompanyTypeCode, LegacyVerificationStatus } from '../../src/types';
import { COMPANY_TYPES } from '../../src/constants/companyTypes';
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
type TypeFilter = 'all' | CompanyTypeCode;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
];

const TYPE_OPTIONS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All types' },
  ...COMPANY_TYPES.map((type): { key: TypeFilter; label: string } => ({ key: type.code, label: type.label })),
];

// Accept LegacyVerificationStatus for runtime safety — old persisted data may have 'unverified'
function normalizedStatus(status: LegacyVerificationStatus): StatusFilter {
  if (status === 'unverified') return 'pending';
  return status;
}

function filterCompanies(
  companies: Company[],
  status: StatusFilter,
  type: TypeFilter,
  query: string,
): Company[] {
  let result = companies;
  if (status !== 'all') result = result.filter((company) => normalizedStatus(company.verificationStatus) === status);
  if (type !== 'all') result = result.filter((company) => String(company.companyType) === type);
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    result = result.filter((company) =>
      [
        company.companyName,
        company.companyType,
        company.city,
        company.country,
        company.contactEmail,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }
  return [...result].sort((a, b) => {
    const order: Record<StatusFilter, number> = { pending: 0, rejected: 1, verified: 2, all: 3 };
    return order[normalizedStatus(a.verificationStatus)] - order[normalizedStatus(b.verificationStatus)];
  });
}

export default function AdminCompaniesScreen() {
  const router = useRouter();
  const {
    companies,
    companyMemberCounts,
    companyProfileMap,
    loading,
    refresh,
    updateCompanyVerification,
  } = useAdminDashboard();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const filtered = useMemo(
    () => filterCompanies(companies, statusFilter, typeFilter, query),
    [companies, statusFilter, typeFilter, query],
  );
  const pendingCount = companies.filter((company) => normalizedStatus(company.verificationStatus) === 'pending').length;

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
      <DemoModeBanner role="admin" />

      <View style={[styles.topContent, isWide && styles.contentWide]}>
        <AdminPageHeader
          eyebrow="Organizations"
          title="Company management"
          subtitle="Audit buyer profiles, company category and membership footprint before verification."
          onBack={() => router.back()}
        />

        <AdminCard style={styles.controls}>
          <View style={styles.searchShell}>
            <Search size={18} color={adminUi.textMuted} strokeWidth={2.2} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search company, city, type or email"
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

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {TYPE_OPTIONS.map(({ key, label }) => (
              <AdminChip
                key={key}
                label={label}
                selected={typeFilter === key}
                onPress={() => setTypeFilter(key)}
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
                {filtered.length} compan{filtered.length !== 1 ? 'ies' : 'y'}
              </Text>
              <Text style={styles.resultSub}>
                {pendingCount} pending verification
              </Text>
            </View>
            <AdminIconBox icon={Building2} size={17} color={adminUi.accent} backgroundColor={adminUi.accentSoft} />
          </View>
        }
        ListEmptyComponent={
          <AdminEmptyPanel
            title="No companies found"
            subtitle="Adjust the company type, status or search terms."
          />
        }
        renderItem={({ item }) => (
          <AdminCompanyCard
            company={item}
            memberCount={companyMemberCounts[item.id]}
            contactPhone={companyProfileMap[item.id]?.phone}
            onUpdateStatus={updateCompanyVerification}
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
