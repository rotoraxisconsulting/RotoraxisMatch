import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { colors, spacing, typography } from '../../../src/theme';
import { LoadingScreen } from '../../../src/components/LoadingScreen';
import { Badge } from '../../../src/components/Badge';
import { offerRequestRepository } from '../../../src/repositories/v2/offerRequestRepository';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { companyRepositoryV2 } from '../../../src/repositories/v2/companyRepositoryV2';
import { technicianRepositoryV2 } from '../../../src/repositories/v2/technicianRepositoryV2';
import { chatRepository } from '../../../src/repositories/v2/chatRepository';
import { activityRepository } from '../../../src/repositories/v2/activityRepository';
import { calculateOfferTechnicianMatch } from '../../../src/utils/matchingV2';
import { DEMO_TECHNICIAN_ID } from '../../../src/state/useTechnicianDashboard';
import { OfferRequest } from '../../../src/types/offerRequest';
import { OfferWithRequirements } from '../../../src/types/offer';
import { CompanyProfile } from '../../../src/types/company';
import { MatchScore } from '../../../src/types/matching';
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function DirectOfferDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [request, setRequest] = useState<OfferRequest | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [offer, setOffer] = useState<OfferWithRequirements | null>(null);
  const [score, setScore] = useState<MatchScore | null>(null);
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'accept' | 'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const req = await offerRequestRepository.getById(id);
    if (!req) return;
    setRequest(req);

    const [co, off, techWithRelations] = await Promise.all([
      companyRepositoryV2.getById(req.companyId),
      req.offerId ? offerRepository.getWithRequirements(req.offerId) : Promise.resolve(null),
      technicianRepositoryV2.getWithRelations(DEMO_TECHNICIAN_ID),
    ]);

    setCompany(co);
    setOffer(off);

    if (off && techWithRelations) {
      setScore(calculateOfferTechnicianMatch(off, techWithRelations));
    } else {
      setScore(null);
    }

    if (req.status === 'accepted') {
      const rooms = await chatRepository.getRoomsForTechnician(DEMO_TECHNICIAN_ID);
      setChatRoom(rooms.find((r) => r.offerRequestId === id) ?? null);
    } else {
      setChatRoom(null);
    }

    await activityRepository.markRead('technician', DEMO_TECHNICIAN_ID, id);
  }, [id]);

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

  function handleAccept() {
    if (!id) return;
    setActionError(null);
    setConfirmAction('accept');
  }

  function handleReject() {
    if (!id) return;
    setActionError(null);
    setConfirmAction('reject');
  }

  async function doConfirmAction() {
    if (!id || !confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    setActioning(true);
    setActionError(null);
    try {
      const result = await offerRequestRepository.updateStatus(
        id,
        action === 'accept' ? 'accepted' : 'rejected',
      );
      if (result === null) {
        setActionError('Could not update offer status. Please try again.');
        return;
      }
      await load();
    } catch (e: any) {
      setActionError(e?.message ?? 'An error occurred. Please try again.');
    } finally {
      setActioning(false);
    }
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Direct Offer' }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  if (!request || !company) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Direct Offer' }} />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Offer not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const accent = score ? scoreColor(score.total) : colors.technician;
  const isPending = request.status === 'pending';
  const isAccepted = request.status === 'accepted';

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: offer?.title ?? 'Direct Offer' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Match score hero — only if linked offer */}
        {score && (
          <View style={[styles.scoreCard, { borderColor: accent }]}>
            <Text style={[styles.scoreValue, { color: accent }]}>{score.total}%</Text>
            <Text style={styles.scoreLabel}>match with your profile</Text>
            <Text style={[styles.scoreMatchLabel, { color: accent }]}>{score.label}</Text>
          </View>
        )}

        {/* Company section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Company</Text>
          <View style={styles.companyRow}>
            <View style={styles.companyAvatar}>
              <Text style={styles.companyAvatarText}>
                {company.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.companyInfo}>
              <Text style={styles.companyName}>{company.name}</Text>
              {company.companyType && (
                <Text style={styles.companyType}>
                  {COMPANY_TYPE_LABELS[company.companyType] ?? company.companyType}
                </Text>
              )}
              <Text style={styles.companyLocation}>
                {company.city}, {company.country}
              </Text>
            </View>
            <Badge
              label={company.verificationStatus}
              variant={company.verificationStatus === 'verified' ? 'success' : 'warning'}
              small
            />
          </View>
        </View>

        {/* Offer section — only if linked */}
        {offer && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Linked Offer</Text>
            <Text style={styles.offerTitle}>{offer.title}</Text>
            <Text style={styles.offerLocation}>
              {offer.locationCity}, {offer.locationCountry}
              {offer.locationBaseAirport ? ` · ${offer.locationBaseAirport}` : ''}
            </Text>
            <Text style={styles.offerDescription}>{offer.description}</Text>
            <View style={styles.offerMeta}>
              <View style={styles.offerMetaChip}>
                <Text style={styles.offerMetaLabel}>Contract</Text>
                <Text style={styles.offerMetaValue}>
                  {CONTRACT_LABELS[offer.contractType] ?? offer.contractType}
                </Text>
              </View>
              <View style={styles.offerMetaChip}>
                <Text style={styles.offerMetaLabel}>Min. experience</Text>
                <Text style={styles.offerMetaValue}>{offer.minYearsExperience} yrs</Text>
              </View>
            </View>

            {/* Requirements */}
            {(offer.requiredTechnicianTypes.length > 0 ||
              offer.requiredLicenses.length > 0 ||
              offer.requiredAircraftTypes.length > 0) && (
              <View style={styles.reqBlock}>
                {offer.requiredTechnicianTypes.length > 0 && (
                  <ReqRow label="Types" items={offer.requiredTechnicianTypes} />
                )}
                {offer.requiredLicenses.length > 0 && (
                  <ReqRow label="Licenses" items={offer.requiredLicenses} />
                )}
                {offer.requiredAircraftTypes.length > 0 && (
                  <ReqRow label="Aircraft" items={offer.requiredAircraftTypes} />
                )}
              </View>
            )}

            {/* Score breakdown */}
            {score && (
              <View style={styles.breakdownBlock}>
                <Text style={styles.breakdownTitle}>Match breakdown</Text>
                <BreakdownRow label="Verified" value={score.breakdown.verified} max={25} accent={accent} />
                <BreakdownRow label="Habilitation" value={score.breakdown.habilitation} max={25} accent={accent} />
                <BreakdownRow label="License" value={score.breakdown.license} max={20} accent={accent} />
                <BreakdownRow label="Availability" value={score.breakdown.availability} max={15} accent={accent} />
                <BreakdownRow label="Experience" value={score.breakdown.experience} max={10} accent={accent} />
                <BreakdownRow label="Location" value={score.breakdown.location} max={5} accent={accent} />
              </View>
            )}
          </View>
        )}

        {/* Company message */}
        {request.message && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Message from company</Text>
            <Text style={styles.messageText}>"{request.message}"</Text>
          </View>
        )}

        {/* Status + dates */}
        <View style={styles.section}>
          <View style={styles.statusRow}>
            <Text style={styles.sectionTitle}>Status</Text>
            <StatusBadge status={request.status} />
          </View>
          <Text style={styles.dateText}>Received {formatDate(request.createdAt)}</Text>
          {request.updatedAt !== request.createdAt && (
            <Text style={styles.dateText}>Updated {formatDate(request.updatedAt)}</Text>
          )}
        </View>

        {/* Inline error */}
        {actionError && (
          <View style={styles.errorNote}>
            <Text style={styles.errorNoteText}>{actionError}</Text>
          </View>
        )}

        {/* Actions — pending */}
        {isPending && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn, actioning && styles.btnDisabled]}
              onPress={handleReject}
              disabled={actioning}
              activeOpacity={0.75}
            >
              {actioning ? (
                <ActivityIndicator color={colors.error} size="small" />
              ) : (
                <Text style={styles.rejectBtnText}>Decline</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn, actioning && styles.btnDisabled]}
              onPress={handleAccept}
              disabled={actioning}
              activeOpacity={0.75}
            >
              {actioning ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.acceptBtnText}>Accept offer</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Accepted state */}
        {isAccepted && (
          <View style={styles.acceptedNote}>
            <Text style={styles.acceptedNoteTitle}>Offer accepted</Text>
            <Text style={styles.acceptedNoteSub}>
              The company can now see your full identity and documents. A chat room is available for direct communication.
            </Text>
            {chatRoom && (
              <TouchableOpacity
                style={styles.chatBtn}
                onPress={() =>
                  router.push(`/technician/chats/${chatRoom.id}` as any)
                }
                activeOpacity={0.75}
              >
                <Text style={styles.chatBtnText}>Open chat →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Rejected state */}
        {request.status === 'rejected' && (
          <View style={styles.rejectedNote}>
            <Text style={styles.rejectedNoteTitle}>Offer declined</Text>
            <Text style={styles.rejectedNoteSub}>
              You declined this offer. Your identity and documents remain private.
            </Text>
          </View>
        )}

        {/* Expired / withdrawn states */}
        {(request.status === 'expired' || request.status === 'withdrawn') && (
          <View style={styles.inactiveNote}>
            <Text style={styles.inactiveNoteText}>
              {request.status === 'expired'
                ? 'This offer has expired and is no longer active.'
                : 'This offer was withdrawn by the company.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Confirmation modal */}
      <Modal
        visible={confirmAction !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmAction(null)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.card}>
            <Text style={modalStyles.title}>
              {confirmAction === 'accept' ? 'Accept direct offer?' : 'Reject direct offer?'}
            </Text>
            <Text style={modalStyles.body}>
              {confirmAction === 'accept'
                ? 'This will unlock your identity and documents for the company and open a chat.'
                : 'The company will be notified. Your identity and documents will remain locked.'}
            </Text>
            <TouchableOpacity
              style={[
                modalStyles.confirmBtn,
                confirmAction === 'reject' && modalStyles.confirmBtnDestructive,
              ]}
              onPress={doConfirmAction}
              activeOpacity={0.75}
            >
              <Text style={modalStyles.confirmBtnText}>
                {confirmAction === 'accept' ? 'Confirm accept' : 'Confirm reject'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={modalStyles.cancelBtn}
              onPress={() => setConfirmAction(null)}
              activeOpacity={0.75}
            >
              <Text style={modalStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
        <View
          style={[
            bdStyles.barFill,
            {
              width: `${pct * 100}%` as any,
              backgroundColor: value > 0 ? accent : colors.borderLight,
            },
          ]}
        />
      </View>
      <Text style={[bdStyles.score, { color: value > 0 ? accent : colors.textMuted }]}>
        {value}/{max}
      </Text>
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  type V = 'success' | 'warning' | 'error' | 'navy';
  const map: Record<string, { label: string; variant: V }> = {
    pending: { label: 'Pending', variant: 'warning' },
    accepted: { label: 'Accepted', variant: 'success' },
    rejected: { label: 'Declined', variant: 'error' },
    expired: { label: 'Expired', variant: 'navy' },
    withdrawn: { label: 'Withdrawn', variant: 'navy' },
  };
  const info = map[status] ?? { label: status, variant: 'navy' as V };
  return <Badge label={info.label} variant={info.variant} />;
}

const reqStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
    paddingTop: 3,
    minWidth: 60,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, flex: 1 },
  pill: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillText: { fontSize: 10, color: colors.text },
});

const bdStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  label: { fontSize: 11, color: colors.textSecondary, width: 80 },
  barBg: {
    flex: 1,
    height: 5,
    backgroundColor: colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },
  score: { fontSize: 10, fontWeight: '700', width: 32, textAlign: 'right' },
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
  scoreValue: { fontSize: 52, fontWeight: '800', lineHeight: 60 },
  scoreLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  scoreMatchLabel: { fontSize: 14, fontWeight: '700', marginTop: spacing.xs },

  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },

  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  companyAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  companyAvatarText: { fontSize: 18, fontWeight: '700', color: colors.white },
  companyInfo: { flex: 1 },
  companyName: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 1 },
  companyType: { fontSize: 12, color: colors.textSecondary, marginBottom: 1 },
  companyLocation: { fontSize: 12, color: colors.textMuted },

  offerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  offerLocation: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs },
  offerDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  offerMeta: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  offerMetaChip: {},
  offerMetaLabel: {
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  offerMetaValue: { fontSize: 13, fontWeight: '600', color: colors.text },

  reqBlock: { marginTop: spacing.xs },
  breakdownBlock: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight },
  breakdownTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },

  messageText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
  },

  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  dateText: { fontSize: 12, color: colors.textMuted },

  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: { backgroundColor: colors.success },
  rejectBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.error,
  },
  btnDisabled: { opacity: 0.6 },
  acceptBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: colors.error },

  acceptedNote: {
    backgroundColor: colors.success + '10',
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.success + '30',
    marginBottom: spacing.md,
  },
  acceptedNoteTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
    marginBottom: 4,
  },
  acceptedNoteSub: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  chatBtn: {
    backgroundColor: colors.technician,
    borderRadius: 10,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  chatBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },

  rejectedNote: {
    backgroundColor: colors.error + '08',
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.error + '25',
    marginBottom: spacing.md,
  },
  rejectedNoteTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.error,
    marginBottom: 4,
  },
  rejectedNoteSub: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },

  inactiveNote: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  inactiveNoteText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorNote: {
    backgroundColor: colors.error + '10',
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.error + '30',
    marginBottom: spacing.md,
  },
  errorNoteText: { fontSize: 13, color: colors.error, lineHeight: 18 },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  confirmBtn: {
    backgroundColor: colors.success,
    borderRadius: 10,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  confirmBtnDestructive: { backgroundColor: colors.error },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  cancelBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  cancelBtnText: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
});
