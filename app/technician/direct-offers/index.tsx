import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { colors, spacing } from '../../../src/theme';
import { LoadingScreen } from '../../../src/components/LoadingScreen';
import {
  ActivityDot,
  EmptyPanel,
  InitialAvatar,
  TechnicianBadge,
  TechnicianCard,
  TechnicianPageHeader,
  TechnicianScreen,
  techStyles,
  techUi,
} from '../../../src/components/technician/TechnicianUI';
import { offerRequestRepository } from '../../../src/repositories/v2/offerRequestRepository';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { companyRepositoryV2 } from '../../../src/repositories/v2/companyRepositoryV2';
import { technicianRepositoryV2 } from '../../../src/repositories/v2/technicianRepositoryV2';
import { activityRepository } from '../../../src/repositories/v2/activityRepository';
import { calculateOfferTechnicianMatch } from '../../../src/utils/matchingV2';
import { useAircraftTypeRatingsCatalog } from '../../../src/state/useAircraftTypeRatingsCatalog';
import { useTechnicianSession } from '../../../src/state/SessionContext';
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

const STATUS_INFO: Record<string, { label: string; tone: 'success' | 'warning' | 'error' | 'muted' }> = {
  pending: { label: 'Pending', tone: 'warning' },
  accepted: { label: 'Accepted', tone: 'success' },
  rejected: { label: 'Declined', tone: 'error' },
  expired: { label: 'Expired', tone: 'muted' },
  withdrawn: { label: 'Withdrawn', tone: 'muted' },
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
  const { technicianId } = useTechnicianSession();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [entries, setEntries] = useState<RequestEntry[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { ratingIndex } = useAircraftTypeRatingsCatalog();

  const load = useCallback(async () => {
    const [requests, techWithRelations] = await Promise.all([
      offerRequestRepository.getForTechnician(technicianId),
      technicianRepositoryV2.getWithRelations(technicianId),
    ]);

    const built = await Promise.all(
      requests.map(async (req) => {
        const [company, offer] = await Promise.all([
          companyRepositoryV2.getById(req.companyId),
          req.offerId ? offerRepository.getWithRequirements(req.offerId) : Promise.resolve(null),
        ]);

        let score: MatchScore | null = null;
        if (offer && techWithRelations) {
          score = calculateOfferTechnicianMatch(offer, techWithRelations, ratingIndex);
        }

        return {
          request: req,
          companyName: company?.name ?? 'Company',
          offerTitle: offer?.title ?? null,
          contractType: offer ? (CONTRACT_LABELS[offer.contractType] ?? offer.contractType) : null,
          location: offer ? `${offer.locationCity}, ${offer.locationCountry}` : null,
          score,
        };
      }),
    );

    const ids = await activityRepository.getUnreadEntityIds(
      'technician',
      technicianId,
      ['direct_offer_received', 'direct_offer_accepted', 'direct_offer_rejected'],
    );

    built.sort((a, b) => {
      const aUnread = ids.has(a.request.id) ? 0 : 1;
      const bUnread = ids.has(b.request.id) ? 0 : 1;
      if (aUnread !== bUnread) return aUnread - bUnread;
      const so = (STATUS_ORDER[a.request.status] ?? 9) - (STATUS_ORDER[b.request.status] ?? 9);
      if (so !== 0) return so;
      return b.request.createdAt.localeCompare(a.request.createdAt);
    });

    setUnreadIds(ids);
    setEntries(built);
  }, [technicianId, ratingIndex]);

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
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  const pendingCount = entries.filter((e) => e.request.status === 'pending').length;

  return (
    <TechnicianScreen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[techStyles.content, isWide && techStyles.contentWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <TechnicianPageHeader
          eyebrow="Company outreach"
          title="Direct Offers"
          subtitle={`Offers sent directly to you${pendingCount > 0 ? ` - ${pendingCount} pending` : ''}`}
          onBack={() => router.back()}
        />

        {entries.length === 0 && (
          <EmptyPanel
            title="No direct offers yet"
            subtitle="Companies can send you direct offers when your profile matches their needs."
          />
        )}

        {entries.map(({ request, companyName, offerTitle, contractType, location, score }) => {
          const status = STATUS_INFO[request.status] ?? { label: request.status, tone: 'muted' as const };
          const isUnread = unreadIds.has(request.id);

          return (
            <TouchableOpacity
              key={request.id}
              style={styles.cardTouchable}
              onPress={() => router.push(`/technician/direct-offers/${request.id}` as any)}
              activeOpacity={0.75}
            >
              <TechnicianCard style={[styles.card, isUnread && styles.cardUnread]}>
                {isUnread && <ActivityDot />}
                <View style={styles.cardHeader}>
                  <InitialAvatar label={companyName} />
                  <View style={styles.cardMeta}>
                    <Text style={styles.companyName} numberOfLines={1}>{companyName}</Text>
                    <Text style={styles.offerTitle} numberOfLines={1}>
                      {offerTitle ?? 'Direct message'}
                    </Text>
                  </View>
                  <TechnicianBadge label={status.label} tone={status.tone} small />
                </View>

                {(location || contractType || score) && (
                  <View style={styles.detailsRow}>
                    {location ? <TechnicianBadge label={location} tone="muted" small /> : null}
                    {contractType ? <TechnicianBadge label={contractType} tone="muted" small /> : null}
                    {score ? (
                      <Text style={[styles.matchText, { color: scoreColor(score.total) }]}>
                        {score.total}% match
                      </Text>
                    ) : null}
                  </View>
                )}

                {request.message ? (
                  <Text style={styles.messagePreview} numberOfLines={2}>
                    "{request.message}"
                  </Text>
                ) : null}

                <View style={styles.footer}>
                  <Text style={styles.dateText}>{formatDate(request.createdAt)}</Text>
                  <Text style={styles.viewLink}>View</Text>
                </View>
              </TechnicianCard>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </TechnicianScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  cardTouchable: { marginBottom: spacing.md },
  card: {
    position: 'relative',
  },
  cardUnread: {
    borderColor: techUi.redSoft,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardMeta: { flex: 1, minWidth: 0 },
  companyName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: techUi.text,
    marginBottom: 2,
  },
  offerTitle: { fontSize: 12, color: techUi.accent, fontWeight: '600' },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  matchText: { fontSize: 12, fontWeight: '700', paddingVertical: 4 },
  messagePreview: {
    fontSize: 13,
    color: techUi.textSoft,
    lineHeight: 19,
    marginBottom: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dateText: { fontSize: 11, color: techUi.textMuted, fontWeight: '500' },
  viewLink: { fontSize: 13, fontWeight: '700', color: techUi.accent },
});
