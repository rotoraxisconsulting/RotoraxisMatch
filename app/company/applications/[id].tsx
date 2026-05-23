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
import { offerApplicationRepository } from '../../../src/repositories/v2/offerApplicationRepository';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { technicianRepositoryV2 } from '../../../src/repositories/v2/technicianRepositoryV2';
import { chatRepository } from '../../../src/repositories/v2/chatRepository';
import { activityRepository } from '../../../src/repositories/v2/activityRepository';
import { calculateOfferTechnicianMatch } from '../../../src/utils/matchingV2';
import { isUnlocked, TechnicianView } from '../../../src/types/privacy';
import { DEMO_COMPANY_ID, DEMO_COMPANY_MEMBER_ROLE } from '../../../src/state/useCompanyDashboard';
import { canReviewApplications } from '../../../src/utils/companyPermissionsV2';
import { OfferApplication } from '../../../src/types/offerRequest';
import { OfferWithRequirements } from '../../../src/types/offer';
import { TechnicianWithRelations } from '../../../src/types/technician';
import { MatchScore } from '../../../src/types/matching';
import { Document } from '../../../src/types/document';
import { ChatRoom } from '../../../src/types/chat';

const TECH_TYPE_LABELS: Record<string, string> = {
  mechanic: 'Mechanic',
  avionics: 'Avionics',
  structures: 'Structures',
  inspector: 'Inspector',
  electrician: 'Electrician',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  license: 'License',
  medical: 'Medical',
  id: 'ID',
  training: 'Training',
  resume: 'Resume',
  other: 'Other',
};

type BadgeVariant = 'success' | 'warning' | 'error' | 'navy';
const DOC_STATUS_VARIANT: Record<string, BadgeVariant> = {
  verified: 'success',
  pending: 'warning',
  rejected: 'error',
  expired: 'navy',
};

