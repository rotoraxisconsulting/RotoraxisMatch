import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { colors, spacing } from '../../../src/theme';
import { LoadingScreen } from '../../../src/components/LoadingScreen';
import { offerRequestRepository } from '../../../src/repositories/v2/offerRequestRepository';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { companyRepositoryV2 } from '../../../src/repositories/v2/companyRepositoryV2';
import { technicianRepositoryV2 } from '../../../src/repositories/v2/technicianRepositoryV2';
import { activityRepository } from '../../../src/repositories/v2/activityRepository';
import { calculateOfferTechnicianMatch } from '../../../src/utils/matchingV2';
import { DEMO_TECHNICIAN_ID } from '../../../src/state/useTechnicianDashboard';
import { OfferRequest } from '../../../src/types/offerRequest';
import { MatchScore } from '../../../src/types/matching';

type RequestEntry = {
  request: OfferRequest;
  companyName: string;
  offerTitle: string | null;
  contractType: string | null;
  location: string | null;
  score: MatchScore | null;
};

const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  accepted: 1,
  rejected: 2,
  expired: 3,
  withdrawn: 4,
};

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: colors.warning },
  accepted: { label: 'Accepted', color: colors.success },
  rejected: { label: 'Rejected', color: colors.error },
  expired: { label: 'Expired', color: colors.textMuted },
  withdrawn: { label: 'Withdrawn', color: colors.textMuted },
};

const CONTRACT_LABELS: Record<string, string> = {
  permanent: 'Permanent',
  long_term: 'Long-term',
  short_term: 'Short-term',
};

function scoreColor(total: number): string {
  if (total >= 80) return colors.success;
  if (total >= 60) return colors.blue;
  if (total >= 40) return colors.warning;
  return colors.textMuted;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function DirectOffersListScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [entries, setEntries] = useState<RequestEntry[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [requests, techWithRelations] = await Promise.all([
      offerRequestRepository.getForTechnician(DEMO_TECHNICIAN_ID),
      technicianRepositoryV2.getWithRelations(DEMO_TECHNICIAN_ID),
    ]);

    const built = await Promise.all(
      requests.map(async (req) => {
        const [company, offer] = await Promise.all([
          companyRepositoryV2.getById(req.companyId),
          req.offerId ? offerRepository.getWithRequirements(req.offerId) : Promise.resolve(null),
        ]);

        let score: MatchScore | null = null;
        if (offer && techWithRelations) {
          score = calculateOfferTechnicianMatch(offer, techWithRelations);
        }

        return {
          request: req,
          companyName: company?.name ?? 'Company',
          offerTitle: offer?.title ?? null,
          contractType: offer
            ? (CONTRACT_LABELS[offer.contractType] ?? offer.contractType)
            : null,
          location: offer
            ? `${offer.locationCity}, ${offer.locationCountry}`
            : null,
          score,
        };
      }),
    );

    const ids = await activityRepository.getUnreadEntityIds(
      'technician',
      DEMO_TECHNICIAN_ID,
      ['direct_offer_received', 'direct_offer_accepted', 'direct_offer_rejected'],
    );

    built.sort((a, b) => {
      const aUnread = ids.has(a.request.id) ? 0 : 1;
      const bUnread = ids.has(b.request.id) ? 0 : 1;
      if (aUnread !== bUnread) return aUnread - bUnread;
      const so =
        (STATUS_ORDER[a.request.status] ?? 9) -
        (STATUS_ORDER[b.request.status] ?? 9);
      if (so !== 0) return so;
      return b.request.createdAt.localeCompare(a.request.createdAt);
    });

    setUnreadIds(ids);
    setEntries(built);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      load().finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Direct Offers' }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  const pendingCount = entries.filter((e) => e.request.status === 'pending').length;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Direct Offers' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Direct Offers</Text>
          <Text style={styles.pageSub}>
            Offers sent directly to you by companies
            {pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
          </Text>
        </View>

        {entries.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📨</Text>
            <Text style={styles.emptyTitle}>No direct offers yet</Text>
            <Text style={styles.emptySub}>
              Companies can send you direct offers when your profile matches their needs.
            </Text>
          </View>
        )}

        {entries.map(({ request, companyName, offerTitle, contractType, location, score }) => {
          const si = STATUS_INFO[request.status] ?? {
            label: request.status,
            color: colors.textMuted,
          };
          const isUnread = unreadIds.has(request.id);
          return (
            <TouchableOpacity
              key={request.id}
              style={[styles.card, isUnread && styles.cardUnread]}
              onPress={() =>
                router.push(`/technician/direct-offers/${request.id}` as any)
              }
              activeOpacity={0.75}
            >
              {isUnread && <View style={styles.unreadDot} />}
              {/* Card header: avatar + company + offer title + status pill */}
              <View style={styles.cardHeader}>
                <View style={styles.companyAvatar}>
                  <Text style={styles.companyAvatarText}>
                    {companyName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.companyName} numberOfLines={1}>
                    {companyName}
                  </Text>
                  {offerTitle ? (
                    <Text style={styles.offerTitle} numberOfLines={1}>
                      {offerTitle}
                    </Text>
                  ) : (
                    <Text style={styles.noOffer}>Direct message</Text>
                  )}
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: si.color + '20',
                      borderColor: si.color + '50',
                    },
                  ]}
                >
                  <Text style={[styles.statusPillText, { color: si.color }]}>
                    {si.label}
                  </Text>
                </View>
              </View>

              {/* Details row: location · contract · match */}
              {(location || contractType || score) && (
                <View style={styles.detailsRow}>
                  {location && <Text style={styles.detailChip}>{location}</Text>}
                  {location && contractType && <Text style={styles.detailSep}>·</Text>}
                  {contractType && <Text style={styles.detailChip}>{contractType}</Text>}
                  {score ? (
                    <>
                      <Text style={styles.detailSep}>·</Text>
                      <Text style={[styles.detailChipScore, { color: scoreColor(score.total) }]}>
                        {score.total}% match
                      </Text>
                    </>
                  ) : null}
                </View>
              )}

              {/* Company message preview */}
              {request.message ? (
                <Text style={styles.messagePreview} numberOfLines={2}>
                  "{request.message}"
                </Text>
              ) : null}

              {/* Footer: date */}
              <Text style={styles.dateText}>{formatDate(request.createdAt)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  contentWide: { maxWidth: 720, alignSelf: 'center', width: '100%' },
  headerRow: { marginBottom: spacing.md },
  pageTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 2 },
  pageSub: { fontSize: 12, color: colors.textSecondary },
  empty: { alignItems: 'center', paddingVertical: spacing.xxxl },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardUnread: {
    borderColor: colors.error + '60',
  },
  unreadDot: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  companyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  companyAvatarText: { fontSize: 16, fontWeight: '700', color: colors.white },
  cardMeta: { flex: 1 },
  companyName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 1,
  },
  offerTitle: { fontSize: 11, color: colors.technician, fontWeight: '600' },
  noOffer: { fontSize: 11, color: colors.textMuted },
  statusPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    flexShrink: 0,
  },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.xs,
  },
  detailChip: { fontSize: 11, color: colors.textSecondary },
  detailSep: { fontSize: 10, color: colors.textMuted },
  detailChipScore: { fontSize: 11, fontWeight: '700' },
  messagePreview: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  dateText: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
