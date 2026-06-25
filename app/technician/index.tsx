import React, { useState, useEffect, useCallback } from 'react';
import {
  Platform,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle,
  ClipboardCheck,
  Clock,
  FileCheck,
  Files,
  IdCard,
  Inbox,
  MessageCircle,
  Radio,
  Settings,
  Users,
  XCircle,
} from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/auth/AuthContext';
import { useSession } from '../../src/state/SessionContext';
import { supabase } from '../../src/lib/supabase';
import { activityRepository } from '../../src/repositories/v2/activityRepository';
import { getOfferMatchesForTechnician, OfferMatchResult } from '../../src/utils/matchingV2';
import { MatchBadge } from '../../src/components/MatchBadge';
import { colors, spacing } from '../../src/theme';
import type { Company, MatchRequest } from '../../src/types';

type DashboardIconKind =
  | 'profile'
  | 'documents'
  | 'documentCheck'
  | 'verified'
  | 'availability'
  | 'browseOffers'
  | 'directOffers'
  | 'chats'
  | 'connections'
  | 'applications'
  | 'company'
  | 'pending'
  | 'accepted'
  | 'rejected';

type DashboardMetric = {
  icon: DashboardIconKind;
  label: string;
  value: number;
  detail: string;
  tone: string;
  softTone: string;
};

type SupaTechProfile = {
  id: string;
  firstName: string;
  lastName: string;
  anonymousCode: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
};

const ui = {
  page: '#E2EBF2',
  surface: '#FFFFFF',
  surfaceSoft: '#EBF2F8',
  border: '#B0C4D6',
  borderSoft: '#CCDAE8',
  text: '#0A1520',
  textSoft: '#2B3D52',
  textMuted: '#527088',
  accent: '#0891B2',
  accentSoft: '#B3E5F5',
  blue: '#1D4ED8',
  blueSoft: '#DBEAFE',
  green: '#065F46',
  greenSoft: '#C6F0E1',
  amber: '#92400E',
  amberSoft: '#FDE9B0',
  red: '#B91C1C',
  redSoft: '#FECACA',
  navy: '#0A1520',
};

const softShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0px 14px 34px rgba(15, 23, 42, 0.07)' } as ViewStyle,
  default: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
  },
});

