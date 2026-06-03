import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { colors, spacing } from '../../../src/theme';
import { LoadingScreen } from '../../../src/components/LoadingScreen';
import { InlineScore } from '../../../src/components/InlineScore';
import { Button } from '../../../src/components/Button';
import {
  EmptyPanel,
  InitialAvatar,
  TechnicianBadge,
  TechnicianCard,
  TechnicianChip,
  TechnicianPageHeader,
  TechnicianScreen,
  techStyles,
  techUi,
} from '../../../src/components/technician/TechnicianUI';
import { offerRequestRepository } from '../../../src/repositories/v2/offerRequestRepository';
import { isOfferOpenForTechnicians, offerRepository } from '../../../src/repositories/v2/offerRepository';
import { companyRepositoryV2 } from '../../../src/repositories/v2/companyRepositoryV2';
import { technicianRepositoryV2 } from '../../../src/repositories/v2/technicianRepositoryV2';
import { chatRepository } from '../../../src/repositories/v2/chatRepository';
import { activityRepository } from '../../../src/repositories/v2/activityRepository';
import { calculateOfferTechnicianMatch } from '../../../src/utils/matchingV2';
import { useTechnicianSession } from '../../../src/state/SessionContext';
import { OfferRequest } from '../../../src/types/offerRequest';
import { OfferWithRequirements } from '../../../src/types/offer';
import { CompanyProfileView } from '../../../src/types/company';
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

function statusTone(status: string): 'success' | 'warning' | 'error' | 'muted' {
  if (status === 'accepted') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'rejected') return 'error';
  return 'muted';
}

function statusLabel(status: string): string {
  if (status === 'pending') return 'Pending';
  if (status === 'accepted') return 'Accepted';
  if (status === 'rejected') return 'Declined';
  if (status === 'expired') return 'Expired';
  if (status === 'withdrawn') return 'Withdrawn';
  return status;
}

