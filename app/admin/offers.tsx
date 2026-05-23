import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { EmptyState } from '../../src/components/EmptyState';
import { useAdminDashboard } from '../../src/state/useAdminDashboard';
import { Offer } from '../../src/types/offer';
import { OfferStatus } from '../../src/types/enums';
import { colors, spacing } from '../../src/theme';

type StatusFilter = 'all' | OfferStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Draft' },
  { key: 'closed', label: 'Closed' },
  { key: 'expired', label: 'Expired' },
];

const STATUS_COLORS: Record<OfferStatus, string> = {
  published: colors.success,
  draft: colors.textMuted,
  closed: colors.warning,
  expired: colors.error,
};

const NEXT_STATUSES: Record<OfferStatus, OfferStatus[]> = {
  draft: ['published', 'expired'],
  published: ['closed', 'expired'],
  closed: ['expired'],
  expired: [],
};

const STATUS_LABELS: Record<OfferStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  closed: 'Closed',
  expired: 'Expired',
};

function filterOffers(offers: Offer[], status: StatusFilter): Offer[] {
  const result = status === 'all' ? offers : offers.filter((o) => o.status === status);
  const order: Record<OfferStatus, number> = { published: 0, draft: 1, closed: 2, expired: 3 };
  return [...result].sort((a, b) => (order[a.status] ?? 0) - (order[b.status] ?? 0));
}

export default function AdminOffersScreen() {
  const { offers, loading, refresh, updateOfferStatus, companyMap } = useAdminDashboard();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const filtered = useMemo(() => filterOffers(offers, statusFilter), [offers, statusFilter]);

  async function handleAction(id: string, status: OfferStatus) {
    try {
      await updateOfferStatus(id, status);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update offer status.');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Offers' }} />
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
              {filtered.length} offer{filtered.length !== 1 ? 's' : ''}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="📋"
              title="No offers found"
              subtitle="Try adjusting your filter."
            />
          ) : null
        }
        renderItem={({ item }) => (
          <OfferCard
            offer={item}
            companyName={companyMap[item.companyId]?.companyName ?? item.companyId}
            onAction={handleAction}
          />
        )}
      />
    </SafeAreaView>
  );
}

function OfferCard({
  offer,
  companyName,
  onAction,
}: {
  offer: Offer;
  companyName: string;
  onAction: (offerId: string, status: OfferStatus) => void;
}) {
  const statusColor = STATUS_COLORS[offer.status];
  const nextStatuses = NEXT_STATUSES[offer.status];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle} numberOfLines={1}>{offer.title}</Text>
          <Text style={styles.cardCompany} numberOfLines={1}>{companyName}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {STATUS_LABELS[offer.status]}
          </Text>
        </View>
      </View>

      <View style={styles.cardMeta}>
        <Text style={styles.metaItem}>
          📍 {offer.locationCity}, {offer.locationCountry}
        </Text>
        <Text style={styles.metaItem}>
          📄 {offer.contractType}
        </Text>
        <Text style={styles.metaItem}>
          🎓 {offer.minYearsExperience}+ yrs
        </Text>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.footerDate}>
          {new Date(offer.createdAt).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
          })}
        </Text>
        {nextStatuses.length === 0 && (
          <Text style={styles.noActionHint}>No actions available</Text>
        )}
      </View>

      {nextStatuses.length > 0 && (
        <View style={styles.actionRow}>
          {nextStatuses.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.actionBtn, { borderColor: STATUS_COLORS[s] + '99' }]}
              onPress={() => onAction(offer.id, s)}
              activeOpacity={0.75}
            >
              <Text style={[styles.actionBtnText, { color: STATUS_COLORS[s] }]}>
                → {STATUS_LABELS[s]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  tabActive: { backgroundColor: colors.admin },
  tabText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.white },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  resultCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTitleBlock: { flex: 1 },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  cardCompany: { fontSize: 12, color: colors.textSecondary },
  statusPill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metaItem: { fontSize: 11, color: colors.textSecondary },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerDate: { fontSize: 11, color: colors.textMuted },
  noActionHint: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    marginTop: spacing.xs,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
