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
import { EmptyState } from '../../src/components/EmptyState';
import { useAdminDashboard } from '../../src/state/useAdminDashboard';
import { OfferRequest, OfferApplication, OfferInboxRecord } from '../../src/types/offerRequest';
import { OfferRequestStatus } from '../../src/types/enums';
import { colors, spacing } from '../../src/theme';

type StatusFilter = 'all' | OfferRequestStatus;
type KindFilter = 'all' | 'direct_offer' | 'application';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
];

const KIND_CHIPS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'All types' },
  { key: 'direct_offer', label: '📩 Direct offers' },
  { key: 'application', label: '📝 Applications' },
];

const STATUS_COLORS: Record<OfferRequestStatus, string> = {
  pending: colors.warning,
  accepted: colors.success,
  rejected: colors.error,
  expired: colors.textMuted,
  withdrawn: colors.textMuted,
};

function filterRecords(
  records: OfferInboxRecord[],
  status: StatusFilter,
  kind: KindFilter,
): OfferInboxRecord[] {
  let result = records;
  if (status !== 'all') result = result.filter((r) => r.status === status);
  if (kind !== 'all') result = result.filter((r) => r.kind === kind);
  const order: Record<OfferRequestStatus, number> = {
    pending: 0, accepted: 1, rejected: 2, expired: 3, withdrawn: 4,
  };
  return [...result].sort(
    (a, b) =>
      (order[a.status] ?? 0) - (order[b.status] ?? 0) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export default function AdminRequestsScreen() {
  const {
    offerRequestsV2,
    offerApplicationsV2,
    loading,
    refresh,
    technicianMap,
    companyMap,
    offerTitleMap,
  } = useAdminDashboard();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const allRecords: OfferInboxRecord[] = useMemo(
    () => [...offerRequestsV2, ...offerApplicationsV2],
    [offerRequestsV2, offerApplicationsV2],
  );

  const filtered = useMemo(
    () => filterRecords(allRecords, statusFilter, kindFilter),
    [allRecords, statusFilter, kindFilter],
  );

  const pendingCount = allRecords.filter((r) => r.status === 'pending').length;
  const acceptedCount = allRecords.filter((r) => r.status === 'accepted').length;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Requests & Applications' }} />
      <DemoModeBanner role="admin" />

      {/* Summary strip */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.warning }]}>{pendingCount}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.success }]}>{acceptedCount}</Text>
          <Text style={styles.summaryLabel}>Accepted</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.blue }]}>
            {offerRequestsV2.length}
          </Text>
          <Text style={styles.summaryLabel}>Direct offers</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.cyan }]}>
            {offerApplicationsV2.length}
          </Text>
          <Text style={styles.summaryLabel}>Applications</Text>
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

      {/* Kind filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.kindScroll}
        contentContainerStyle={styles.kindChips}
      >
        {KIND_CHIPS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.chip, kindFilter === key && styles.chipActive]}
            onPress={() => setKindFilter(key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, kindFilter === key && styles.chipTextActive]}>
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
              {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="📋"
              title="No records found"
              subtitle="Try adjusting your filters."
            />
          ) : null
        }
        renderItem={({ item }) => (
          <RecordCard
            record={item}
            companyName={companyMap[item.companyId]?.companyName ?? item.companyId}
            technicianCode={technicianMap[item.technicianId]?.anonymousCode ?? item.technicianId}
            technicianName={technicianMap[item.technicianId]?.fullName}
            offerTitle={item.kind === 'direct_offer'
              ? (item.offerId ? offerTitleMap[item.offerId] : undefined)
              : offerTitleMap[item.offerId]}
          />
        )}
      />
    </SafeAreaView>
  );
}

function RecordCard({
  record,
  companyName,
  technicianCode,
  technicianName,
  offerTitle,
}: {
  record: OfferInboxRecord;
  companyName: string;
  technicianCode: string;
  technicianName?: string;
  offerTitle?: string;
}) {
  const statusColor = STATUS_COLORS[record.status];
  const isDirectOffer = record.kind === 'direct_offer';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[
          styles.kindBadge,
          { backgroundColor: isDirectOffer ? colors.blue + '18' : colors.cyan + '18' },
        ]}>
          <Text style={[
            styles.kindText,
            { color: isDirectOffer ? colors.blue : colors.cyan },
          ]}>
            {isDirectOffer ? '📩 Direct offer' : '📝 Application'}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {record.status}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Row icon="🏢" label={companyName} />
        <Row
          icon="👷"
          label={technicianName
            ? `${technicianName} (${technicianCode})`
            : technicianCode}
        />
        {offerTitle ? <Row icon="📋" label={offerTitle} /> : null}
        {isDirectOffer && (record as OfferRequest).message ? (
          <Row icon="💬" label={(record as OfferRequest).message!} muted italic />
        ) : null}
        {!isDirectOffer && (record as OfferApplication).coverNote ? (
          <Row icon="💬" label={(record as OfferApplication).coverNote!} muted italic />
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.flags}>
          <FlagChip
            label="Identity"
            active={record.identityRevealed}
          />
          <FlagChip
            label="Docs"
            active={record.documentsUnlocked}
          />
        </View>
        <Text style={styles.footerDate}>
          {new Date(record.createdAt).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
          })}
        </Text>
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  muted,
  italic,
}: {
  icon: string;
  label: string;
  muted?: boolean;
  italic?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text
        style={[
          styles.rowText,
          muted && styles.rowTextMuted,
          italic && styles.rowTextItalic,
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}

function FlagChip({ label, active }: { label: string; active: boolean }) {
  return (
    <View style={[styles.flagChip, active ? styles.flagChipOn : styles.flagChipOff]}>
      <Text style={[styles.flagText, active ? styles.flagTextOn : styles.flagTextOff]}>
        {active ? '✓' : '–'} {label}
      </Text>
    </View>
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
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: 20, fontWeight: '700', lineHeight: 26 },
  summaryLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500' },
  summaryDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },
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
  tabActive: { backgroundColor: colors.admin },
  tabText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.white },
  kindScroll: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  kindChips: {
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
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  chipTextActive: { color: colors.white },
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  kindBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  kindText: { fontSize: 11, fontWeight: '700' },
  statusPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  cardBody: { gap: 4, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  rowIcon: { fontSize: 12, marginTop: 2 },
  rowText: { fontSize: 13, color: colors.text, flex: 1, lineHeight: 18 },
  rowTextMuted: { color: colors.textSecondary },
  rowTextItalic: { fontStyle: 'italic' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  flags: { flexDirection: 'row', gap: 4 },
  flagChip: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  flagChipOn: { backgroundColor: colors.success + '18', borderColor: colors.success + '40' },
  flagChipOff: { backgroundColor: colors.background, borderColor: colors.border },
  flagText: { fontSize: 10, fontWeight: '600' },
  flagTextOn: { color: colors.success },
  flagTextOff: { color: colors.textMuted },
  footerDate: { fontSize: 11, color: colors.textMuted },
});
