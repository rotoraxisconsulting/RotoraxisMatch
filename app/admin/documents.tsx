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
import { AdminDocumentCard } from '../../src/components/AdminDocumentCard';
import { EmptyState } from '../../src/components/EmptyState';
import { useAdminDashboard } from '../../src/state/useAdminDashboard';
import { TechnicianDocument, DocumentStatus } from '../../src/types';
import { colors, spacing } from '../../src/theme';

type StatusFilter = 'all' | DocumentStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
];

function filterDocuments(docs: TechnicianDocument[], status: StatusFilter): TechnicianDocument[] {
  const result = status === 'all' ? docs : docs.filter((d) => d.status === status);
  return [...result].sort((a, b) => {
    const order = { pending: 0, rejected: 1, expired: 2, verified: 3 };
    if ((order[a.status] ?? 0) !== (order[b.status] ?? 0)) return (order[a.status] ?? 0) - (order[b.status] ?? 0);
    // Within same status: newest first
    return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
  });
}

export default function AdminDocumentsScreen() {
  const { documents, loading, refresh, updateDocumentStatus, technicianMap } =
    useAdminDashboard();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const filtered = useMemo(
    () => filterDocuments(documents, statusFilter),
    [documents, statusFilter],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Documents' }} />
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

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          !loading ? (
            <Text style={styles.resultCount}>
              {filtered.length} document{filtered.length !== 1 ? 's' : ''}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="📄"
              title="No documents found"
              subtitle="Try adjusting your filter."
            />
          ) : null
        }
        renderItem={({ item }) => (
          <AdminDocumentCard
            document={item}
            technicianName={technicianMap[item.technicianId]?.fullName}
            onUpdateStatus={updateDocumentStatus}
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
