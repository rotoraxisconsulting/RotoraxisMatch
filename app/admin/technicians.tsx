import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { AdminTechnicianCard } from '../../src/components/AdminTechnicianCard';
import { EmptyState } from '../../src/components/EmptyState';
import { useAdminDashboard } from '../../src/state/useAdminDashboard';
import { Technician, VerificationStatus } from '../../src/types';
import { colors, spacing } from '../../src/theme';

type StatusFilter = 'all' | VerificationStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'unverified', label: 'Unverified' },
];

function filterTechnicians(
  techs: Technician[],
  status: StatusFilter,
  query: string,
): Technician[] {
  let result = techs;
  if (status !== 'all') {
    result = result.filter((t) => t.verificationStatus === status);
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    result = result.filter(
      (t) =>
        t.fullName.toLowerCase().includes(q) ||
        t.anonymousCode.toLowerCase().includes(q) ||
        t.city.toLowerCase().includes(q),
    );
  }
  // Pending first within results
  return [...result].sort((a, b) => {
    const order = { pending: 0, unverified: 1, rejected: 2, verified: 3 };
    return (order[a.verificationStatus] ?? 0) - (order[b.verificationStatus] ?? 0);
  });
}

export default function AdminTechniciansScreen() {
  const { technicians, loading, refresh, updateTechnicianVerification } =
    useAdminDashboard();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const filtered = useMemo(
    () => filterTechnicians(technicians, statusFilter, query),
    [technicians, statusFilter, query],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Technicians' }} />
      <DemoModeBanner role="admin" />

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, code or city…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Status filter tabs */}
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

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          !loading ? (
            <Text style={styles.resultCount}>
              {filtered.length} technician{filtered.length !== 1 ? 's' : ''}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="👷"
              title="No technicians found"
              subtitle="Try adjusting your search or filter."
            />
          ) : null
        }
        renderItem={({ item }) => (
          <AdminTechnicianCard
            technician={item}
            onUpdateStatus={updateTechnicianVerification}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  searchRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    height: 40,
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.text,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
