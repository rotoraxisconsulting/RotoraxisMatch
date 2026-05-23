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
import { MatchBadge } from '../../../src/components/MatchBadge';
import { offerApplicationRepository } from '../../../src/repositories/v2/offerApplicationRepository';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { technicianRepositoryV2 } from '../../../src/repositories/v2/technicianRepositoryV2';
import { activityRepository } from '../../../src/repositories/v2/activityRepository';
import { calculateOfferTechnicianMatch } from '../../../src/utils/matchingV2';
import { getSafeTechnicianPreview } from '../../../src/utils/privacyV2';
import { DEMO_COMPANY_ID } from '../../../src/state/useCompanyDashboard';
import { OfferApplication } from '../../../src/types/offerRequest';
import { OfferWithRequirements } from '../../../src/types/offer';
import { TechnicianWithRelations } from '../../../src/types/technician';
import { SafeTechnicianPreview } from '../../../src/types/privacy';
import { MatchScore } from '../../../src/types/matching';

type StatusFilter = 'all' | 'pending' | 'accepted' | 'rejected';

type AppEntry = {
  app: OfferApplication;
  offer: OfferWithRequirements | null;
  tech: TechnicianWithRelations | null;
  safePreview: SafeTechnicianPreview | null;
  score: MatchScore | null;
};

const TECH_TYPE_LABELS: Record<string, string> = {
  mechanic: 'Mechanic',
  avionics: 'Avionics',
  structures: 'Structures',
  inspector: 'Inspector',
  electrician: 'Electrician',
};

function scoreColor(total: number): string {
  if (total >= 80) return colors.success;
  if (total >= 60) return colors.blue;
  if (total >= 40) return colors.warning;
  return colors.textMuted;
}

