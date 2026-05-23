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
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { colors, spacing, typography } from '../../../src/theme';
import { LoadingScreen } from '../../../src/components/LoadingScreen';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { offerApplicationRepository } from '../../../src/repositories/v2/offerApplicationRepository';
import { companyRepositoryV2 } from '../../../src/repositories/v2/companyRepositoryV2';
import { technicianRepositoryV2 } from '../../../src/repositories/v2/technicianRepositoryV2';
import { chatRepository } from '../../../src/repositories/v2/chatRepository';
import { activityRepository } from '../../../src/repositories/v2/activityRepository';
import { calculateOfferTechnicianMatch } from '../../../src/utils/matchingV2';
import { DEMO_TECHNICIAN_ID } from '../../../src/state/useTechnicianDashboard';
import { OfferWithRequirements } from '../../../src/types/offer';
import { CompanyProfile } from '../../../src/types/company';
import { MatchScore } from '../../../src/types/matching';
import { OfferApplication } from '../../../src/types/offerRequest';
import { ChatRoom } from '../../../src/types/chat';

const CONTRACT_LABELS: Record<string, string> = {
  permanent: 'Permanent',
  long_term: 'Long-term',
  short_term: 'Short-term',
};

const COMPANY_TYPE_LABELS: Record<string, string> = {
  MRO: 'MRO',
  airline: 'Airline',
  recruitment_agency: 'Recruitment Agency',
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
    case 'pending': return { label: 'Application sent — pending review', color: colors.warning };
    case 'accepted': return { label: 'Accepted', color: colors.success };
    case 'rejected': return { label: 'Not selected', color: colors.error };
    case 'expired': return { label: 'Offer expired', color: colors.textMuted };
    case 'withdrawn': return { label: 'Withdrawn', color: colors.textMuted };
    default: return { label: status, color: colors.textMuted };
  }
}