export default function DirectOfferDetailScreen() {
  const { technicianId } = useTechnicianSession();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [request, setRequest] = useState<OfferRequest | null>(null);
  const [company, setCompany] = useState<CompanyProfileView | null>(null);
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
      technicianRepositoryV2.getWithRelations(technicianId),
    ]);

    setCompany(co);
    setOffer(off);

    // Compute score when offer is active, or when the direct offer is accepted (historical context).
    const offerActive = isOfferOpenForTechnicians(off);
    if (off && (offerActive || req.status === 'accepted') && techWithRelations) {
      setScore(calculateOfferTechnicianMatch(off, techWithRelations));
    } else {
      setScore(null);
    }

    if (req.status === 'accepted') {
      const rooms = await chatRepository.getRoomsForTechnician(technicianId);
      setChatRoom(rooms.find((r) => r.offerRequestId === id) ?? null);
    } else {
      setChatRoom(null);
    }

    await activityRepository.markRead('technician', technicianId, id);
  }, [id, technicianId]);

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
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  if (!request || !company) {
    return (
      <TechnicianScreen>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.notFound}>
          <EmptyPanel title="Offer not found" subtitle="This direct offer is no longer available." />
        </View>
      </TechnicianScreen>
    );
  }

  const accent = score ? scoreColor(score.total) : colors.technician;
  const isPending = request.status === 'pending';
  const isAccepted = request.status === 'accepted';
  // Only relevant for pending: shows "Offer closed" banner and disables Accept.
  // Accepted/rejected/historical records are not affected by the linked offer's status.
  const linkedOfferUnavailable = isPending && Boolean(request.offerId && !isOfferOpenForTechnicians(offer));
  // Show offer details when active, or when accepted (historical context after offer closes).
  const visibleOffer = offer && (isOfferOpenForTechnicians(offer) || isAccepted) ? offer : null;

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
          eyebrow="Direct offer"
          title={visibleOffer?.title ?? 'Direct offer'}
          subtitle={`${company.name} - received ${formatDate(request.createdAt)}`}
          onBack={() => router.back()}
          right={<TechnicianBadge label={statusLabel(request.status)} tone={statusTone(request.status)} />}
        />

        <TechnicianCard style={styles.section}>
          <View style={styles.companyRow}>
            <InitialAvatar label={company.name} size={46} />
            <View style={styles.companyInfo}>
              <Text style={styles.companyName}>{company.name}</Text>
              <Text style={styles.companyType}>
                {company.companyType ? COMPANY_TYPE_LABELS[company.companyType] ?? company.companyType : 'Company'}
              </Text>
              <Text style={styles.companyLocation}>{company.city}, {company.country}</Text>
            </View>
            <TechnicianBadge
              label={company.verificationStatus}
              tone={company.verificationStatus === 'verified' ? 'success' : 'warning'}
              small
            />
          </View>
        </TechnicianCard>

        {visibleOffer && (
          <TechnicianCard style={styles.section}>
            {score && <InlineScore score={score.total} quality={score.label} context="match with your profile" />}
            <Text style={styles.offerTitle}>{visibleOffer.title}</Text>
            <Text style={styles.offerLocation}>
              {visibleOffer.locationCity}, {visibleOffer.locationCountry}
              {visibleOffer.locationBaseAirport ? ` - ${visibleOffer.locationBaseAirport}` : ''}
            </Text>
            <Text style={styles.offerDescription}>{visibleOffer.description}</Text>

            <View style={styles.badgeRow}>
              <TechnicianBadge label={CONTRACT_LABELS[visibleOffer.contractType] ?? visibleOffer.contractType} tone="muted" />
              <TechnicianBadge label={`${visibleOffer.minYearsExperience} yrs min`} tone="muted" />
            </View>

            {(visibleOffer.requiredTechnicianTypes.length > 0 ||
              visibleOffer.requiredLicenses.length > 0 ||
              visibleOffer.requiredAircraftTypes.length > 0) && (
              <View style={styles.reqBlock}>
                {visibleOffer.requiredTechnicianTypes.length > 0 && <ReqRow label="Types" items={visibleOffer.requiredTechnicianTypes} />}
                {visibleOffer.requiredLicenses.length > 0 && <ReqRow label="Licenses" items={visibleOffer.requiredLicenses} />}
                {visibleOffer.requiredAircraftTypes.length > 0 && <ReqRow label="Aircraft" items={visibleOffer.requiredAircraftTypes} />}
              </View>
            )}

            {score && (
              <View style={styles.breakdownBlock}>
                <Text style={styles.sectionTitle}>Match breakdown</Text>
                <BreakdownRow label="Verified" value={score.breakdown.verified} max={25} accent={accent} />
                <BreakdownRow label="Habilitation" value={score.breakdown.habilitation} max={25} accent={accent} />
                <BreakdownRow label="License" value={score.breakdown.license} max={20} accent={accent} />
                <BreakdownRow label="Availability" value={score.breakdown.availability} max={15} accent={accent} />
                <BreakdownRow label="Experience" value={score.breakdown.experience} max={10} accent={accent} />
                <BreakdownRow label="Location" value={score.breakdown.location} max={5} accent={accent} />
              </View>
            )}
          </TechnicianCard>
        )}

        {linkedOfferUnavailable && (
          <TechnicianCard style={styles.inactiveNote}>
            <Text style={styles.noteTitle}>Offer closed</Text>
            <Text style={styles.noteSub}>
              This offer is no longer active and cannot be accepted.
            </Text>
          </TechnicianCard>
        )}

        {request.message && (
          <TechnicianCard style={styles.section}>
            <Text style={styles.sectionTitle}>Message from company</Text>
            <Text style={styles.messageText}>"{request.message}"</Text>
          </TechnicianCard>
        )}

        <TechnicianCard style={styles.section}>
          <Text style={styles.sectionTitle}>Status</Text>
          <TechnicianBadge label={statusLabel(request.status)} tone={statusTone(request.status)} />
          <Text style={styles.dateText}>Received {formatDate(request.createdAt)}</Text>
          {request.updatedAt !== request.createdAt && (
            <Text style={styles.dateText}>Updated {formatDate(request.updatedAt)}</Text>
          )}
        </TechnicianCard>

        {actionError && (
          <View style={styles.errorNote}>
            <Text style={styles.errorNoteText}>{actionError}</Text>
          </View>
        )}

        {isPending && !linkedOfferUnavailable && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn, actioning && styles.btnDisabled]}
              onPress={handleReject}
              disabled={actioning}
              activeOpacity={0.75}
            >
              {actioning ? <ActivityIndicator color={techUi.red} size="small" /> : <Text style={styles.rejectBtnText}>Decline</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn, actioning && styles.btnDisabled]}
              onPress={handleAccept}
              disabled={actioning}
              activeOpacity={0.75}
            >
              {actioning ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.acceptBtnText}>Accept offer</Text>}
            </TouchableOpacity>
          </View>
        )}

        {isAccepted && (
          <TechnicianCard style={styles.acceptedNote}>
            <Text style={styles.noteTitle}>Offer accepted</Text>
            <Text style={styles.noteSub}>
              The company can now see your full identity and admin-verified documents. A chat room is available for direct communication.
            </Text>
            {chatRoom && (
              <Button label="Open chat" onPress={() => router.push(`/technician/chats/${chatRoom.id}` as any)} fullWidth />
            )}
          </TechnicianCard>
        )}

        {request.status === 'rejected' && (
          <TechnicianCard style={styles.rejectedNote}>
            <Text style={styles.noteTitle}>Offer declined</Text>
            <Text style={styles.noteSub}>Your identity and documents remain private.</Text>
          </TechnicianCard>
        )}

        {(request.status === 'expired' || request.status === 'withdrawn') && (
          <TechnicianCard style={styles.inactiveNote}>
            <Text style={styles.noteSub}>
              {request.status === 'expired'
                ? 'This offer has expired and is no longer active.'
                : 'This offer was withdrawn by the company.'}
            </Text>
          </TechnicianCard>
        )}
      </ScrollView>

      <Modal visible={confirmAction !== null} transparent animationType="fade" onRequestClose={() => setConfirmAction(null)}>
        <View style={modalStyles.overlay}>
          <TechnicianCard style={modalStyles.card}>
            <Text style={modalStyles.title}>
              {confirmAction === 'accept' ? 'Accept direct offer?' : 'Reject direct offer?'}
            </Text>
            <Text style={modalStyles.body}>
              {confirmAction === 'accept'
                ? 'This will unlock your identity and admin-verified documents for the company and open a chat.'
                : 'The company will be notified. Your identity and documents will remain locked.'}
            </Text>
            <TouchableOpacity
              style={[modalStyles.confirmBtn, confirmAction === 'reject' && modalStyles.confirmBtnDestructive]}
              onPress={doConfirmAction}
              activeOpacity={0.75}
            >
              <Text style={modalStyles.confirmBtnText}>
                {confirmAction === 'accept' ? 'Confirm accept' : 'Confirm reject'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={() => setConfirmAction(null)} activeOpacity={0.75}>
              <Text style={modalStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </TechnicianCard>
        </View>
      </Modal>
    </TechnicianScreen>
  );
}

