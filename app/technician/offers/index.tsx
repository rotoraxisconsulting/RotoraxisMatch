import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { colors, spacing } from '../../../src/theme';
import { LoadingScreen } from '../../../src/components/LoadingScreen';
import { MatchBadge } from '../../../src/components/MatchBadge';
import { getOfferMatchesForTechnician, OfferMatchResult } from '../../../src/utils/matchingV2';
import { offerApplicationRepository } from '../../../src/repositories/v2/offerApplicationRepository';
import { companyRepositoryV2 } from '../../../src/repositories/v2/companyRepositoryV2';
import { activityRepository } from '../../../src/repositories/v2/activityRepository';
import { DEMO_TECHNICIAN_ID } from '../../../src/state/useTechnicianDashboard';
import { CompanyProfile } from '../../../src/types/company';
import { OfferApplication } from '../../../src/types/offerRequest';
import { ContractTypeCode } from '../../../src/types/catalog';

const CONTRACT_LABELS: Record<string, string> = {
  permanent: 'Permanent',
  long_term: 'Long-term',
  short_term: 'Short-term',
};

const COMPANY_TYPE_LABELS: Record<string, string> = {
  MRO: 'MRO',
  airline: 'Airline',
  recruitment_agency: 'Recruitment',
  helicopter_operator: 'Helicopter Operator',
  other: 'Other',
};

function scoreColor(total: number): string {
  if (total >= 80) return colors.success;
  if (total >= 60) return colors.blue;
  if (total >= 40) return colors.warning;
  return colors.textMuted;
}

function appStatusInfo(status: string): { label: string; color: string } {
  switch (status) {
    case 'pending': return { label: 'Applied — pending', color: colors.warning };
    case 'accepted': return { label: 'Accepted', color: colors.success };
    case 'rejected': return { label: 'Not selected', color: colors.error };
    case 'expired': return { label: 'Offer expired', color: colors.textMuted };
    case 'withdrawn': return { label: 'Withdrawn', color: colors.textMuted };
    default: return { label: status, color: colors.textMuted };
  }
}

type ContractFilter = ContractTypeCode | 'all';