function statusInfo(status: string): { label: string; color: string } {
  switch (status) {
    case 'pending': return { label: 'Pending review', color: colors.warning };
    case 'accepted': return { label: 'Accepted', color: colors.success };
    case 'rejected': return { label: 'Rejected', color: colors.error };
    case 'withdrawn': return { label: 'Withdrawn', color: colors.textMuted };
    case 'expired': return { label: 'Expired', color: colors.textMuted };
    default: return { label: status, color: colors.textMuted };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ApplicationsListScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [entries, setEntries] = useState<AppEntry[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    const apps = await offerApplicationRepository.getForCompany(DEMO_COMPANY_ID);

    const allOffers = await offerRepository.getAllWithRequirements();
    const offersMap: Record<string, OfferWithRequirements> = {};
    allOffers.forEach((o) => { offersMap[o.id] = o; });

    const uniqueTechIds = [...new Set(apps.map((a) => a.technicianId))];
    const techResults = await Promise.all(uniqueTechIds.map((id) => technicianRepositoryV2.getWithRelations(id)));
    const techsMap: Record<string, TechnicianWithRelations> = {};
    uniqueTechIds.forEach((id, i) => { if (techResults[i]) techsMap[id] = techResults[i]!; });

    const built: AppEntry[] = apps.map((app) => {
      const offer = offersMap[app.offerId] ?? null;
      const tech = techsMap[app.technicianId] ?? null;
      return {
        app,
        offer,
        tech,
        safePreview: tech ? getSafeTechnicianPreview(tech) : null,
        score: offer && tech ? calculateOfferTechnicianMatch(offer, tech) : null,
      };
    });

    const ids = await activityRepository.getUnreadEntityIds(
      'company',
      DEMO_COMPANY_ID,
      ['application_received'],
    );

    built.sort((a, b) => {
      const aUnread = ids.has(a.app.id) ? 0 : 1;
      const bUnread = ids.has(b.app.id) ? 0 : 1;
      if (aUnread !== bUnread) return aUnread - bUnread;
      const order = ['pending', 'accepted', 'rejected', 'withdrawn', 'expired'];
      const ai = order.indexOf(a.app.status);
      const bi = order.indexOf(b.app.status);
      if (ai !== bi) return ai - bi;
      return new Date(b.app.createdAt).getTime() - new Date(a.app.createdAt).getTime();
    });

    setUnreadIds(ids);
    setEntries(built);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      load().finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = statusFilter === 'all'
    ? entries
    : entries.filter((e) => e.app.status === statusFilter);

  const pendingCount = entries.filter((e) => e.app.status === 'pending').length;

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Applications' }} />
        <LoadingScreen color={colors.blue} role="company" />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Incoming Applications' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Applications</Text>
          <Text style={styles.pageSub}>
            {entries.length} total · {pendingCount} pending review
          </Text>
        </View>

        {/* Status filter tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterContent}
        >
          {(['all', 'pending', 'accepted', 'rejected'] as StatusFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterPill, statusFilter === f && styles.filterPillActive]}
              onPress={() => setStatusFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterPillText, statusFilter === f && styles.filterPillTextActive]}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Empty state */}
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>
              {entries.length === 0 ? 'No applications yet' : 'No applications in this category'}
            </Text>
            <Text style={styles.emptySub}>
              {entries.length === 0
                ? 'When technicians apply to your offers, their applications will appear here.'
                : 'Try switching to "All" to see all applications.'}
            </Text>
          </View>
        )}

        {/* Application cards */}
        {filtered.map(({ app, offer, safePreview, score }) => {
          const { label: statusLabel, color: statusColor } = statusInfo(app.status);
          const accent = score ? scoreColor(score.total) : colors.textMuted;
          const isUnread = unreadIds.has(app.id);

          return (
            <TouchableOpacity
              key={app.id}
              style={[styles.card, { borderLeftColor: accent }, isUnread && styles.cardUnread]}
              onPress={() => router.push(`/company/applications/${app.id}` as any)}
              activeOpacity={0.75}
            >
              {isUnread && <View style={styles.unreadDot} />}
              {/* Top row: offer title + score */}
              <View style={styles.cardTop}>
                <View style={styles.cardLeft}>
                  <Text style={styles.offerTitle} numberOfLines={1}>
                    {offer?.title ?? 'Unknown offer'}
                  </Text>
                  {safePreview && (
                    <Text style={styles.applicantCode}>
                      {safePreview.anonymousCode} · {TECH_TYPE_LABELS[safePreview.technicianType] ?? safePreview.technicianType} · {safePreview.age} yrs
                    </Text>
                  )}
                  {safePreview && (
                    <Text style={styles.applicantLocation}>
                      {safePreview.city}, {safePreview.country}
                      {safePreview.baseAirport ? ` · ${safePreview.baseAirport}` : ''}
                    </Text>
                  )}
                </View>
                {score && (
                  <MatchBadge score={score.total} context="match for offer" />
                )}
              </View>

              {/* Cover note snippet */}
              {app.coverNote && (
                <Text style={styles.coverNote} numberOfLines={2}>
                  "{app.coverNote}"
                </Text>
              )}

              {/* Bottom row: status + date + CTA */}
              <View style={styles.cardBottom}>
                <View style={[styles.statusPill, { borderColor: statusColor + '60' }]}>
                  <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
                <Text style={styles.dateText}>{formatDate(app.createdAt)}</Text>
                <Text style={styles.reviewLink}>Review →</Text>
              </View>
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
  filterRow: { marginBottom: spacing.md, flexGrow: 0 },
  filterContent: { gap: spacing.xs, paddingRight: spacing.lg },
  filterPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.surface,
  },
  filterPillActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  filterPillText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  filterPillTextActive: { color: colors.white },
  empty: { alignItems: 'center', paddingVertical: spacing.xxxl },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', maxWidth: 280 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
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
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  cardLeft: { flex: 1 },
  offerTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  applicantCode: { fontSize: 12, color: colors.textSecondary, marginBottom: 1 },
  applicantLocation: { fontSize: 11, color: colors.textMuted },
  coverNote: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 18,
    marginBottom: spacing.xs,
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 11, color: colors.textMuted, flex: 1 },
  reviewLink: { fontSize: 13, fontWeight: '700', color: colors.blue },
});