function ReqRow({ label, items }: { label: string; items: string[] }) {
  return (
    <View style={styles.reqRow}>
      <Text style={styles.reqLabel}>{label}</Text>
      <View style={styles.reqPills}>
        {items.map((item, i) => <TechnicianChip key={`${item}-${i}`} label={item} />)}
      </View>
    </View>
  );
}

function BreakdownRow({ label, value, max, accent }: { label: string; value: number; max: number; accent: string }) {
  const pct = max > 0 ? value / max : 0;
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <View style={styles.breakdownBarBg}>
        <View style={[styles.breakdownBarFill, { width: `${pct * 100}%` as any, backgroundColor: value > 0 ? accent : techUi.borderSoft }]} />
      </View>
      <Text style={[styles.breakdownScore, { color: value > 0 ? accent : techUi.textMuted }]}>{value}/{max}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  notFound: { flex: 1, padding: spacing.lg, justifyContent: 'center' },
  section: { marginBottom: spacing.md },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: techUi.text, marginBottom: spacing.sm },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  companyInfo: { flex: 1, minWidth: 0 },
  companyName: { fontSize: 16, fontWeight: '700', color: techUi.text, marginBottom: 2 },
  companyType: { fontSize: 12, color: techUi.textSoft, marginBottom: 2 },
  companyLocation: { fontSize: 12, color: techUi.textMuted },
  offerTitle: { fontSize: 16, fontWeight: '700', color: techUi.text, marginBottom: 4 },
  offerLocation: { fontSize: 12, color: techUi.textMuted, marginBottom: spacing.sm },
  offerDescription: { fontSize: 13, color: techUi.textSoft, lineHeight: 20, marginBottom: spacing.md },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  reqBlock: { marginTop: spacing.md },
  reqRow: { marginBottom: spacing.sm },
  reqLabel: { fontSize: 12, color: techUi.textSoft, fontWeight: '600', marginBottom: spacing.xs },
  reqPills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  breakdownBlock: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: techUi.borderSoft },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  breakdownLabel: { fontSize: 12, color: techUi.textSoft, width: 90 },
  breakdownBarBg: { flex: 1, height: 7, backgroundColor: techUi.borderSoft, borderRadius: 4, overflow: 'hidden' },
  breakdownBarFill: { height: '100%', borderRadius: 4 },
  breakdownScore: { fontSize: 11, fontWeight: '700', width: 38, textAlign: 'right' },
  messageText: { fontSize: 13, color: techUi.textSoft, lineHeight: 20 },
  dateText: { fontSize: 12, color: techUi.textMuted, marginTop: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  actionBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  acceptBtn: { backgroundColor: techUi.green },
  rejectBtn: { backgroundColor: techUi.surface, borderWidth: 1, borderColor: techUi.red },
  btnDisabled: { opacity: 0.6 },
  acceptBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: techUi.red },
  acceptedNote: { marginBottom: spacing.md, borderColor: '#BBF7D0' },
  rejectedNote: { marginBottom: spacing.md, borderColor: '#FECACA' },
  inactiveNote: { marginBottom: spacing.md },
  noteTitle: { fontSize: 15, fontWeight: '700', color: techUi.text, marginBottom: 5 },
  noteSub: { fontSize: 13, lineHeight: 20, color: techUi.textSoft, marginBottom: spacing.sm },
  errorNote: { backgroundColor: techUi.redSoft, borderRadius: 14, padding: spacing.md, borderWidth: 1, borderColor: '#FECACA', marginBottom: spacing.md },
  errorNoteText: { fontSize: 13, color: techUi.red, lineHeight: 18 },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: { width: '100%', maxWidth: 360 },
  title: { fontSize: 18, fontWeight: '700', color: techUi.text, marginBottom: spacing.sm },
  body: { fontSize: 13, color: techUi.textSoft, lineHeight: 20, marginBottom: spacing.lg },
  confirmBtn: {
    backgroundColor: techUi.green,
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  confirmBtnDestructive: { backgroundColor: techUi.red },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  cancelBtn: { paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
  cancelBtnText: { fontSize: 14, color: techUi.textMuted, fontWeight: '600' },
});