export default function TechnicianDashboard() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const { technician: techSession, sessionLoading } = useSession();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 390;

  const [supaTech, setSupaTech] = useState<SupaTechProfile | null>(null);
  const [chatCount, setChatCount] = useState(0);
  const [pendingDirectOffers, setPendingDirectOffers] = useState(0);
  const [pendingApplications, setPendingApplications] = useState(0);
  const [documentCount, setDocumentCount] = useState(0);
  const [countsLoading, setCountsLoading] = useState(true);
  const [topMatchOffers, setTopMatchOffers] = useState<OfferMatchResult[]>([]);

  // Unread activity badges for NavCards
  const [unreadDirectOffers, setUnreadDirectOffers] = useState(0);
  const [unreadApplications, setUnreadApplications] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);

  useEffect(() => {
    if (!authLoading && !profile) {
      router.replace('/auth/login' as any);
    }
  }, [authLoading, profile]);

  useEffect(() => {
    if (!authLoading && profile?.status === 'pending_verification') {
      router.replace('/auth/pending-verification' as any);
    }
  }, [authLoading, profile]);

  useEffect(() => {
    if (!profile?.id) return;

    supabase
      .from('technician_profiles')
      .select('id, first_name, last_name, anonymous_code, verification_status')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setCountsLoading(false);
          return;
        }
        setSupaTech({
          id: data.id,
          firstName: data.first_name,
          lastName: data.last_name,
          anonymousCode: data.anonymous_code,
          verificationStatus: data.verification_status as SupaTechProfile['verificationStatus'],
        });

        const techId = data.id;
        Promise.all([
          supabase.from('documents').select('id', { count: 'exact', head: true }).eq('technician_id', techId),
          supabase.from('offer_requests').select('id', { count: 'exact', head: true }).eq('technician_id', techId).eq('status', 'pending'),
          supabase.from('offer_applications').select('id', { count: 'exact', head: true }).eq('technician_id', techId).eq('status', 'pending'),
          supabase.from('chat_rooms').select('id', { count: 'exact', head: true }).eq('technician_id', techId),
        ]).then(([docs, reqs, apps, chats]) => {
          setDocumentCount(docs.count ?? 0);
          setPendingDirectOffers(reqs.count ?? 0);
          setPendingApplications(apps.count ?? 0);
          setChatCount(chats.count ?? 0);
          setCountsLoading(false);
        });
      });
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!profile?.id) return;
      const techId = techSession.technicianId;
      if (!techId) return;
      Promise.all([
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('technician_id', techId),
        supabase.from('offer_requests').select('id', { count: 'exact', head: true }).eq('technician_id', techId).eq('status', 'pending'),
        supabase.from('offer_applications').select('id', { count: 'exact', head: true }).eq('technician_id', techId).eq('status', 'pending'),
        supabase.from('chat_rooms').select('id', { count: 'exact', head: true }).eq('technician_id', techId),
        activityRepository.getUnreadCount('technician', techId, ['direct_offer_received']),
        activityRepository.getUnreadCount('technician', techId, ['application_accepted', 'application_rejected']),
        activityRepository.getUnreadCount('technician', techId, ['chat_message_received']),
        getOfferMatchesForTechnician(techId),
      ]).then(([docs, reqs, apps, chats, unreadOffers, unreadApps, unreadChatCount, matches]) => {
        setDocumentCount(docs.count ?? 0);
        setPendingDirectOffers(reqs.count ?? 0);
        setPendingApplications(apps.count ?? 0);
        setChatCount(chats.count ?? 0);
        setTopMatchOffers((matches as OfferMatchResult[]).slice(0, 3));
        setUnreadDirectOffers(unreadOffers as number);
        setUnreadApplications(unreadApps as number);
        setUnreadChats(unreadChatCount as number);
      });
    }, [profile?.id, techSession.technicianId]),
  );

  if (authLoading || sessionLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={colors.technician} />
      </>
    );
  }

  const metrics: DashboardMetric[] = [
    {
      icon: 'directOffers',
      label: 'Direct offers',
      value: pendingDirectOffers,
      detail: 'Pending',
      tone: pendingDirectOffers > 0 ? ui.amber : ui.accent,
      softTone: pendingDirectOffers > 0 ? ui.amberSoft : ui.accentSoft,
    },
    {
      icon: 'connections',
      label: 'Connections',
      value: chatCount,
      detail: 'Open chats',
      tone: ui.blue,
      softTone: ui.blueSoft,
    },
    {
      icon: 'documentCheck',
      label: 'Documents',
      value: documentCount,
      detail: 'Uploaded',
      tone: ui.green,
      softTone: ui.greenSoft,
    },
    {
      icon: 'applications',
      label: 'Applications',
      value: pendingApplications,
      detail: 'Pending',
      tone: pendingApplications > 0 ? ui.accent : ui.textSoft,
      softTone: pendingApplications > 0 ? ui.accentSoft : ui.surfaceSoft,
    },
  ];

  const actionWidthStyle = isNarrow ? styles.actionFull : styles.actionHalf;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.eyebrow}>Aviation Job Talent</Text>
            <Text style={styles.pageTitle}>Operations overview</Text>
          </View>
        </View>

        <View style={[styles.shell, isWide && styles.shellWide]}>
          <View style={[styles.sideColumn, isWide && styles.sideColumnWide]}>
            {supaTech ? (
              <SupabaseProfileCard
                supaTech={supaTech}
                documentCount={documentCount}
                onProfilePress={() => router.push('/technician/profile' as any)}
                onDocumentsPress={() => router.push('/technician/documents' as any)}
                onSettingsPress={() => router.push('/settings' as any)}
              />
            ) : !countsLoading ? (
              <EmptyProfileCard onPress={() => router.push('/technician/profile' as any)} />
            ) : null}

            {isWide ? (
              <ActionPanel
                rail
                router={router}
                chatCount={chatCount}
                pendingDirectOffers={pendingDirectOffers}
                pendingApplications={pendingApplications}
                actionWidthStyle={styles.actionFull}
                unreadDirectOffers={unreadDirectOffers}
                unreadApplications={unreadApplications}
                unreadChats={unreadChats}
              />
            ) : null}
          </View>

          <View style={styles.mainColumn}>
            <View style={styles.panel}>
              <SectionTitle label="Overview" value="Live counts" />
              <View style={styles.metricsGrid}>
                {metrics.map((metric) => (
                  <MetricTile
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                    detail={metric.detail}
                    icon={metric.icon}
                    tone={metric.tone}
                    softTone={metric.softTone}
                    style={isNarrow ? styles.metricFull : styles.metricHalf}
                  />
                ))}
              </View>
            </View>

            {!isWide ? (
              <ActionPanel
                router={router}
                chatCount={chatCount}
                pendingDirectOffers={pendingDirectOffers}
                pendingApplications={pendingApplications}
                actionWidthStyle={actionWidthStyle}
                unreadDirectOffers={unreadDirectOffers}
                unreadApplications={unreadApplications}
                unreadChats={unreadChats}
              />
            ) : null}

            <View style={styles.panel}>
              <SectionTitle label="Recommended for you" value="By match %" />
              {topMatchOffers.length === 0 ? (
                <View style={styles.emptyRecent}>
                  <Text style={styles.emptyRecentTitle}>No offers available</Text>
                  <Text style={styles.emptyRecentText}>
                    Published offers matching your profile will appear here.
                  </Text>
                </View>
              ) : (
                <View style={styles.matchList}>
                  {topMatchOffers.map(({ offer, score }) => (
                    <TouchableOpacity
                      key={offer.id}
                      style={styles.matchRow}
                      onPress={() => router.push(`/technician/offers/${offer.id}` as any)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.matchRowInfo}>
                        <Text style={styles.matchRowTitle} numberOfLines={1}>{offer.title}</Text>
                        <Text style={styles.matchRowMeta} numberOfLines={1}>
                          {offer.locationCity}, {offer.locationCountry}
                        </Text>
                      </View>
                      <View style={styles.matchRowRight}>
                        <MatchBadge score={score.total} />
                        <Text style={styles.matchRowArrow}>{'>'}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={styles.matchViewAll}
                    onPress={() => router.push('/technician/offers' as any)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.matchViewAllText}>View all offers →</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type ActionPanelProps = {
  router: ReturnType<typeof useRouter>;
  chatCount: number;
  pendingDirectOffers: number;
  pendingApplications: number;
  actionWidthStyle: ViewStyle;
  rail?: boolean;
  unreadDirectOffers?: number;
  unreadApplications?: number;
  unreadChats?: number;
};

function ActionPanel({
  router,
  chatCount,
  pendingDirectOffers,
  pendingApplications,
  actionWidthStyle,
  rail = false,
  unreadDirectOffers = 0,
  unreadApplications = 0,
  unreadChats = 0,
}: ActionPanelProps) {
  return (
    <View style={[styles.panel, rail && styles.railPanel]}>
      <SectionTitle label="Workspace" value={rail ? 'Navigation' : 'Actions'} />

      {rail ? (
        <View style={styles.railActions}>
          <ActionCard
            title="Browse Offers"
            subtitle="Discover matching opportunities"
            accent={ui.accent}
            softAccent={ui.accentSoft}
            icon="browseOffers"
            onPress={() => router.push('/technician/offers' as any)}
            rail
          />
          <ActionCard
            title="Direct Offers"
            subtitle={pendingDirectOffers > 0 ? `${pendingDirectOffers} pending` : 'Sent directly to you'}
            accent={pendingDirectOffers > 0 ? ui.amber : ui.blue}
            softAccent={pendingDirectOffers > 0 ? ui.amberSoft : ui.blueSoft}
            icon="directOffers"
            onPress={() => router.push('/technician/direct-offers' as any)}
            rail
            badge={unreadDirectOffers > 0}
          />
          <ActionCard
            title="My Applications"
            subtitle={pendingApplications > 0 ? `${pendingApplications} pending` : 'Application history'}
            accent={pendingApplications > 0 ? ui.accent : ui.textSoft}
            softAccent={pendingApplications > 0 ? ui.accentSoft : ui.surfaceSoft}
            icon="applications"
            onPress={() => router.push('/technician/applications' as any)}
            rail
            badge={unreadApplications > 0}
          />
          <ActionCard
            title="Chats"
            subtitle={chatCount > 0 ? `${chatCount} open` : 'Accepted contacts only'}
            accent={ui.blue}
            softAccent={ui.blueSoft}
            icon="chats"
            onPress={() => router.push('/technician/chats' as any)}
            rail
            badge={unreadChats > 0}
          />
        </View>
      ) : (
        <>
          <View style={styles.primaryActions}>
            <ActionCard
              title="Browse Offers"
              subtitle="Discover matching opportunities"
              accent={ui.accent}
              softAccent={ui.accentSoft}
              icon="browseOffers"
              onPress={() => router.push('/technician/offers' as any)}
              style={actionWidthStyle}
              primary
            />
            <ActionCard
              title="Direct Offers"
              subtitle={pendingDirectOffers > 0 ? `${pendingDirectOffers} pending company offers` : 'Sent directly by companies'}
              accent={pendingDirectOffers > 0 ? ui.amber : ui.blue}
              softAccent={pendingDirectOffers > 0 ? ui.amberSoft : ui.blueSoft}
              icon="directOffers"
              onPress={() => router.push('/technician/direct-offers' as any)}
              style={actionWidthStyle}
              primary
              badge={unreadDirectOffers > 0}
            />
          </View>

          <View style={styles.secondaryActions}>
            <ActionCard
              title="My Applications"
              subtitle={pendingApplications > 0 ? `${pendingApplications} pending` : 'Application history'}
              accent={pendingApplications > 0 ? ui.accent : ui.textSoft}
              softAccent={pendingApplications > 0 ? ui.accentSoft : ui.surfaceSoft}
              icon="applications"
              onPress={() => router.push('/technician/applications' as any)}
              badge={unreadApplications > 0}
            />
            <ActionCard
              title="Chats"
              subtitle={chatCount > 0 ? `${chatCount} open conversation${chatCount !== 1 ? 's' : ''}` : 'Accepted contacts only'}
              accent={ui.blue}
              softAccent={ui.blueSoft}
              icon="chats"
              onPress={() => router.push('/technician/chats' as any)}
              badge={unreadChats > 0}
            />
          </View>
        </>
      )}
    </View>
  );
}

type ActionCardProps = {
  title: string;
  subtitle: string;
  accent: string;
  softAccent: string;
  icon: DashboardIconKind;
  onPress: () => void;
  style?: ViewStyle;
  primary?: boolean;
  rail?: boolean;
  badge?: boolean;
};

function ActionCard({
  title,
  subtitle,
  accent,
  softAccent,
  icon,
  onPress,
  style,
  primary = false,
  rail = false,
  badge = false,
}: ActionCardProps) {
  return (
    <TouchableOpacity
      style={[
        styles.actionCard,
        primary && styles.actionCardPrimary,
        rail && styles.actionCardRail,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <View style={styles.iconWrapper}>
        <View style={[styles.actionMark, { backgroundColor: softAccent }]}>
          <DashboardIcon kind={icon} color={accent} />
        </View>
        {badge ? <View style={styles.navBadgeDot} /> : null}
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.actionSubtitle} numberOfLines={2}>{subtitle}</Text>
      </View>
      <View style={[styles.actionRight, primary && styles.actionRightPrimary]}>
        <Text style={styles.chevron}>{'>'}</Text>
      </View>
    </TouchableOpacity>
  );
}

function SupabaseProfileCard({
  supaTech,
  documentCount,
  onProfilePress,
  onDocumentsPress,
  onSettingsPress,
}: {
  supaTech: SupaTechProfile;
  documentCount: number;
  onProfilePress: () => void;
  onDocumentsPress: () => void;
  onSettingsPress: () => void;
}) {
  const fullName = `${supaTech.firstName} ${supaTech.lastName}`.trim();
  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || 'T';

  return (
    <View style={styles.profileCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Profile</Text>
        <TouchableOpacity onPress={onSettingsPress} style={styles.settingsBtnCard} activeOpacity={0.7}>
          <Settings size={16} color={ui.textMuted} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <View style={styles.profileTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.profileIdentity}>
          <Text style={styles.profileName} numberOfLines={1}>{fullName}</Text>
          <Text style={styles.profileCode}>{supaTech.anonymousCode}</Text>
        </View>
      </View>
      <View style={styles.statusRow}>
        <VerificationPill status={supaTech.verificationStatus} />
      </View>
      <View style={styles.profileActions}>
        <ProfileActionBtn
          title="My Profile"
          subtitle="Edit details"
          icon="profile"
          accent={ui.accent}
          softAccent={ui.accentSoft}
          onPress={onProfilePress}
        />
        <ProfileActionBtn
          title="My Documents"
          subtitle={`${documentCount} file${documentCount !== 1 ? 's' : ''}`}
          icon="documents"
          accent={ui.green}
          softAccent={ui.greenSoft}
          onPress={onDocumentsPress}
        />
      </View>
    </View>
  );
}

function EmptyProfileCard({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.profileCard} onPress={onPress} activeOpacity={0.78}>
      <SectionTitle label="Profile" value="Incomplete" />
      <View style={styles.emptyProfileInner}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>T</Text>
        </View>
        <View style={styles.emptyProfileCopy}>
          <Text style={styles.profileName}>Complete your profile</Text>
          <Text style={styles.profileCode}>Tap to set up your technician profile</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ProfileActionBtn({
  title,
  subtitle,
  icon,
  accent,
  softAccent,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: DashboardIconKind;
  accent: string;
  softAccent: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.profileAction}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <View style={[styles.profileActionIcon, { backgroundColor: softAccent }]}>
        <DashboardIcon kind={icon} color={accent} small />
      </View>
      <View style={styles.profileActionCopy}>
        <Text style={styles.profileActionTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.profileActionSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
    </TouchableOpacity>
  );
}

type MetricTileProps = {
  label: string;
  value: number;
  detail: string;
  icon: DashboardIconKind;
  tone: string;
  softTone: string;
  style?: ViewStyle;
};

function MetricTile({ label, value, detail, icon, tone, softTone, style }: MetricTileProps) {
  return (
    <View style={[styles.metricTile, style]}>
      <View style={[styles.metricAccent, { backgroundColor: softTone }]}>
        <DashboardIcon kind={icon} color={tone} />
      </View>
      <Text style={[styles.metricValue, { color: tone }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

const DASHBOARD_ICONS: Record<DashboardIconKind, React.ComponentType<LucideProps>> = {
  profile: IdCard,
  documents: Files,
  documentCheck: FileCheck,
  verified: BadgeCheck,
  availability: Radio,
  browseOffers: BriefcaseBusiness,
  directOffers: Inbox,
  chats: MessageCircle,
  connections: Users,
  applications: ClipboardCheck,
  company: Building2,
  pending: Clock,
  accepted: CheckCircle,
  rejected: XCircle,
};

function DashboardIcon({ kind, color, small = false }: { kind: DashboardIconKind; color: string; small?: boolean }) {
  const Icon = DASHBOARD_ICONS[kind];
  return <Icon color={color} size={small ? 16 : 20} strokeWidth={2} />;
}

function VerificationPill({ status }: { status: SupaTechProfile['verificationStatus'] }) {
  const verified = status === 'verified';
  const rejected = status === 'rejected';
  const bg = verified ? ui.greenSoft : rejected ? ui.redSoft : ui.amberSoft;
  const text = verified ? ui.green : rejected ? ui.red : ui.amber;
  const icon: DashboardIconKind = verified ? 'verified' : rejected ? 'rejected' : 'pending';
  const label = verified ? 'Verified' : rejected ? 'Rejected' : 'Pending review';

  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]}>
      <DashboardIcon kind={icon} color={text} small />
      <Text style={[styles.statusPillText, { color: text }]}>{label}</Text>
    </View>
  );
}

function SectionTitle({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {value ? <Text style={styles.sectionValue}>{value}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: ui.page,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  contentWide: {
    maxWidth: 1080,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: spacing.lg,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  eyebrow: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: ui.accent,
    marginBottom: 2,
  },
  pageTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: ui.textSoft,
  },
  shell: { gap: spacing.md },
  shellWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sideColumn: { gap: spacing.md },
  sideColumnWide: {
    width: 336,
    flexShrink: 0,
  },
  mainColumn: {
    flex: 1,
    gap: spacing.md,
  },
  panel: {
    backgroundColor: ui.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: ui.border,
    padding: spacing.md,
    ...(softShadow ?? {}),
  },
  railPanel: { padding: 14 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.text,
  },
  sectionValue: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textMuted,
  },
  profileCard: {
    backgroundColor: ui.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: ui.border,
    padding: spacing.md,
    ...(softShadow ?? {}),
  },
  profileTop: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  emptyProfileInner: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  emptyProfileCopy: { flex: 1, minWidth: 0 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: ui.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  profileIdentity: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
    color: ui.text,
  },
  profileCode: {
    fontSize: 12,
    color: ui.textMuted,
    fontWeight: '600',
    marginTop: 3,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statusPill: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  profileActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  profileAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ui.borderSoft,
    backgroundColor: ui.surface,
    padding: 10,
    justifyContent: 'space-between',
  },
  profileActionIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  profileActionCopy: { minWidth: 0 },
  profileActionTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: ui.text,
  },
  profileActionSubtitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    color: ui.textSoft,
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricTile: {
    minHeight: 126,
    backgroundColor: ui.surfaceSoft,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ui.borderSoft,
    padding: 14,
  },
  metricHalf: { width: '48.5%' },
  metricFull: { width: '100%' },
  metricAccent: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  metricValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  metricLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: ui.text,
    marginTop: 2,
  },
  metricDetail: {
    fontSize: 12,
    lineHeight: 16,
    color: ui.textSoft,
    marginTop: 2,
    fontWeight: '500',
  },
  primaryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  secondaryActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  railActions: { gap: spacing.sm },
  actionHalf: { width: '48.5%' },
  actionFull: { width: '100%' },
  actionCard: {
    minHeight: 72,
    backgroundColor: ui.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ui.border,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  actionCardPrimary: {
    minHeight: 118,
    alignItems: 'flex-start',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: 14,
  },
  actionCardRail: {
    minHeight: 66,
    borderColor: ui.borderSoft,
    backgroundColor: ui.surfaceSoft,
  },
  actionMark: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: ui.text,
  },
  actionSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: ui.textSoft,
    marginTop: 3,
  },
  actionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  actionRightPrimary: { alignSelf: 'flex-end' },
  chevron: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '700',
    color: ui.textMuted,
  },
  emptyRecent: {
    borderRadius: 18,
    backgroundColor: ui.surfaceSoft,
    borderWidth: 1,
    borderColor: ui.borderSoft,
    padding: spacing.md,
  },
  emptyRecentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: ui.text,
  },
  matchList: {
    gap: 4,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ui.borderSoft,
    backgroundColor: ui.surfaceSoft,
    gap: spacing.sm,
  },
  matchRowInfo: {
    flex: 1,
    minWidth: 0,
  },
  matchRowTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: ui.text,
  },
  matchRowMeta: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    color: ui.textMuted,
  },
  matchRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  matchRowArrow: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.textMuted,
  },
  matchViewAll: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  matchViewAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: ui.accent,
  },
  emptyRecentText: {
    fontSize: 12,
    lineHeight: 17,
    color: ui.textSoft,
    fontWeight: '600',
    marginTop: 4,
  },
  iconWrapper: {
    position: 'relative',
  },
  navBadgeDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#DC2626',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 10,
  },
  settingsBtnCard: {
    padding: spacing.xs,
  },
});
