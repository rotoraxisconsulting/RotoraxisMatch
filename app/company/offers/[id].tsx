import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { colors, spacing, typography } from '../../../src/theme';
import { Badge } from '../../../src/components/Badge';
import { LoadingScreen } from '../../../src/components/LoadingScreen';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { offerRequestRepository } from '../../../src/repositories/v2/offerRequestRepository';
import { getTechnicianMatchesForOffer, TechnicianMatchResult } from '../../../src/utils/matchingV2';
import { OfferWithRequirements } from '../../../src/types/offer';
import { OfferRequest } from '../../../src/types/offerRequest';
import { DEMO_COMPANY_ID } from '../../../src/state/useCompanyDashboard';

type BadgeVariant = 'success' | 'warning' | 'navy' | 'error';

function statusVariant(status: string): BadgeVariant {
  if (status === 'published') return 'success';
  if (status === 'draft') return 'warning';
  if (status === 'expired') return 'error';
  return 'navy';
}

function scoreColor(total: number): string {
  if (total >= 80) return colors.success;
  if (total >= 60) return colors.blue;
  if (total >= 40) return colors.warning;
  return colors.textMuted;
}

const CONTRACT_LABELS: Record<string, string> = {
  permanent: 'Permanent',
  long_term: 'Long-term',
  short_term: 'Short-term',
};