function scoreColor(total: number): string {
  if (total >= 80) return colors.success;
  if (total >= 60) return colors.blue;
  if (total >= 40) return colors.warning;
  return colors.textMuted;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ApplicationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [app, setApp] = useState<OfferApplication | null>(null);
  const [offer, setOffer] = useState<OfferWithRequirements | null>(null);
  const [techView, setTechView] = useState<TechnicianView | null>(null);
  const [techWithRel, setTechWithRel] = useState<TechnicianWithRelations | null>(null);
  const [score, setScore] = useState<MatchScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [confirmAction, setConfirmAction] = useState<'accept' | 'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const application = await offerApplicationRepository.getById(id);
    if (!application) return;
    setApp(application);

    const [o, view, rel] = await Promise.all([
      offerRepository.getWithRequirements(application.offerId),
      technicianRepositoryV2.getViewForCompany(application.technicianId, DEMO_COMPANY_ID),
      technicianRepositoryV2.getWithRelations(application.technicianId),
    ]);

    setOffer(o);
    setTechView(view);
    setTechWithRel(rel);
    if (o && rel) setScore(calculateOfferTechnicianMatch(o, rel));

    // Load chat room if application is accepted
    if (application.status === 'accepted') {
      const rooms = await chatRepository.getRoomsForCompany(DEMO_COMPANY_ID);
      setChatRoom(rooms.find((r) => r.offerApplicationId === application.id) ?? null);
    }

    await activityRepository.markRead('company', DEMO_COMPANY_ID, id);
  }, [id]);

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

  function handleAccept() {
    if (!app || !id) return;
    setActionError(null);
    setConfirmAction('accept');
  }

  function handleReject() {
    if (!app || !id) return;
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
      const result = await offerApplicationRepository.updateStatus(
        id,
        action === 'accept' ? 'accepted' : 'rejected',
      );
      if (result === null) {
        setActionError('Could not update application status. Please try again.');
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
        <Stack.Screen options={{ title: 'Application' }} />
        <LoadingScreen color={colors.blue} role="company" />
      </>
    );
  }

  if (!app || !offer) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Application' }} />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Application not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const unlocked = techView ? isUnlocked(techView) : false;
  const accent = score ? scoreColor(score.total) : colors.textMuted;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: offer.title }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Score hero */}
        <View style={[styles.scoreHero, { borderColor: accent + '40' }]}>
          {score ? (
            <>
              <Text style={[styles.scoreHeroValue, { color: accent }]}>{score.total}%</Text>
              <Text style={styles.scoreHeroLabel}>match for this offer</Text>
              <Text style={[styles.scoreHeroMatch, { color: accent }]}>{score.label}</Text>
            </>
          ) : (
            <Text style={styles.scoreUnavailable}>Score unavailable</Text>
          )}
        </View>

        {/* Score breakdown */}
        {score && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Score breakdown</Text>
            <BreakdownRow label="Verified" value={score.breakdown.verified} max={25} />
            <BreakdownRow label="Habilitation" value={score.breakdown.habilitation} max={25} />
            <BreakdownRow label="License" value={score.breakdown.license} max={20} />
            <BreakdownRow label="Availability" value={score.breakdown.availability} max={15} />
            <BreakdownRow label="Experience" value={score.breakdown.experience} max={10} />
            <BreakdownRow label="Location" value={score.breakdown.location} max={5} />
          </View>
        )}

        {/* Offer info */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Job offer</Text>
            <Badge
              label={offer.status}
              variant={offer.status === 'published' ? 'success' : offer.status === 'draft' ? 'warning' : 'navy'}
            />
          </View>
          <Text style={styles.offerTitle}>{offer.title}</Text>
          <Text style={styles.offerLocation}>
            {offer.locationCity}, {offer.locationCountry}
            {offer.locationBaseAirport ? ` · ${offer.locationBaseAirport}` : ''}
          </Text>
          <TouchableOpacity
            onPress={() => router.push(`/company/offers/${offer.id}` as any)}
            activeOpacity={0.75}
          >
            <Text style={styles.viewOfferLink}>View full offer details →</Text>
          </TouchableOpacity>
        </View>

        {/* Applicant profile */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Applicant profile</Text>
            {!unlocked && (
              <View style={styles.lockedPill}>
                <Text style={styles.lockedPillText}>Anonymous</Text>
              </View>
            )}
          </View>

          {techView && (
            <>
              <View style={styles.profileRow}>
                <View style={[styles.profileAvatar, unlocked && styles.profileAvatarUnlocked]}>
                  <Text style={styles.profileAvatarText}>
                    {unlocked
                      ? (techView as any).firstName.charAt(0)
                      : techView.anonymousCode.charAt(0)}
                  </Text>
                </View>
                <View style={styles.profileInfo}>
                  {unlocked ? (
                    <>
                      <Text style={styles.profileName}>
                        {(techView as any).firstName} {(techView as any).lastName}
                      </Text>
                      <Text style={styles.profileSub}>{(techView as any).email}</Text>
                      {(techView as any).phone && (
                        <Text style={styles.profileSub}>{(techView as any).phone}</Text>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={styles.profileName}>{techView.anonymousCode}</Text>
                      <Text style={styles.profileSub}>Identity hidden · Accept to reveal</Text>
                    </>
                  )}
                </View>
              </View>

              <View style={styles.metaGrid}>
                <MetaRow label="Type" value={TECH_TYPE_LABELS[techView.technicianType] ?? techView.technicianType} />
                <MetaRow label="Age" value={`${techView.age} years old`} />
                <MetaRow
                  label="Location"
                  value={`${techView.city}, ${techView.country}${techView.baseAirport ? ` · ${techView.baseAirport}` : ''}`}
                />
                <MetaRow
                  label="Status"
                  value={techView.verificationStatus === 'verified' ? '✓ Verified' : 'Unverified'}
                  valueColor={techView.verificationStatus === 'verified' ? colors.success : colors.warning}
                />
              </View>

              {techView.licenses.length > 0 && (
                <View style={styles.licRow}>
                  {techView.licenses.map((l, i) => (
                    <View key={i} style={styles.licChip}>
                      <Text style={styles.licChipText}>{l}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* Cover note */}
        {app.coverNote ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cover note</Text>
            <Text style={styles.coverNoteText}>"{app.coverNote}"</Text>
          </View>
        ) : null}

        {/* Application status */}
        <View style={styles.section}>
          <View style={styles.statusRow}>
            <Text style={styles.sectionTitle}>Application status</Text>
            <AppStatusBadge status={app.status} />
          </View>
          <Text style={styles.dateText}>Applied {formatDate(app.createdAt)}</Text>
          {app.updatedAt !== app.createdAt && (
            <Text style={styles.dateText}>Last updated {formatDate(app.updatedAt)}</Text>
          )}
        </View>

        {/* Inline error */}
        {actionError && (
          <View style={styles.errorNote}>
            <Text style={styles.errorNoteText}>{actionError}</Text>
          </View>
        )}

        {/* Accept / Reject buttons */}
        {app.status === 'pending' && canReviewApplications(DEMO_COMPANY_MEMBER_ROLE) && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn, actioning && styles.btnDisabled]}
              onPress={handleReject}
              disabled={actioning}
              activeOpacity={0.75}
            >
              {actioning
                ? <ActivityIndicator color={colors.error} size="small" />
                : <Text style={styles.rejectBtnText}>Reject</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn, actioning && styles.btnDisabled]}
              onPress={handleAccept}
              disabled={actioning}
              activeOpacity={0.75}
            >
              {actioning
                ? <ActivityIndicator color={colors.white} size="small" />
                : <Text style={styles.acceptBtnText}>Accept application</Text>}
            </TouchableOpacity>
          </View>
        )}

        {app.status === 'pending' && !canReviewApplications(DEMO_COMPANY_MEMBER_ROLE) && (
          <View style={styles.viewerNote}>
            <Text style={styles.viewerNoteText}>
              Viewer role — cannot accept or reject applications.
            </Text>
          </View>
        )}

        {/* Post-acceptance confirmation note */}
        {app.status === 'accepted' && (
          <View style={styles.acceptedNote}>
            <Text style={styles.acceptedNoteTitle}>Application accepted</Text>
            <Text style={styles.acceptedNoteSub}>
              The technician's identity and documents are now visible. A chat room has been created for direct communication.
            </Text>
            {chatRoom && (
              <TouchableOpacity
                style={styles.chatBtn}
                onPress={() => router.push(`/company/chats/${chatRoom.id}` as any)}
                activeOpacity={0.75}
              >
                <Text style={styles.chatBtnText}>Open chat →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Documents — only visible after acceptance */}
        {unlocked && (techView as any).documents && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { marginBottom: spacing.md }]}>Documents</Text>
            {(techView as any).documents.length === 0 ? (
              <Text style={styles.noDocsText}>No documents on file.</Text>
            ) : (
              (techView as any).documents.map((doc: Document) => (
                <View key={doc.id} style={styles.docRow}>
                  <View style={styles.docInfo}>
                    <Text style={styles.docName}>{doc.fileName}</Text>
                    <Text style={styles.docMeta}>
                      {DOC_TYPE_LABELS[doc.type] ?? doc.type}
                      {doc.expiresAt ? ` · Expires ${formatDate(doc.expiresAt)}` : ''}
                    </Text>
                  </View>
                  <Badge
                    label={doc.status}
                    variant={DOC_STATUS_VARIANT[doc.status] ?? 'navy'}
                    small
                  />
                </View>
              ))
            )}
          </View>
        )}

        {/* Locked documents placeholder — shown while pending or after rejection */}
        {!unlocked && app.status !== 'withdrawn' && (
          <View style={styles.lockedDocs}>
            <Text style={styles.lockedDocsIcon}>🔒</Text>
            <Text style={styles.lockedDocsTitle}>Documents locked</Text>
            <Text style={styles.lockedDocsSub}>
              {app.status === 'rejected'
                ? 'Documents remain locked for rejected applications.'
                : 'Documents are unlocked only after you accept this application.'}
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
              {confirmAction === 'accept' ? 'Accept application?' : 'Reject application?'}
            </Text>
            <Text style={modalStyles.body}>
              {confirmAction === 'accept'
                ? 'This will unlock the technician identity/documents and open a chat.'
                : 'The technician will remain locked and no chat will be created.'}
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

function BreakdownRow({ label, value, max }: { label: string; value: number; max: number }) {
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
              backgroundColor: value > 0 ? colors.blue : colors.border,
            },
          ]}
        />
      </View>
      <Text style={[bdStyles.pts, { color: value > 0 ? colors.success : colors.textMuted }]}>
        {value}/{max}
      </Text>
    </View>
  );
}

function MetaRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={metaStyles.row}>
      <Text style={metaStyles.label}>{label}</Text>
      <Text style={[metaStyles.value, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
    </View>
  );
}

function AppStatusBadge({ status }: { status: string }) {
  type V = 'success' | 'warning' | 'error' | 'navy';
  const map: Record<string, { label: string; variant: V }> = {
    pending: { label: 'Pending review', variant: 'warning' },
    accepted: { label: 'Accepted', variant: 'success' },
    rejected: { label: 'Rejected', variant: 'error' },
    withdrawn: { label: 'Withdrawn', variant: 'navy' },
    expired: { label: 'Expired', variant: 'navy' },
  };
  const info = map[status] ?? { label: status, variant: 'navy' as V };
  return <Badge label={info.label} variant={info.variant} />;
}

const bdStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  label: { fontSize: 11, color: colors.textSecondary, width: 85 },
  barBg: { flex: 1, height: 6, backgroundColor: colors.borderLight, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%' as any, borderRadius: 3 },
  pts: { fontSize: 11, fontWeight: '700', width: 36, textAlign: 'right' },
});

const metaStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  label: { fontSize: 12, color: colors.textMuted },
  value: { fontSize: 12, fontWeight: '600', color: colors.text },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  contentWide: { maxWidth: 720, alignSelf: 'center', width: '100%' },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { fontSize: 16, color: colors.textSecondary },
  scoreHero: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: spacing.md,
  },
  scoreHeroValue: { fontSize: 56, fontWeight: '800', lineHeight: 64 },
  scoreHeroLabel: {
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  scoreHeroMatch: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  scoreUnavailable: { fontSize: 16, color: colors.textMuted },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  offerTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  offerLocation: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
  viewOfferLink: { fontSize: 12, fontWeight: '600', color: colors.blue, marginTop: spacing.xs },
  lockedPill: {
    backgroundColor: colors.warning + '15',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.warning + '40',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  lockedPillText: { fontSize: 10, color: colors.warning, fontWeight: '600' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  profileAvatarUnlocked: { backgroundColor: colors.blue },
  profileAvatarText: { fontSize: 20, fontWeight: '700', color: colors.white },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  profileSub: { fontSize: 12, color: colors.textSecondary },
  metaGrid: { marginBottom: spacing.sm },
  licRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  licChip: {
    backgroundColor: colors.navyLight + '15',
    borderWidth: 1,
    borderColor: colors.navyLight + '40',
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  licChipText: { fontSize: 11, color: colors.navy, fontWeight: '600' },
  coverNoteText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  dateText: { fontSize: 12, color: colors.textMuted },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: { backgroundColor: colors.success },
  rejectBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.error },
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
  acceptedNoteTitle: { fontSize: 14, fontWeight: '700', color: colors.success, marginBottom: 4 },
  acceptedNoteSub: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
  chatBtn: {
    backgroundColor: colors.blue,
    borderRadius: 10,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginTop: 2,
  },
  chatBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  docInfo: { flex: 1 },
  docName: { fontSize: 13, fontWeight: '600', color: colors.text },
  docMeta: { fontSize: 11, color: colors.textMuted },
  noDocsText: { fontSize: 13, color: colors.textSecondary },
  viewerNote: {
    backgroundColor: colors.warning + '10',
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning + '30',
    marginBottom: spacing.md,
    alignItems: 'center' as const,
  },
  viewerNoteText: { fontSize: 13, color: colors.warning, fontStyle: 'italic' as const },
  lockedDocs: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  lockedDocsIcon: { fontSize: 32, marginBottom: spacing.sm },
  lockedDocsTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
  lockedDocsSub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', maxWidth: 260 },
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
