import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  Inbox,
  MapPin,
  MessageCircle,
  Search,
  Settings,
} from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/auth/AuthContext';
import { useCompanySession, useSession } from '../../src/state/SessionContext';
import { supabase } from '../../src/lib/supabase';
import {
  canManageCompanyMembers,
  canManageOffers,
  canReviewApplications,
  canSendChatMessages,
  canSendDirectOffers,
} from '../../src/utils/companyPermissionsV2';
import { activityRepository } from '../../src/repositories/v2/activityRepository';
import {
  CompanyBadge,
  CompanyCard,
  CompanyPageHeader,
  CompanyScreen,
  IconBox,
  companyStyles,
  companyUi,
} from '../../src/components/company/CompanyUI';
import { colors, spacing } from '../../src/theme';

type DashboardIconKind =
  | 'offers'
  | 'applications'
  | 'directOffers'
  | 'search'
  | 'map'
  | 'chats'
  | 'profile'
  | 'verified';

type Metric = {
  label: string;
  value: number;
  detail: string;
  icon: DashboardIconKind;
  tone: string;
  softTone: string;
};

type PublishedOfferSummary = {
  id: string;
  title: string;
  contractType: string;
};

type HiringAction = {
  icon: DashboardIconKind;
  title: string;
  description: string;
  status: string;
  primaryLabel: string;
  primaryPath: string;
  secondaryLabel?: string;
  secondaryPath?: string;
  tone: string;
  softTone: string;
};

type SupabaseCompany = {
  id: string;
  name: string;
  email: string;
  companyType: string;
  verificationStatus: string;
};

const DASHBOARD_ICONS: Record<DashboardIconKind, React.ComponentType<LucideProps>> = {
  offers: BriefcaseBusiness,
  applications: ClipboardCheck,
  directOffers: Inbox,
  search: Search,
  map: MapPin,
  chats: MessageCircle,
  profile: Building2,
  verified: BadgeCheck,
};

const COMPANY_TYPE_LABELS: Record<string, string> = {
  airline: 'Airline',
  mro: 'MRO',
  MRO: 'MRO',
  operator: 'Operator',
  contractor: 'Contractor',
  recruiter: 'Recruiter',
  recruitment_agency: 'Recruitment Agency',
  helicopter_operator: 'Helicopter Operator',
  other: 'Other',
};

function verificationTone(status: string): 'success' | 'warning' | 'error' | 'muted' {
  if (status === 'verified') return 'success';
  if (status === 'rejected') return 'error';
  if (status === 'pending') return 'warning';
  return 'muted';
}