export default function OfferDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [offer, setOffer] = useState<OfferWithRequirements | null>(null);
  const [matches, setMatches] = useState<TechnicianMatchResult[]>([]);
  const [existingRequests, setExistingRequests] = useState<OfferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);

  // Send-offer modal state
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [o, reqs] = await Promise.all([
      offerRepository.getWithRequirements(id),
      offerRequestRepository.getForCompany(DEMO_COMPANY_ID),
    ]);
    setOffer(o);
    setExistingRequests(reqs.filter((r) => r.offerId === id));
  }, [id]);

  const loadMatches = useCallback(async () => {
    if (!id) return;
    setLoadingMatches(true);
    const results = await getTechnicianMatchesForOffer(id);
    setMatches(results);
    setLoadingMatches(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      load()
        .then(() => { if (active) loadMatches(); })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [load, loadMatches]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    await loadMatches();
    setRefreshing(false);
  }

  async function handlePublish() {
    if (!offer || !id) return;
    setStatusChanging(true);
    await offerRepository.updateStatus(id, 'published');
    const updated = await offerRepository.getWithRequirements(id);
    setOffer(updated);
    setStatusChanging(false);
  }

  async function handleClose() {
    if (!offer || !id) return;
    Alert.alert('Close offer?', 'This offer will no longer be visible to technicians.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close offer',
        style: 'destructive',
        onPress: async () => {
          setStatusChanging(true);
          await offerRepository.updateStatus(id, 'closed');
          const updated = await offerRepository.getWithRequirements(id);
          setOffer(updated);
          setStatusChanging(false);
        },
      },
    ]);
  }

  async function handleSendOffer() {
    if (!selectedTechId || !id) return;
    setSending(true);
    try {
      await offerRequestRepository.create({
        companyId: DEMO_COMPANY_ID,
        technicianId: selectedTechId,
        offerId: id,
        message: message.trim() || undefined,
      });
      setExistingRequests((prev) => [
        ...prev,
        {
          id: `pending-${selectedTechId}`,
          kind: 'direct_offer',
          companyId: DEMO_COMPANY_ID,
          technicianId: selectedTechId,
          offerId: id,
          status: 'pending',
          identityRevealed: false,
          documentsUnlocked: false,
          message: message.trim() || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      setSelectedTechId(null);
      setMessage('');
      Alert.alert('Offer sent', 'The technician will be notified of your interest.');
    } catch (e: any) {
      Alert.alert('Could not send', e?.message ?? 'An error occurred.');
    } finally {
      setSending(false);
    }
  }

  function pendingRequestForTech(techId: string): boolean {
    return existingRequests.some(
      (r) => r.technicianId === techId && r.status === 'pending',
    );
  }

  function acceptedRequestForTech(techId: string): boolean {
    return existingRequests.some(
      (r) => r.technicianId === techId && r.status === 'accepted',
    );
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Offer Detail' }} />
        <LoadingScreen color={colors.blue} role="company" />
      </>
    );
  }

  if (!offer) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Offer Detail' }} />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Offer not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const selectedTech = selectedTechId
    ? matches.find((m) => m.technician.id === selectedTechId)
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: offer.title }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Offer summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryHeaderLeft}>
              <Text style={[typography.h4, styles.offerTitle]}>{offer.title}</Text>
              <Text style={styles.offerLocation}>
                {offer.locationCity}, {offer.locationCountry}
                {offer.locationBaseAirport ? ` · ${offer.locationBaseAirport}` : ''}
              </Text>
            </View>
            <Badge label={offer.status} variant={statusVariant(offer.status)} />
          </View>

          <Text style={styles.offerDescription}>{offer.description}</Text>

          <View style={styles.metaGrid}>
            <MetaItem icon="📋" label="Contract" value={CONTRACT_LABELS[offer.contractType] ?? offer.contractType} />
            <MetaItem icon="⏱" label="Min. experience" value={`${offer.minYearsExperience} yrs`} />
          </View>

          {offer.requiredTechnicianTypes.length > 0 && (
            <ReqRow label="Technician types" items={offer.requiredTechnicianTypes} />
          )}
          {offer.requiredLicenses.length > 0 && (
            <ReqRow label="Licenses" items={offer.requiredLicenses} />
          )}
          {offer.requiredAircraftTypes.length > 0 && (
            <ReqRow label="Aircraft types" items={offer.requiredAircraftTypes} />
          )}

          {/* Action row */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => router.push(`/company/offers/edit?id=${offer.id}` as any)}
              activeOpacity={0.75}
            >
              <Text style={styles.editBtnText}>Edit offer</Text>
            </TouchableOpacity>
            {offer.status === 'draft' && (
              <TouchableOpacity
                style={[styles.statusBtn, styles.publishBtn, statusChanging && styles.btnDisabled]}
                onPress={handlePublish}
                disabled={statusChanging}
                activeOpacity={0.75}
              >
                {statusChanging
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.statusBtnText}>Publish</Text>}
              </TouchableOpacity>
            )}
            {offer.status === 'published' && (
              <TouchableOpacity
                style={[styles.statusBtn, styles.closeBtn, statusChanging && styles.btnDisabled]}
                onPress={handleClose}
                disabled={statusChanging}
                activeOpacity={0.75}
              >
                {statusChanging
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.statusBtnText}>Close offer</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Ranked technicians */}
        <Text style={styles.sectionTitle}>Technician matches</Text>
        <Text style={styles.sectionSub}>
          Technicians ranked by compatibility for this specific offer.
        </Text>

        {loadingMatches && (
          <View style={styles.matchLoading}>
            <ActivityIndicator color={colors.blue} />
            <Text style={styles.matchLoadingText}>Computing match scores…</Text>
          </View>
        )}

        {!loadingMatches && matches.length === 0 && (
          <View style={styles.emptyMatches}>
            <Text style={styles.emptyMatchesText}>No technicians found in the database.</Text>
          </View>
        )}

        {!loadingMatches && matches.map(({ technician, score }) => {
          const isPending = pendingRequestForTech(technician.id);
          const isAccepted = acceptedRequestForTech(technician.id);
          const accent = scoreColor(score.total);

          return (
            <View key={technician.id} style={[styles.techCard, { borderLeftColor: accent }]}>
              <View style={styles.techCardHeader}>
                <View style={styles.techInfo}>
                  <Text style={styles.techCode}>{technician.anonymousCode}</Text>
                  <Text style={styles.techLocation}>
                    {technician.city}, {technician.country}
                    {technician.baseAirport ? ` · ${technician.baseAirport}` : ''}
                  </Text>
                  {technician.verificationStatus === 'verified' && (
                    <Text style={styles.verifiedBadge}>Verified</Text>
                  )}
                </View>

                <View style={styles.scoreBox}>
                  <Text style={[styles.scorePercent, { color: accent }]}>{score.total}%</Text>
                  <Text style={styles.scoreLabel}>match for this offer</Text>
                  <Text style={[styles.scoreMatchLabel, { color: accent }]}>{score.label}</Text>
                </View>
              </View>

              {/* Score breakdown */}
              <View style={styles.breakdown}>
                <BreakdownItem label="Verified" value={score.breakdown.verified} max={25} />
                <BreakdownItem label="Habilitation" value={score.breakdown.habilitation} max={25} />
                <BreakdownItem label="License" value={score.breakdown.license} max={20} />
                <BreakdownItem label="Availability" value={score.breakdown.availability} max={15} />
                <BreakdownItem label="Experience" value={score.breakdown.experience} max={10} />
                <BreakdownItem label="Location" value={score.breakdown.location} max={5} />
              </View>

              {/* Licenses */}
              {technician.licenses.length > 0 && (
                <View style={styles.licRow}>
                  {technician.licenses.map((l, i) => (
                    <View key={i} style={styles.licChip}>
                      <Text style={styles.licChipText}>{l}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* CTA */}
              {isAccepted ? (
                <View style={[styles.ctaBtn, styles.ctaAccepted]}>
                  <Text style={styles.ctaAcceptedText}>Accepted</Text>
                </View>
              ) : isPending ? (
                <View style={[styles.ctaBtn, styles.ctaPending]}>
                  <Text style={styles.ctaPendingText}>Direct offer sent — pending</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.ctaBtn, styles.ctaSend]}
                  onPress={() => { setSelectedTechId(technician.id); setMessage(''); }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.ctaSendText}>Send direct offer</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Send-offer modal */}
      <Modal
        visible={selectedTechId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTechId(null)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <Text style={modalStyles.title}>Send direct offer</Text>
            {selectedTech && (
              <Text style={modalStyles.techName}>
                {selectedTech.technician.anonymousCode} · {selectedTech.score.total}% match for this offer
              </Text>
            )}
            <Text style={modalStyles.fieldLabel}>Personal message (optional)</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="Add a note to the technician…"
              placeholderTextColor={colors.textMuted}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={modalStyles.actions}>
              <TouchableOpacity
                style={[modalStyles.btn, modalStyles.cancelBtn]}
                onPress={() => setSelectedTechId(null)}
                activeOpacity={0.75}
              >
                <Text style={modalStyles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.btn, modalStyles.confirmBtn, sending && modalStyles.btnDisabled]}
                onPress={handleSendOffer}
                disabled={sending}
                activeOpacity={0.75}
              >
                {sending
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={modalStyles.confirmBtnText}>Send offer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MetaItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={metaStyles.item}>
      <Text style={metaStyles.icon}>{icon}</Text>
      <View>
        <Text style={metaStyles.label}>{label}</Text>
        <Text style={metaStyles.value}>{value}</Text>
      </View>
    </View>
  );
}

function ReqRow({ label, items }: { label: string; items: string[] }) {
  return (
    <View style={reqStyles.row}>
      <Text style={reqStyles.label}>{label}:</Text>
      <View style={reqStyles.pills}>
        {items.map((item, i) => (
          <View key={i} style={reqStyles.pill}>
            <Text style={reqStyles.pillText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function BreakdownItem({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <View style={bdStyles.item}>
      <Text style={bdStyles.label}>{label}</Text>
      <Text style={[bdStyles.value, { color: value > 0 ? colors.success : colors.textMuted }]}>
        {value}/{max}
      </Text>
    </View>
  );
}

const metaStyles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  icon: { fontSize: 16 },
  label: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 13, fontWeight: '600', color: colors.text },
});

const reqStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.xs },
  label: { fontSize: 11, color: colors.textSecondary, fontWeight: '600', paddingTop: 4, minWidth: 100 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, flex: 1 },
  pill: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillText: { fontSize: 11, color: colors.text },
});

const bdStyles = StyleSheet.create({
  item: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  label: { fontSize: 11, color: colors.textSecondary },
  value: { fontSize: 11, fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 480,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  techName: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
    minHeight: 80,
    marginBottom: spacing.md,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  cancelBtn: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  confirmBtn: { backgroundColor: colors.blue },
  btnDisabled: { opacity: 0.6 },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: colors.text },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  contentWide: { maxWidth: 720, alignSelf: 'center', width: '100%' },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontSize: 16, color: colors.textSecondary },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  summaryHeaderLeft: { flex: 1 },
  offerTitle: { marginBottom: 2 },
  offerLocation: { fontSize: 13, color: colors.textSecondary },
  offerDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginVertical: spacing.sm,
  },
  metaGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  editBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  editBtnText: { fontSize: 13, fontWeight: '600', color: colors.text },
  statusBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  publishBtn: { backgroundColor: colors.success },
  closeBtn: { backgroundColor: colors.error },
  btnDisabled: { opacity: 0.6 },
  statusBtnText: { fontSize: 13, fontWeight: '600', color: colors.white },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  matchLoading: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  matchLoadingText: { fontSize: 13, color: colors.textSecondary },
  emptyMatches: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyMatchesText: { fontSize: 13, color: colors.textSecondary },
  techCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    marginBottom: spacing.sm,
  },
  techCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  techInfo: { flex: 1 },
  techCode: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  techLocation: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  verifiedBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scoreBox: {
    alignItems: 'flex-end',
    flexShrink: 0,
    paddingLeft: spacing.sm,
  },
  scorePercent: { fontSize: 26, fontWeight: '800', lineHeight: 30 },
  scoreLabel: { fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  scoreMatchLabel: { fontSize: 10, fontWeight: '700', marginTop: 1 },
  breakdown: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  licRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  licChip: {
    backgroundColor: colors.navyLight + '15',
    borderWidth: 1,
    borderColor: colors.navyLight + '40',
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  licChipText: { fontSize: 11, color: colors.navy, fontWeight: '600' },
  ctaBtn: {
    paddingVertical: spacing.sm,
    borderRadius: 10,
    alignItems: 'center',
  },
  ctaSend: { backgroundColor: colors.blue },
  ctaPending: { backgroundColor: colors.warning + '20', borderWidth: 1, borderColor: colors.warning },
  ctaAccepted: { backgroundColor: colors.success + '20', borderWidth: 1, borderColor: colors.success },
  ctaSendText: { fontSize: 13, fontWeight: '700', color: colors.white },
  ctaPendingText: { fontSize: 13, fontWeight: '600', color: colors.warning },
  ctaAcceptedText: { fontSize: 13, fontWeight: '600', color: colors.success },
});