export default function BrowseOffersScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [matches, setMatches] = useState<OfferMatchResult[]>([]);
  const [companyMap, setCompanyMap] = useState<Record<string, CompanyProfile>>({});
  const [applications, setApplications] = useState<OfferApplication[]>([]);
  const [unreadAppIds, setUnreadAppIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [contractFilter, setContractFilter] = useState<ContractFilter>('all');
  const [searchText, setSearchText] = useState('');

  const load = useCallback(async () => {
    const [offerMatches, companies, apps, unreadIds] = await Promise.all([
      getOfferMatchesForTechnician(DEMO_TECHNICIAN_ID),
      companyRepositoryV2.getAll(),
      offerApplicationRepository.getForTechnician(DEMO_TECHNICIAN_ID),
      activityRepository.getUnreadEntityIds('technician', DEMO_TECHNICIAN_ID, [
        'application_accepted',
        'application_rejected',
      ]),
    ]);
    setMatches(offerMatches);
    const map: Record<string, CompanyProfile> = {};
    companies.forEach((c) => { map[c.id] = c; });
    setCompanyMap(map);
    setApplications(apps);
    setUnreadAppIds(unreadIds);
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

  function getApp(offerId: string): OfferApplication | null {
    return applications.find((a) => a.offerId === offerId) ?? null;
  }

  function getAppStatus(offerId: string): string | null {
    return getApp(offerId)?.status ?? null;
  }

  function isOfferUnread(offerId: string): boolean {
    const app = getApp(offerId);
    return app ? unreadAppIds.has(app.id) : false;
  }

  const filtered = matches
    .filter(({ offer }) => {
      if (contractFilter !== 'all' && offer.contractType !== contractFilter) return false;
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const haystack = [offer.title, offer.locationCity, offer.locationCountry, offer.locationBaseAirport ?? '']
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aUnread = isOfferUnread(a.offer.id) ? 0 : 1;
      const bUnread = isOfferUnread(b.offer.id) ? 0 : 1;
      if (aUnread !== bUnread) return aUnread - bUnread;
      return b.score.total - a.score.total;
    });

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Browse Offers' }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Browse Offers' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.pageTitle}>Browse Offers</Text>
            <Text style={styles.pageSub}>
              {filtered.length} offer{filtered.length !== 1 ? 's' : ''} · ranked by match
            </Text>
          </View>
        </View>

        {/* Search */}
        <TextInput
          style={styles.search}
          placeholder="Search by title, city or country…"
          placeholderTextColor={colors.textMuted}
          value={searchText}
          onChangeText={setSearchText}
        />

        {/* Contract type filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterContent}
        >
          {(['all', 'permanent', 'long_term', 'short_term'] as ContractFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterPill, contractFilter === f && styles.filterPillActive]}
              onPress={() => setContractFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterPillText, contractFilter === f && styles.filterPillTextActive]}>
                {f === 'all' ? 'All contracts' : CONTRACT_LABELS[f]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Empty state */}
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔎</Text>
            <Text style={styles.emptyTitle}>No offers found</Text>
            <Text style={styles.emptySub}>
              {matches.length === 0
                ? 'There are no published offers at the moment.'
                : 'Try adjusting your filters.'}
            </Text>
          </View>
        )}

        {/* Offer cards */}
        {filtered.map(({ offer, score }) => {
          const company = companyMap[offer.companyId];
          const appStatus = getAppStatus(offer.id);
          const accent = scoreColor(score.total);
          const unread = isOfferUnread(offer.id);

          return (
            <TouchableOpacity
              key={offer.id}
              style={[styles.card, { borderLeftColor: accent }, unread && styles.cardUnread]}
              onPress={() => router.push(`/technician/offers/${offer.id}` as any)}
              activeOpacity={0.75}
            >
              {unread && <View style={styles.unreadDot} />}
              {/* Score + title row */}
              <View style={styles.cardTop}>
                <View style={styles.cardTitleBlock}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{offer.title}</Text>
                  {company && (
                    <Text style={styles.cardCompany}>
                      {company.name}
                      {company.companyType ? ` · ${COMPANY_TYPE_LABELS[company.companyType] ?? company.companyType}` : ''}
                    </Text>
                  )}
                </View>
                <MatchBadge score={score.total} context="match with profile" />
              </View>

              {/* Location + contract */}
              <Text style={styles.cardLocation}>
                {offer.locationCity}, {offer.locationCountry}
                {offer.locationBaseAirport ? ` · ${offer.locationBaseAirport}` : ''}
              </Text>

              <View style={styles.metaRow}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{CONTRACT_LABELS[offer.contractType] ?? offer.contractType}</Text>
                </View>
                {offer.minYearsExperience > 0 && (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{offer.minYearsExperience}+ yrs exp</Text>
                  </View>
                )}
                <View style={[styles.chip, { backgroundColor: accent + '18', borderColor: accent + '60' }]}>
                  <Text style={[styles.chipText, { color: accent, fontWeight: '700' }]}>
                    {score.label}
                  </Text>
                </View>
              </View>

              {/* Requirements summary */}
              {(offer.requiredLicenses.length > 0 || offer.requiredAircraftTypes.length > 0) && (
                <View style={styles.reqRow}>
                  {offer.requiredLicenses.slice(0, 3).map((l, i) => (
                    <View key={i} style={styles.reqChip}>
                      <Text style={styles.reqChipText}>{l}</Text>
                    </View>
                  ))}
                  {offer.requiredAircraftTypes.slice(0, 3).map((a, i) => (
                    <View key={`a${i}`} style={styles.reqChip}>
                      <Text style={styles.reqChipText}>{a}</Text>
                    </View>
                  ))}
                  {(offer.requiredLicenses.length + offer.requiredAircraftTypes.length) > 6 && (
                    <View style={styles.reqChip}>
                      <Text style={styles.reqChipText}>+{offer.requiredLicenses.length + offer.requiredAircraftTypes.length - 6} more</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Application status or CTA */}
              {appStatus ? (
                <View style={[styles.appStatusRow, { borderColor: appStatusInfo(appStatus).color + '60' }]}>
                  <Text style={[styles.appStatusText, { color: appStatusInfo(appStatus).color }]}>
                    {appStatusInfo(appStatus).label}
                  </Text>
                </View>
              ) : (
                <View style={styles.ctaRow}>
                  <Text style={styles.viewLink}>View offer →</Text>
                </View>
              )}
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  pageTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 2 },
  pageSub: { fontSize: 12, color: colors.textSecondary },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing.sm,
  },
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
  filterPillActive: { backgroundColor: colors.technician, borderColor: colors.technician },
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
    marginBottom: 4,
    gap: spacing.sm,
  },
  cardTitleBlock: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  cardCompany: { fontSize: 12, color: colors.textSecondary },
  cardLocation: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs },
  chip: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  chipText: { fontSize: 11, color: colors.textSecondary },
  reqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.xs },
  reqChip: {
    backgroundColor: colors.navyLight + '15',
    borderWidth: 1,
    borderColor: colors.navyLight + '40',
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  reqChipText: { fontSize: 10, color: colors.navy, fontWeight: '600' },
  appStatusRow: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  appStatusText: { fontSize: 12, fontWeight: '700' },
  ctaRow: { marginTop: spacing.sm, alignItems: 'flex-end' },
  viewLink: { fontSize: 13, fontWeight: '700', color: colors.technician },
});