// Fase 5.4 — acepta undefined (sesión de empresa aún sin resolver) y
// devuelve un guion en vez de reventar al llamar charAt sobre undefined.
function roleLabel(role: string | undefined): string {
  if (!role) return '—';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function CompanyDashboard() {
  const router = useRouter();
  const { profile, session, loading: authLoading } = useAuth();
  const companySession = useCompanySession();
  const companyId = companySession?.companyId;
  const companyMemberRole = companySession?.companyMemberRole;
  const { sessionLoading } = useSession();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 390;
  const canViewTeam = canManageCompanyMembers(companyMemberRole);
  const canManageJobOffers = canManageOffers(companyMemberRole);
  const canReviewCandidates = canReviewApplications(companyMemberRole);
  const canMessageCandidates = canSendChatMessages(companyMemberRole);
  const canContactCandidates = canSendDirectOffers(companyMemberRole);

  const [supabaseCompany, setSupabaseCompany] = useState<SupabaseCompany | null>(null);
  const [memberDisplayName, setMemberDisplayName] = useState<string>('');
  const [pendingApplications, setPendingApplications] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [pendingDirectOffers, setPendingDirectOffers] = useState(0);
  const [publishedOffers, setPublishedOffers] = useState(0);
  const [publishedOffersList, setPublishedOffersList] = useState<PublishedOfferSummary[]>([]);
  const [teamMembers, setTeamMembers] = useState(0);
  const [dashboardDataLoading, setDashboardDataLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);

  // Unread activity badges for NavCards
  const [unreadApplications, setUnreadApplications] = useState(0);
  const [unreadDirectOffers, setUnreadDirectOffers] = useState(0);
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
    if (!companyId) {
      setDashboardDataLoading(false);
      return;
    }
    setDashboardDataLoading(true);

    supabase
      .from('companies')
      .select('id, name, email, company_type, verification_status')
      .eq('id', companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSupabaseCompany({
            id: data.id,
            name: data.name,
            email: data.email,
            companyType: data.company_type,
            verificationStatus: data.verification_status,
          });
        }
      });

    if (profile?.id) {
      supabase
        .from('company_members')
        .select('display_name')
        .eq('user_id', profile.id)
        .eq('company_id', companyId)
        .maybeSingle()
        .then(({ data }) => {
          setMemberDisplayName(data?.display_name ?? '');
        });
    }

    Promise.all([
      supabase.from('offer_applications').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pending'),
      supabase.from('offer_requests').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pending'),
      supabase.from('offers').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'published'),
      supabase.from('chat_rooms').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
      supabase.from('company_members').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
      supabase.from('offers').select('id, title, contract_type').eq('company_id', companyId).eq('status', 'published').eq('visible', true).order('created_at', { ascending: false }),
    ]).then(([apps, reqs, offers, chats, members, offersList]) => {
      setPendingApplications(apps.count ?? 0);
      setPendingDirectOffers(reqs.count ?? 0);
      setPublishedOffers(offers.count ?? 0);
      setChatCount(chats.count ?? 0);
      setTeamMembers(members.count ?? 0);
      setPublishedOffersList(
        ((offersList.data ?? []) as any[]).map((o) => ({
          id: o.id,
          title: o.title,
          contractType: o.contract_type,
        })),
      );
    }).catch(() => {
      setPublishedOffersList([]);
    }).finally(() => {
      setDashboardDataLoading(false);
    });
  }, [companyId]);

  useFocusEffect(
    useCallback(() => {
      if (!companyId) {
        setActivityLoading(false);
        return;
      }
      Promise.all([
        activityRepository.getUnreadCount('company', companyId, ['application_received']),
        activityRepository.getUnreadCount('company', companyId, ['direct_offer_accepted', 'direct_offer_rejected']),
        activityRepository.getUnreadCount('company', companyId, ['chat_message_received']),
      ]).then(([apps, directOffers, chats]) => {
        setUnreadApplications(apps);
        setUnreadDirectOffers(directOffers);
        setUnreadChats(chats);
      }).catch(() => {
        setUnreadApplications(0);
        setUnreadDirectOffers(0);
        setUnreadChats(0);
      }).finally(() => {
        setActivityLoading(false);
      });
    }, [companyId]),
  );

  if (authLoading || sessionLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={colors.blue} />
      </>
    );
  }

  const metrics: Metric[] = [
    {
      label: 'Published offers',
      value: publishedOffers,
      detail: 'Active marketplace',
      icon: 'offers',
      tone: companyUi.accent,
      softTone: companyUi.accentSoft,
    },
    {
      label: 'Applications',
      value: pendingApplications,
      detail: 'Pending review',
      icon: 'applications',
      tone: pendingApplications > 0 ? companyUi.amber : companyUi.blue,
      softTone: pendingApplications > 0 ? companyUi.amberSoft : companyUi.blueSoft,
    },
    {
      label: 'Sent Direct Offers',
      value: pendingDirectOffers,
      detail: 'Awaiting response',
      icon: 'directOffers',
      tone: pendingDirectOffers > 0 ? companyUi.amber : companyUi.accent,
      softTone: pendingDirectOffers > 0 ? companyUi.amberSoft : companyUi.accentSoft,
    },
    {
      label: 'Chats',
      value: chatCount,
      detail: 'Accepted contacts',
      icon: 'chats',
      tone: companyUi.blue,
      softTone: companyUi.blueSoft,
    },
  ];

  const focusOffer = publishedOffersList[0] ?? null;
  const nextHiringAction: HiringAction = unreadChats > 0
    ? {
        icon: 'chats',
        title: canMessageCandidates ? 'Reply to a candidate' : 'View the latest candidate message',
        description: `${unreadChats} hiring conversation${unreadChats !== 1 ? 's have' : ' has'} new messages waiting.`,
        status: `${unreadChats} updated chat${unreadChats !== 1 ? 's' : ''}`,
        primaryLabel: 'Open chats',
        primaryPath: '/company/chats',
        tone: companyUi.blue,
        softTone: companyUi.blueSoft,
      }
    : unreadDirectOffers > 0
      ? {
          icon: 'directOffers',
          title: 'Review technician responses',
          description: unreadDirectOffers === 1
            ? 'One sent offer has a new technician response to review.'
            : `${unreadDirectOffers} sent offers have new technician responses to review.`,
          status: `${unreadDirectOffers} new`,
          primaryLabel: 'Review responses',
          primaryPath: '/company/direct-offers',
          tone: companyUi.amber,
          softTone: companyUi.amberSoft,
        }
      : pendingApplications > 0
        ? {
            icon: 'applications',
            title: canReviewCandidates ? 'Review pending applications' : 'View pending applications',
            description: `${pendingApplications} application${pendingApplications !== 1 ? 's are' : ' is'} waiting for review. Start with the newest candidates.`,
            status: `${pendingApplications} pending`,
            primaryLabel: canReviewCandidates ? 'Review applications' : 'View applications',
            primaryPath: '/company/applications',
            tone: companyUi.amber,
            softTone: companyUi.amberSoft,
          }
        : focusOffer
          ? {
              icon: 'search',
              title: `${canContactCandidates ? 'Find' : 'Explore'} candidates for “${focusOffer.title}”`,
              description: `This ${focusOffer.contractType.replace(/_/g, ' ')} role is published and ready to be matched with qualified technicians.`,
              status: `${publishedOffersList.length} active offer${publishedOffersList.length !== 1 ? 's' : ''}`,
              primaryLabel: 'Search matching technicians',
              primaryPath: `/company/search?offerId=${focusOffer.id}`,
              secondaryLabel: 'View offer',
              secondaryPath: `/company/offers/${focusOffer.id}`,
              tone: companyUi.accent,
              softTone: companyUi.accentSoft,
            }
          : publishedOffers > 0
            ? {
                icon: 'offers',
                title: 'Prepare an offer for candidate search',
                description: 'Your published offers are not currently visible to technicians. Review their visibility before searching.',
                status: 'Needs attention',
                primaryLabel: 'View job offers',
                primaryPath: '/company/offers',
                tone: companyUi.amber,
                softTone: companyUi.amberSoft,
              }
            : {
                icon: 'offers',
                title: canManageJobOffers ? 'Publish your first job offer' : 'No active job offers',
                description: canManageJobOffers
                  ? 'Create a role to receive applications and start matching with qualified technicians.'
                  : 'An admin or recruiter needs to publish an offer before the team can start finding candidates.',
                status: canManageJobOffers ? 'Get started' : 'No active roles',
                primaryLabel: canManageJobOffers ? 'Create an offer' : 'View job offers',
                primaryPath: canManageJobOffers ? '/company/offers/new' : '/company/offers',
                tone: companyUi.accent,
                softTone: companyUi.accentSoft,
              };

  // Always full-width on mobile — 2-column grid truncates card titles on small screens
  const cardWidthStyle = styles.actionFull;

  return (
    <CompanyScreen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[companyStyles.content, isWide && styles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        <CompanyPageHeader
          eyebrow="Aviation Job Talent"
          title="Company operations"
        />

        <View style={[styles.shell, isWide && styles.shellWide]}>
          <View style={[styles.sideColumn, isWide && styles.sideColumnWide]}>
            {supabaseCompany ? (
              <CompanyProfilePanel
                company={supabaseCompany}
                memberName={memberDisplayName || session?.user?.email || ''}
                teamMembers={teamMembers}
                canViewTeam={canViewTeam}
                companyMemberRole={companyMemberRole}
                onProfilePress={() => router.push('/company/profile' as any)}
                onSettingsPress={() => router.push('/settings' as any)}
              />
            ) : !sessionLoading && companyId ? (
              <CompanyLoadingCard />
            ) : !sessionLoading && !companyId ? (
              <EmptyCompanyCard />
            ) : null}

            {isWide ? (
              <ActionPanel
                rail
                router={router}
                pendingApplications={pendingApplications}
                chatCount={chatCount}
                cardWidthStyle={styles.actionFull}
                unreadApplications={unreadApplications}
                unreadDirectOffers={unreadDirectOffers}
                unreadChats={unreadChats}
              />
            ) : null}
          </View>

          <View style={styles.mainColumn}>
            <CompanyCard>
              <SectionTitle label="Overview" />
              <View style={styles.metricsGrid}>
                {metrics.map((metric) => (
                  <MetricTile
                    key={metric.label}
                    metric={metric}
                    style={isNarrow ? styles.metricFull : styles.metricHalf}
                  />
                ))}
              </View>
            </CompanyCard>

            {!isWide ? (
              <ActionPanel
                router={router}
                pendingApplications={pendingApplications}
                chatCount={chatCount}
                cardWidthStyle={cardWidthStyle}
                unreadApplications={unreadApplications}
                unreadDirectOffers={unreadDirectOffers}
                unreadChats={unreadChats}
              />
            ) : null}

            <CompanyCard>
              {dashboardDataLoading || activityLoading ? (
                <>
                  <SectionTitle label="Finding your next hiring action" />
                  <View style={styles.nextActionLoading}>
                    <ActivityIndicator size="small" color={companyUi.accent} />
                    <Text style={styles.nextActionLoadingText}>Checking offers and candidate activity...</Text>
                  </View>
                </>
              ) : (
                <>
                  <SectionTitle label="Your next hiring action" value={nextHiringAction.status} />
                  <View style={styles.nextActionCard}>
                    <View style={styles.nextActionTop}>
                      <IconBox
                        icon={DASHBOARD_ICONS[nextHiringAction.icon]}
                        color={nextHiringAction.tone}
                        backgroundColor={nextHiringAction.softTone}
                      />
                      <View style={styles.nextActionCopy}>
                        <Text style={styles.nextActionTitle}>{nextHiringAction.title}</Text>
                        <Text style={styles.nextActionDescription}>{nextHiringAction.description}</Text>
                      </View>
                    </View>

                    <View style={[styles.nextActionButtons, isNarrow && styles.nextActionButtonsNarrow]}>
                      <TouchableOpacity
                        style={[styles.nextActionPrimary, isNarrow && styles.nextActionButtonNarrow]}
                        onPress={() => router.push(nextHiringAction.primaryPath as any)}
                        activeOpacity={0.78}
                        accessibilityRole="button"
                        accessibilityLabel={nextHiringAction.primaryLabel}
                      >
                        <Text style={styles.nextActionPrimaryText}>{nextHiringAction.primaryLabel}</Text>
                      </TouchableOpacity>
                      {nextHiringAction.secondaryLabel && nextHiringAction.secondaryPath ? (
                        <TouchableOpacity
                          style={[styles.nextActionSecondary, isNarrow && styles.nextActionButtonNarrow]}
                          onPress={() => router.push(nextHiringAction.secondaryPath as any)}
                          activeOpacity={0.75}
                          accessibilityRole="button"
                          accessibilityLabel={nextHiringAction.secondaryLabel}
                        >
                          <Text style={styles.nextActionSecondaryText}>{nextHiringAction.secondaryLabel}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </>
              )}
            </CompanyCard>
          </View>
        </View>
      </ScrollView>
    </CompanyScreen>
  );
}

function CompanyProfilePanel({
  company,
  memberName,
  teamMembers,
  canViewTeam,
  companyMemberRole,
  onProfilePress,
  onSettingsPress,
}: {
  company: SupabaseCompany;
  memberName: string;
  teamMembers: number;
  canViewTeam: boolean;
  // Fase 5.4 — undefined mientras la sesión de empresa no está resuelta.
  // Solo se usa como etiqueta; el panel ya se renderiza únicamente cuando
  // hay `supabaseCompany`, así que en la práctica siempre llega con valor.
  companyMemberRole: string | undefined;
  onProfilePress: () => void;
  onSettingsPress: () => void;
}) {
  return (
    <CompanyCard style={styles.profileCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Operator profile</Text>
        <TouchableOpacity onPress={onSettingsPress} style={styles.settingsBtnCard} activeOpacity={0.7}>
          <Settings size={16} color={companyUi.textMuted} strokeWidth={2} />
        </TouchableOpacity>
      </View>
      <View style={styles.profileTop}>
        <View style={styles.companyMark}>
          <Building2 color={colors.white} size={24} strokeWidth={2} />
        </View>
        <View style={styles.profileIdentity}>
          <Text style={styles.companyName} numberOfLines={1}>
            {memberName || company.name}
          </Text>
          <Text style={styles.companyMeta} numberOfLines={1}>
            {memberName ? company.name : (COMPANY_TYPE_LABELS[company.companyType] ?? company.companyType)}
          </Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <CompanyBadge
          label={company.verificationStatus === 'verified' ? 'Verified' : company.verificationStatus}
          tone={verificationTone(company.verificationStatus)}
          small
        />
        {canViewTeam ? (
          <CompanyBadge label={`${teamMembers} member${teamMembers !== 1 ? 's' : ''}`} tone="muted" small />
        ) : null}
      </View>

      <View style={styles.profileFacts}>
        <Fact label="Role" value={roleLabel(companyMemberRole)} />
        <Fact label="Email" value={company.email || 'Not set'} />
      </View>

      <View style={styles.profileActions}>
        <ProfileAction
          title={canViewTeam ? 'Profile & team' : 'Profile'}
          subtitle={canViewTeam ? 'Details and access' : 'Company details'}
          icon="profile"
          accent={companyUi.accent}
          softAccent={companyUi.accentSoft}
          onPress={onProfilePress}
        />
      </View>
    </CompanyCard>
  );
}

function CompanyLoadingCard() {
  return (
    <CompanyCard style={styles.profileCard}>
      <SectionTitle label="Operator profile" value="Loading…" />
    </CompanyCard>
  );
}

function EmptyCompanyCard() {
  return (
    <CompanyCard style={styles.profileCard}>
      <SectionTitle label="Operator profile" value="Company" />
      <View style={styles.directOfferEmpty}>
        <Text style={styles.directOfferEmptyTitle}>No company linked</Text>
        <Text style={styles.directOfferEmptyText}>
          Your account is not yet linked to a company profile.
        </Text>
      </View>
    </CompanyCard>
  );
}

function ProfileAction({
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
  const Icon = DASHBOARD_ICONS[icon];
  return (
    <TouchableOpacity
      style={styles.profileAction}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[styles.profileActionIcon, { backgroundColor: softAccent }]}>
        <Icon color={accent} size={15} strokeWidth={2.1} />
      </View>
      <View style={styles.profileActionCopy}>
        <Text style={styles.profileActionTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.profileActionSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
    </TouchableOpacity>
  );
}

function ActionPanel({
  router,
  pendingApplications,
  chatCount,
  cardWidthStyle,
  rail = false,
  unreadApplications = 0,
  unreadDirectOffers = 0,
  unreadChats = 0,
}: {
  router: ReturnType<typeof useRouter>;
  pendingApplications: number;
  chatCount: number;
  cardWidthStyle: ViewStyle;
  rail?: boolean;
  unreadApplications?: number;
  unreadDirectOffers?: number;
  unreadChats?: number;
}) {
  return (
    <CompanyCard style={[styles.actionPanel, rail && styles.railPanel]}>
      <SectionTitle label="Workspace" value={rail ? 'Navigation' : 'Actions'} />
      <View style={rail ? styles.railActions : styles.actionGrid}>
        <ActionCard
          title="Job Offers"
          subtitle="Create and manage openings"
          icon="offers"
          accent={companyUi.accent}
          softAccent={companyUi.accentSoft}
          onPress={() => router.push('/company/offers' as any)}
          style={rail ? styles.actionFull : cardWidthStyle}
        />
        <ActionCard
          title="Applications"
          subtitle={pendingApplications > 0 ? `${pendingApplications} pending review` : 'Review incoming candidates'}
          icon="applications"
          accent={pendingApplications > 0 ? companyUi.amber : companyUi.blue}
          softAccent={pendingApplications > 0 ? companyUi.amberSoft : companyUi.blueSoft}
          onPress={() => router.push('/company/applications' as any)}
          style={rail ? styles.actionFull : cardWidthStyle}
          badge={unreadApplications > 0}
        />
        <ActionCard
          title="Sent Direct Offers"
          subtitle="Track technician responses"
          icon="directOffers"
          accent={unreadDirectOffers > 0 ? companyUi.amber : companyUi.accent}
          softAccent={unreadDirectOffers > 0 ? companyUi.amberSoft : companyUi.accentSoft}
          onPress={() => router.push('/company/direct-offers' as any)}
          style={rail ? styles.actionFull : cardWidthStyle}
          badge={unreadDirectOffers > 0}
        />
        <ActionCard
          title="Search Technicians"
          subtitle="Find privacy-safe profiles"
          icon="search"
          accent={companyUi.accent}
          softAccent={companyUi.accentSoft}
          onPress={() => router.push('/company/search' as any)}
          style={rail ? styles.actionFull : cardWidthStyle}
        />
        <ActionCard
          title="Technician Map"
          subtitle="Browse by location"
          icon="map"
          accent={companyUi.green}
          softAccent={companyUi.greenSoft}
          onPress={() => router.push('/company/map' as any)}
          style={rail ? styles.actionFull : cardWidthStyle}
        />
        <ActionCard
          title="Chats"
          subtitle={chatCount > 0 ? `${chatCount} open conversation${chatCount !== 1 ? 's' : ''}` : 'Accepted contacts only'}
          icon="chats"
          accent={companyUi.blue}
          softAccent={companyUi.blueSoft}
          onPress={() => router.push('/company/chats' as any)}
          style={rail ? styles.actionFull : cardWidthStyle}
          badge={unreadChats > 0}
        />
      </View>
    </CompanyCard>
  );
}

function ActionCard({
  title,
  subtitle,
  icon,
  accent,
  softAccent,
  onPress,
  style,
  badge = false,
}: {
  title: string;
  subtitle: string;
  icon: DashboardIconKind;
  accent: string;
  softAccent: string;
  onPress: () => void;
  style?: ViewStyle;
  badge?: boolean;
}) {
  const Icon = DASHBOARD_ICONS[icon];
  return (
    <TouchableOpacity style={[styles.actionCard, style]} onPress={onPress} activeOpacity={0.78}>
      <View style={styles.iconWrapper}>
        <IconBox icon={Icon} color={accent} backgroundColor={softAccent} />
        {badge ? <View style={styles.navBadgeDot} /> : null}
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.actionSubtitle} numberOfLines={2}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>{'>'}</Text>
    </TouchableOpacity>
  );
}

function MetricTile({ metric, style }: { metric: Metric; style?: ViewStyle }) {
  const Icon = DASHBOARD_ICONS[metric.icon];
  return (
    <View style={[styles.metricTile, style]}>
      <IconBox icon={Icon} color={metric.tone} backgroundColor={metric.softTone} />
      <Text style={[styles.metricValue, { color: metric.tone }]}>{metric.value}</Text>
      <Text style={styles.metricLabel}>{metric.label}</Text>
      <Text style={styles.metricDetail}>{metric.detail}</Text>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  contentWide: {
    maxWidth: 1080,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: spacing.lg,
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
  profileCard: { gap: spacing.md },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  companyMark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: companyUi.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIdentity: { flex: 1, minWidth: 0 },
  companyName: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
    color: companyUi.text,
  },
  companyMeta: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: companyUi.textSoft,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  profileFacts: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  profileActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2,
  },
  profileAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
    backgroundColor: companyUi.surface,
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
    color: companyUi.text,
  },
  profileActionSubtitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    color: companyUi.textSoft,
    marginTop: 2,
  },
  fact: {
    flex: 1,
    minWidth: 0,
    backgroundColor: companyUi.surfaceSoft,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
  },
  factLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: companyUi.textMuted,
    marginBottom: 3,
  },
  factValue: {
    fontSize: 12,
    fontWeight: '600',
    color: companyUi.text,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricTile: {
    minHeight: 126,
    backgroundColor: companyUi.surfaceSoft,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
    padding: 14,
  },
  metricHalf: { width: '48.5%' },
  metricFull: { width: '100%' },
  metricValue: {
    marginTop: 12,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  metricLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: companyUi.text,
    marginTop: 2,
  },
  metricDetail: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: companyUi.textSoft,
    marginTop: 2,
  },
  actionPanel: { gap: spacing.sm },
  railPanel: { padding: 14 },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  railActions: { gap: spacing.sm },
  actionFull: { width: '100%' },
  actionCard: {
    minHeight: 62,
    backgroundColor: companyUi.surfaceSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionCopy: { flex: 1, minWidth: 0 },
  actionTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: companyUi.text,
  },
  actionSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: companyUi.textSoft,
    marginTop: 2,
  },
  chevron: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
    color: companyUi.textMuted,
  },
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
    color: companyUi.text,
  },
  sectionValue: {
    fontSize: 12,
    fontWeight: '600',
    color: companyUi.textMuted,
  },
  nextActionLoading: {
    minHeight: 112,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
    backgroundColor: companyUi.surfaceSoft,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  nextActionLoadingText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: companyUi.textSoft,
  },
  nextActionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
    backgroundColor: companyUi.surfaceSoft,
    padding: spacing.md,
  },
  nextActionTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  nextActionCopy: {
    flex: 1,
    minWidth: 0,
  },
  nextActionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: companyUi.text,
  },
  nextActionDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
  nextActionButtons: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: companyUi.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nextActionButtonsNarrow: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  nextActionButtonNarrow: {
    width: '100%',
  },
  nextActionPrimary: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: companyUi.accent,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextActionPrimaryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.white,
  },
  nextActionSecondary: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextActionSecondaryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: companyUi.accent,
  },
  directOfferEmpty: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
    backgroundColor: companyUi.surfaceSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  directOfferEmptyTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: companyUi.text,
  },
  directOfferEmptyText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: companyUi.textSoft,
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
