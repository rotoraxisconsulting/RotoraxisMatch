import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { AdminRequestCard } from '../../src/components/AdminRequestCard';
import { EmptyState } from '../../src/components/EmptyState';
import { useAdminDashboard } from '../../src/state/useAdminDashboard';
import { MatchRequest, MatchRequestStatus } from '../../src/types';
import { colors, spacing } from '../../src/theme';

type StatusFilter = 'all' | MatchRequestStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Awaiting' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
];

function filterRequests(reqs: MatchRequest[], status: StatusFilter): MatchRequest[] {
  const result = status === 'all' ? reqs : reqs.filter((r) => r.status === status);
  return [...result].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export default function AdminRequestsScreen() {
  const { requests, loading, refresh, technicianMap, companyMap } = useAdminDashboard();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const filtered = useMemo(
    () => filterRequests(requests, statusFilter),
    [requests, statusFilter],
  );

  const sentCount = requests.filter((r) => r.status === 'sent').length;
  const acceptedCount = requests.filter((r) => r.status === 'accepted').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Match Requests' }} />
      <DemoModeBanner role="admin" />

      {/* Summary strip */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.info }]}>{sentCount}</Text>
          <Text style={styles.summaryLabel}>Awaiting</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.success }]}>{acceptedCount}</Text>
          <Text style={styles.summaryLabel}>Accepted</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.error }]}>{rejectedCount}</Text>
          <Text style={styles.summaryLabel}>Rejected</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.textSecondary }]}>
            {requests.length}
          </Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
      </View>

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

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="📋"
              title="No requests found"
              subtitle="Try adjusting your filter."
            />
          ) : null
        }
        renderItem={({ item }) => (
          <AdminRequestCard
            request={item}
            companyName={companyMap[item.companyId]?.companyName}
            technicianCode={technicianMap[item.technicianId]?.anonymousCode}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  summary: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.md,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '500',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
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
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
});
