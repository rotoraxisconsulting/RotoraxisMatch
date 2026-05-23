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
import { colors, spacing, typography } from '../../../src/theme';
import { Badge } from '../../../src/components/Badge';
import { Button } from '../../../src/components/Button';
import { LoadingScreen } from '../../../src/components/LoadingScreen';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { Offer } from '../../../src/types/offer';
import { DEMO_COMPANY_ID } from '../../../src/state/useCompanyDashboard';

type BadgeVariant = 'success' | 'warning' | 'navy' | 'error';

function statusVariant(status: Offer['status']): BadgeVariant {
  if (status === 'published') return 'success';
  if (status === 'draft') return 'warning';
  if (status === 'expired') return 'error';
  return 'navy';
}

function statusAccent(status: Offer['status']): string {
  if (status === 'published') return colors.success;
  if (status === 'draft') return colors.warning;
  if (status === 'expired') return colors.error;
  return colors.textMuted;
}

const CONTRACT_LABELS: Record<string, string> = {
  permanent: 'Permanent',
  long_term: 'Long-term',
  short_term: 'Short-term',
};

export default function OffersListScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const list = await offerRepository.getForCompany(DEMO_COMPANY_ID);
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setOffers(list);
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

  const published = offers.filter((o) => o.status === 'published');
  const drafts = offers.filter((o) => o.status === 'draft');

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Job Offers' }} />
        <LoadingScreen color={colors.blue} role="company" />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Job Offers' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[typography.h4, styles.pageTitle]}>Job Offers</Text>
            <Text style={styles.pageSub}>
              {published.length} published · {drafts.length} draft
            </Text>
          </View>
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => router.push('/company/offers/new' as any)}
            activeOpacity={0.75}
          >
            <Text style={styles.newBtnText}>+ New offer</Text>
          </TouchableOpacity>
        </View>

        {offers.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No offers yet</Text>
            <Text style={styles.emptySub}>
              Create your first job offer to start matching with technicians.
            </Text>
            <Button
              label="Create offer"
              onPress={() => router.push('/company/offers/new' as any)}
              variant="primary"
              style={styles.emptyBtn}
            />
          </View>
        )}

        {offers.map((offer) => (
          <TouchableOpacity
            key={offer.id}
            style={[styles.card, { borderLeftColor: statusAccent(offer.status) }]}
            onPress={() => router.push(`/company/offers/${offer.id}` as any)}
            activeOpacity={0.75}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{offer.title}</Text>
              <Badge label={offer.status} variant={statusVariant(offer.status)} />
            </View>
            <Text style={styles.cardSub}>
              {offer.locationCity}, {offer.locationCountry}
              {offer.locationBaseAirport ? ` · ${offer.locationBaseAirport}` : ''}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>
                  {CONTRACT_LABELS[offer.contractType] ?? offer.contractType}
                </Text>
              </View>
              {offer.minYearsExperience > 0 && (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>{offer.minYearsExperience}+ yrs exp</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  contentWide: { maxWidth: 720, alignSelf: 'center', width: '100%' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  pageTitle: { marginBottom: 2 },
  pageSub: { fontSize: 12, color: colors.textSecondary },
  newBtn: {
    backgroundColor: colors.blue,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  newBtnText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 280,
  },
  emptyBtn: { minWidth: 160 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  cardSub: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
  metaRow: { flexDirection: 'row', gap: spacing.xs },
  metaChip: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  metaChipText: { fontSize: 11, color: colors.textSecondary },
});