export default function OfferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [offer, setOffer] = useState<OfferWithRequirements | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [score, setScore] = useState<MatchScore | null>(null);
  const [existingApp, setExistingApp] = useState<OfferApplication | null>(null);
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [loading, setLoading] = useState(true);

  // Apply modal
  const [modalVisible, setModalVisible] = useState(false);
  const [coverNote, setCoverNote] = useState('');
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const o = await offerRepository.getWithRequirements(id);
    if (!o) return;
    setOffer(o);

    const [c, techWithRelations, apps] = await Promise.all([
      companyRepositoryV2.getById(o.companyId),
      technicianRepositoryV2.getWithRelations(DEMO_TECHNICIAN_ID),
      offerApplicationRepository.getForTechnician(DEMO_TECHNICIAN_ID),
    ]);

    setCompany(c);

    if (techWithRelations) {
      const matchScore = calculateOfferTechnicianMatch(o, techWithRelations);
      setScore(matchScore);
    }

    const app = apps.find((a) => a.offerId === id) ?? null;
    setExistingApp(app);

    if (app) {
      await activityRepository.markRead('technician', DEMO_TECHNICIAN_ID, app.id);
    }

    if (app && app.status === 'accepted') {
      const rooms = await chatRepository.getRoomsForTechnician(DEMO_TECHNICIAN_ID);
      setChatRoom(rooms.find((r) => r.offerApplicationId === app.id) ?? null);
    } else {
      setChatRoom(null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      load().finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [load]),
  );

  async function handleApply() {
    if (!offer) return;
    setApplying(true);
    try {
      const app = await offerApplicationRepository.create({
        technicianId: DEMO_TECHNICIAN_ID,
        offerId: offer.id,
        companyId: offer.companyId,
        coverNote: coverNote.trim() || undefined,
      });
      setExistingApp(app);
      setModalVisible(false);
      setCoverNote('');
      Alert.alert('Application sent', 'The company will be notified of your application.');
    } catch (e: any) {
      Alert.alert('Could not apply', e?.message ?? 'An error occurred.');
    } finally {
      setApplying(false);
    }
  }

  async function handleWithdraw() {
    if (!existingApp) return;
    Alert.alert('Withdraw application?', 'You can apply again later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          try {
            await offerApplicationRepository.withdraw(existingApp.id, DEMO_TECHNICIAN_ID);
            await load();
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not withdraw.');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Offer Detail' }} />
        <LoadingScreen color={colors.technician} role="technician" />
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

  const accent = score ? scoreColor(score.total) : colors.technician;
  const canApply = !existingApp || existingApp.status === 'withdrawn' || existingApp.status === 'expired';
  const activeApp = existingApp && existingApp.status !== 'withdrawn' && existingApp.status !== 'expired';

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: offer.title }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        {/* Score hero */}
        {score && (
          <View style={[styles.scoreCard, { borderColor: accent }]}>
            <Text style={[styles.scoreHeroPercent, { color: accent }]}>{score.total}%</Text>
            <Text style={styles.scoreHeroLabel}>match with your profile</Text>
            <Text style={[styles.scoreHeroMatchLabel, { color: accent }]}>{score.label}</Text>
          </View>
        )}

        {/* Offer summary */}
        <View style={styles.summaryCard}>
          <Text style={[typography.h4, styles.offerTitle]}>{offer.title}</Text>
          {company && (
            <Text style={styles.companyName}>
              {company.name}
              {company.companyType
                ? ` · ${COMPANY_TYPE_LABELS[company.companyType] ?? company.companyType}`
                : ''}
            </Text>
          )}
          <Text style={styles.location}>
            {offer.locationCity}, {offer.locationCountry}
            {offer.locationBaseAirport ? ` · ${offer.locationBaseAirport}` : ''}
          </Text>

          <Text style={styles.description}>{offer.description}</Text>

          <View style={styles.metaGrid}>
            <InfoItem icon="📋" label="Contract" value={CONTRACT_LABELS[offer.contractType] ?? offer.contractType} />
            <InfoItem icon="⏱" label="Min. experience" value={`${offer.minYearsExperience} yrs`} />
          </View>
        </View>

        {/* Requirements */}
        {(offer.requiredTechnicianTypes.length > 0 ||
          offer.requiredLicenses.length > 0 ||
          offer.requiredAircraftTypes.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Requirements</Text>
            {offer.requiredTechnicianTypes.length > 0 && (
              <ReqRow label="Technician types" items={offer.requiredTechnicianTypes} />
            )}
            {offer.requiredLicenses.length > 0 && (
              <ReqRow label="Licenses" items={offer.requiredLicenses} />
            )}
            {offer.requiredAircraftTypes.length > 0 && (
              <ReqRow label="Aircraft types" items={offer.requiredAircraftTypes} />
            )}
          </View>
        )}

        {/* Score breakdown */}
        {score && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Match breakdown</Text>
            <Text style={styles.sectionSub}>
              How your profile scores against this offer's criteria.
            </Text>
            <View style={styles.breakdown}>
              <BreakdownRow label="Verified" value={score.breakdown.verified} max={25} accent={accent} />
              <BreakdownRow label="Habilitation" value={score.breakdown.habilitation} max={25} accent={accent} />
              <BreakdownRow label="License" value={score.breakdown.license} max={20} accent={accent} />
              <BreakdownRow label="Availability" value={score.breakdown.availability} max={15} accent={accent} />
              <BreakdownRow label="Experience" value={score.breakdown.experience} max={10} accent={accent} />
              <BreakdownRow label="Location" value={score.breakdown.location} max={5} accent={accent} />
            </View>
          </View>
        )}

        {/* Application CTA / status */}
        {activeApp ? (
          <View style={styles.appStatusBlock}>
            <View style={[styles.appStatusPill, { borderColor: appStatusInfo(existingApp!.status).color + '60' }]}>
              <Text style={[styles.appStatusText, { color: appStatusInfo(existingApp!.status).color }]}>
                {appStatusInfo(existingApp!.status).label}
              </Text>
            </View>
            {existingApp!.status === 'pending' && (
              <TouchableOpacity style={styles.withdrawBtn} onPress={handleWithdraw} activeOpacity={0.75}>
                <Text style={styles.withdrawBtnText}>Withdraw application</Text>
              </TouchableOpacity>
            )}
            {existingApp!.status === 'accepted' && (
              <>
                <Text style={styles.acceptedNote}>
                  The company will contact you directly. Your identity and documents are now accessible to them.
                </Text>
                {chatRoom && (
                  <TouchableOpacity
                    style={styles.chatBtn}
                    onPress={() => router.push(`/technician/chats/${chatRoom.id}` as any)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.chatBtnText}>Open chat →</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.applyBtn}
            onPress={() => { setCoverNote(''); setModalVisible(true); }}
            activeOpacity={0.75}
          >
            <Text style={styles.applyBtnText}>Apply to this offer</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Apply modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <Text style={modalStyles.title}>Apply to offer</Text>
            <Text style={modalStyles.offerName} numberOfLines={2}>{offer.title}</Text>

            <Text style={modalStyles.fieldLabel}>Cover note (optional)</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="Add a short note to the company…"
              placeholderTextColor={colors.textMuted}
              value={coverNote}
              onChangeText={setCoverNote}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <Text style={modalStyles.privacyNote}>
              Your identity will remain anonymous until the company accepts your application.
            </Text>

            <View style={modalStyles.actions}>
              <TouchableOpacity
                style={[modalStyles.btn, modalStyles.cancelBtn]}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.75}
              >
                <Text style={modalStyles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.btn, modalStyles.confirmBtn, applying && modalStyles.btnDisabled]}
                onPress={handleApply}
                disabled={applying}
                activeOpacity={0.75}
              >
                {applying
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={modalStyles.confirmBtnText}>Send application</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function InfoItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={infoStyles.item}>
      <Text style={infoStyles.icon}>{icon}</Text>
      <View>
        <Text style={infoStyles.label}>{label}</Text>
        <Text style={infoStyles.value}>{value}</Text>
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

function BreakdownRow({
  label,
  value,
  max,
  accent,
}: {
  label: string;
  value: number;
  max: number;
  accent: string;
}) {
  const pct = max > 0 ? value / max : 0;
  return (
    <View style={bdStyles.row}>
      <Text style={bdStyles.label}>{label}</Text>
      <View style={bdStyles.barBg}>
        <View style={[bdStyles.barFill, { width: `${pct * 100}%` as any, backgroundColor: value > 0 ? accent : colors.borderLight }]} />
      </View>
      <Text style={[bdStyles.score, { color: value > 0 ? accent : colors.textMuted }]}>
        {value}/{max}
      </Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  icon: { fontSize: 16 },
  label: { fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 13, fontWeight: '600', color: colors.text },
});

const reqStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  label: { fontSize: 11, color: colors.textSecondary, fontWeight: '600', paddingTop: 4, minWidth: 110 },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  label: { fontSize: 12, color: colors.textSecondary, width: 90 },
  barBg: { flex: 1, height: 6, backgroundColor: colors.borderLight, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  score: { fontSize: 11, fontWeight: '700', width: 36, textAlign: 'right' },
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
  offerName: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md },
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
    minHeight: 96,
    marginBottom: spacing.sm,
  },
  privacyNote: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: spacing.md,
    fontStyle: 'italic',
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
  confirmBtn: { backgroundColor: colors.technician },
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
  scoreCard: {
    borderWidth: 2,
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  scoreHeroPercent: { fontSize: 48, fontWeight: '800', lineHeight: 56 },
  scoreHeroLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  scoreHeroMatchLabel: { fontSize: 14, fontWeight: '700', marginTop: spacing.xs },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  offerTitle: { marginBottom: spacing.xs },
  companyName: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 2 },
  location: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  metaGrid: { flexDirection: 'row', gap: spacing.md },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  sectionSub: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.md, marginTop: -spacing.xs },
  breakdown: {},
  appStatusBlock: { marginBottom: spacing.md },
  appStatusPill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  appStatusText: { fontSize: 14, fontWeight: '700' },
  withdrawBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  withdrawBtnText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  acceptedNote: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.sm,
  },
  applyBtn: {
    backgroundColor: colors.technician,
    borderRadius: 14,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  applyBtnText: { fontSize: 16, fontWeight: '700', color: colors.white },
  chatBtn: {
    backgroundColor: colors.technician,
    borderRadius: 12,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center' as const,
    marginTop: spacing.sm,
  },
  chatBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
});
