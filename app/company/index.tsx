import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  ClipboardCheck,
  MapPin,
  MessageCircle,
  Search,
} from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { useDemoSession } from '../../src/state/useDemoSession';
import { useCompanyDashboard } from '../../src/state/useCompanyDashboard';
import { useCompanySession } from '../../src/state/SessionContext';
import { offerApplicationRepository } from '../../src/repositories/v2/offerApplicationRepository';
import { offerRequestRepository } from '../../src/repositories/v2/offerRequestRepository';
import { chatRepository } from '../../src/repositories/v2/chatRepository';
import { offerRepository } from '../../src/repositories/v2/offerRepository';
import { companyRepositoryV2 } from '../../src/repositories/v2/companyRepositoryV2';
import { activityRepository } from '../../src/repositories/v2/activityRepository';
import { canManageCompanyMembers } from '../../src/utils/companyPermissionsV2';
import {
  ActivityDot,
  CompanyBadge,
  CompanyCard,
  CompanyPageHeader,
  CompanyScreen,
  IconBox,
  companyStyles,
  companyUi,
} from '../../src/components/company/CompanyUI';
import { colors, spacing } from '../../src/theme';
import type { Company, Offer } from '../../src/types';

type DashboardIconKind =
  | 'offers'
  | 'applications'
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
  hasActivity?: boolean;
};

type OfferActivityCounts = {
  applications: number;
  directOffers: number;
};

const DASHBOARD_ICONS: Record<DashboardIconKind, React.ComponentType<LucideProps>> = {
  offers: BriefcaseBusiness,
  applications: ClipboardCheck,
  search: Search,
  map: MapPin,
  chats: MessageCircle,
  profile: Building2,
  verified: BadgeCheck,
};

const COMPANY_TYPE_LABELS: Record<string, string> = {
  airline: 'Airline',
  mro: 'MRO',
  operator: 'Operator',
  contractor: 'Contractor',
  recruiter: 'Recruiter',
  MRO: 'MRO',
  recruitment_agency: 'Recruitment Agency',
  helicopter_operator: 'Helicopter Operator',
  other: 'Other',
};

const CONTRACT_LABELS: Record<string, string> = {
  permanent: 'Permanent',
  long_term: 'Long-term',
  short_term: 'Short-term',
};

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function verificationTone(status: string): 'success' | 'warning' | 'error' | 'muted' {
  if (status === 'verified') return 'success';
  if (status === 'rejected') return 'error';
  if (status === 'pending') return 'warning';
  return 'muted';
}

function offerStatusTone(status: Offer['status']): 'success' | 'warning' | 'error' | 'navy' {
  if (status === 'published') return 'success';
  if (status === 'draft') return 'warning';
  if (status === 'expired') return 'error';
  return 'navy';
}

function offerTimestamp(offer: Offer): number {
  const value = Date.parse(offer.updatedAt || offer.createdAt);
  return Number.isNaN(value) ? 0 : value;
}

function formatOfferLocation(offer: Offer): string {
  const location = [offer.locationCity, offer.locationCountry].filter(Boolean).join(', ');
  return location || 'Location pending';
}

function formatOfferDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function compactCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}

export default function CompanyDashboard() {
  const router = useRouter();
  const { companyId, companyMemberRole } = useCompanySession();
  const { clearSession } = useDemoSession();
  const { company, loading } = useCompanyDashboard();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 390;
  const canViewTeam = canManageCompanyMembers(companyMemberRole);

  const [pendingApplications, setPendingApplications] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [pendingDirectOffers, setPendingDirectOffers] = useState(0);
  const [publishedOffers, setPublishedOffers] = useState(0);
  const [teamMembers, setTeamMembers] = useState(0);
  const [unreadApplications, setUnreadApplications] = useState(0);
  const [unreadJobOffers, setUnreadJobOffers] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);
  const [recentOffers, setRecentOffers] = useState<Offer[]>([]);
  const [offerActivityCounts, setOfferActivityCounts] = useState<Record<string, OfferActivityCounts>>({});

  useEffect(() => {
    Promise.all([
      offerApplicationRepository.getForCompany(companyId),
      offerRequestRepository.getForCompany(companyId),
      offerRepository.getForCompany(companyId),
    ]).then(([apps, reqs, offers]) => {
      setPendingApplications(apps.filter((a) => a.status === 'pending').length);
      setPendingDirectOffers(reqs.filter((r) => r.status === 'pending').length);
      setPublishedOffers(offers.filter((o) => o.status === 'published').length);

      const sortedOffers = [...offers].sort((a, b) => offerTimestamp(b) - offerTimestamp(a));
      const nextCounts: Record<string, OfferActivityCounts> = {};
      sortedOffers.forEach((offer) => {
        nextCounts[offer.id] = {
          applications: apps.filter((app) => app.offerId === offer.id).length,
          directOffers: reqs.filter((req) => req.offerId === offer.id).length,
        };
      });
      setRecentOffers(sortedOffers.slice(0, 3));
      setOfferActivityCounts(nextCounts);
    });
    chatRepository.getRoomsForCompany(companyId).then((rooms) => {
      setChatCount(rooms.length);
    });
    companyRepositoryV2.getMembers(companyId).then((members) => {
      setTeamMembers(members.length);
    });
    activityRepository.getUnreadCount('company', companyId, ['application_received']).then(setUnreadApplications);
    activityRepository.getUnreadCount('company', companyId, ['direct_offer_accepted', 'direct_offer_rejected']).then(setUnreadJobOffers);
    activityRepository.getUnreadCount('company', companyId, ['chat_message_received']).then(setUnreadChats);
  }, [companyId]);

  async function handleSwitchRole() {
    await clearSession();
    router.replace('/');
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={colors.blue} role="company" />
      </>
    );
  }

  const unreadTotal = unreadApplications + unreadJobOffers + unreadChats;
  const metrics: Metric[] = [
    {
      label: 'Published offers',
      value: publishedOffers,
      detail: 'Active marketplace',
      icon: 'offers',
      tone: companyUi.accent,
      softTone: companyUi.accentSoft,
      hasActivity: unreadJobOffers > 0,
    },
    {
      label: 'Applications',
      value: pendingApplications,
      detail: 'Pending review',
      icon: 'applications',
      tone: pendingApplications > 0 ? companyUi.amber : companyUi.blue,
      softTone: pendingApplications > 0 ? companyUi.amberSoft : companyUi.blueSoft,
      hasActivity: unreadApplications > 0,
    },
    {
      label: 'Chats',
      value: chatCount,
      detail: 'Accepted contacts',
      icon: 'chats',
      tone: companyUi.blue,
      softTone: companyUi.blueSoft,
      hasActivity: unreadChats > 0,
    },
  ];

  const cardWidthStyle = isNarrow ? styles.actionFull : styles.actionHalf;

  return (
    <CompanyScreen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[companyStyles.content, isWide && styles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        <CompanyPageHeader
          eyebrow="Operator Dashboard"
          title="Company operations"
          subtitle="Manage offers, applications and technician outreach."
          right={unreadTotal > 0 ? (
            <View style={styles.activityChip}>
              <View style={styles.activityChipDot} />
              <Text style={styles.activityChipText}>{unreadTotal} new</Text>
            </View>
          ) : null}
        />

        <View style={[styles.shell, isWide && styles.shellWide]}>
          <View style={[styles.sideColumn, isWide && styles.sideColumnWide]}>
            {company ? (
              <CompanyProfilePanel
                company={company}
                teamMembers={teamMembers}
                canViewTeam={canViewTeam}
                companyMemberRole={companyMemberRole}
                onProfilePress={() => router.push('/company/profile' as any)}
              />
            ) : null}

            {isWide ? (
              <>
                <ActionPanel
                  rail
                  router={router}
                  unreadApplications={unreadApplications}
                  unreadJobOffers={unreadJobOffers}
                  unreadChats={unreadChats}
                  pendingApplications={pendingApplications}
                  chatCount={chatCount}
                  cardWidthStyle={styles.actionFull}
                />
                <SwitchRoleButton onPress={handleSwitchRole} />
              </>
            ) : null}
          </View>

          <View style={styles.mainColumn}>
            <CompanyCard>
              <SectionTitle label="Overview" value="Live counts" />
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
                unreadApplications={unreadApplications}
                unreadJobOffers={unreadJobOffers}
                unreadChats={unreadChats}
                pendingApplications={pendingApplications}
                chatCount={chatCount}
                cardWidthStyle={cardWidthStyle}
              />
            ) : null}

            <CompanyCard style={styles.directOfferPanel}>
              <SectionTitle label="Direct offer activity" value={`${pendingDirectOffers} pending`} />
              <Text style={styles.directOfferHelper}>
                Recent offers ready for technician outreach and direct-offer follow-up.
              </Text>
              {recentOffers.length > 0 ? (
                <View style={styles.recentOfferList}>
                  {recentOffers.map((offer, index) => (
                    <RecentOfferRow
                      key={offer.id}
                      offer={offer}
                      counts={offerActivityCounts[offer.id] ?? { applications: 0, directOffers: 0 }}
                      showDivider={index > 0}
                      onPress={() => router.push(`/company/offers/${offer.id}` as any)}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.directOfferEmpty}>
                  <Text style={styles.directOfferEmptyTitle}>No recent offers yet</Text>
                  <Text style={styles.directOfferEmptyText}>
                    Create a job offer to start sending direct offers.
                  </Text>
                </View>
              )}

            </CompanyCard>

            {!isWide ? (
              <SwitchRoleButton onPress={handleSwitchRole} />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </CompanyScreen>
  );
}

function RecentOfferRow({
  offer,
  counts,
  showDivider,
  onPress,
}: {
  offer: Offer;
  counts: OfferActivityCounts;
  showDivider: boolean;
  onPress: () => void;
}) {
  const updatedDate = formatOfferDate(offer.updatedAt || offer.createdAt);
  const meta = [
    formatOfferLocation(offer),
    CONTRACT_LABELS[offer.contractType] ?? offer.contractType,
    compactCount(counts.directOffers, 'direct offer'),
    counts.applications > 0 ? compactCount(counts.applications, 'application') : null,
    updatedDate ? `Updated ${updatedDate}` : null,
  ].filter(Boolean) as string[];

  return (
    <TouchableOpacity
      style={[styles.recentOfferRow, showDivider && styles.recentOfferDivider]}
      onPress={onPress}
      activeOpacity={0.76}
      accessibilityRole="button"
      accessibilityLabel={`Open ${offer.title}`}
    >
      <View style={styles.recentOfferCopy}>
        <View style={styles.recentOfferTitleRow}>
          <Text style={styles.recentOfferTitle} numberOfLines={1}>{offer.title}</Text>
          <CompanyBadge label={offer.status} tone={offerStatusTone(offer.status)} small />
        </View>
        <View style={styles.recentOfferMetaRow}>
          {meta.map((item, index) => (
            <React.Fragment key={item}>
              {index > 0 ? <View style={styles.metaDot} /> : null}
              <Text style={styles.recentOfferMeta} numberOfLines={1}>{item}</Text>
            </React.Fragment>
          ))}
        </View>
      </View>
      <View style={styles.recentOfferAction}>
        <Text style={styles.recentOfferActionText}>Open</Text>
        <ChevronRight color={companyUi.accent} size={15} strokeWidth={2.3} />
      </View>
    </TouchableOpacity>
  );
}

function CompanyProfilePanel({
  company,
  teamMembers,
  canViewTeam,
  companyMemberRole,
  onProfilePress,
}: {
  company: Company;
  teamMembers: number;
  canViewTeam: boolean;
  companyMemberRole: string;
  onProfilePress: () => void;
}) {
  return (
    <CompanyCard style={styles.profileCard}>
      <SectionTitle label="Operator profile" value="Company" />
      <View style={styles.profileTop}>
        <View style={styles.companyMark}>
          <Building2 color={colors.white} size={24} strokeWidth={2} />
        </View>
        <View style={styles.profileIdentity}>
          <Text style={styles.companyName} numberOfLines={1}>{company.companyName}</Text>
          <Text style={styles.companyMeta} numberOfLines={1}>
            {COMPANY_TYPE_LABELS[company.companyType] ?? company.companyType}
          </Text>
          <Text style={styles.companyLocation}>{company.city}, {company.country}</Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <CompanyBadge
          label={company.verificationStatus === 'verified' ? 'Verified' : company.verificationStatus}
          tone={verificationTone(company.verificationStatus)}
          small
        />
        {canViewTeam ? (
          <CompanyBadge label={`${teamMembers} team member${teamMembers !== 1 ? 's' : ''}`} tone="muted" small />
        ) : null}
      </View>

      <View style={styles.profileFacts}>
        <Fact label="Role" value={roleLabel(companyMemberRole)} />
        <Fact label="Email" value={company.contactEmail || 'Not set'} />
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
  unreadApplications,
  unreadJobOffers,
  unreadChats,
  pendingApplications,
  chatCount,
  cardWidthStyle,
  rail = false,
}: {
  router: ReturnType<typeof useRouter>;
  unreadApplications: number;
  unreadJobOffers: number;
  unreadChats: number;
  pendingApplications: number;
  chatCount: number;
  cardWidthStyle: ViewStyle;
  rail?: boolean;
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
          unreadCount={unreadJobOffers}
          onPress={() => router.push('/company/offers' as any)}
          style={rail ? styles.actionFull : cardWidthStyle}
        />
        <ActionCard
          title="Applications"
          subtitle={pendingApplications > 0 ? `${pendingApplications} pending review` : 'Review incoming candidates'}
          icon="applications"
          accent={pendingApplications > 0 ? companyUi.amber : companyUi.blue}
          softAccent={pendingApplications > 0 ? companyUi.amberSoft : companyUi.blueSoft}
          unreadCount={unreadApplications}
          onPress={() => router.push('/company/applications' as any)}
          style={rail ? styles.actionFull : cardWidthStyle}
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
          onPress={() => router.push('/map' as any)}
          style={rail ? styles.actionFull : cardWidthStyle}
        />
        <ActionCard
          title="Chats"
          subtitle={chatCount > 0 ? `${chatCount} open conversation${chatCount !== 1 ? 's' : ''}` : 'Accepted contacts only'}
          icon="chats"
          accent={companyUi.blue}
          softAccent={companyUi.blueSoft}
          unreadCount={unreadChats}
          onPress={() => router.push('/company/chats' as any)}
          style={rail ? styles.actionFull : cardWidthStyle}
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
  unreadCount = 0,
  style,
}: {
  title: string;
  subtitle: string;
  icon: DashboardIconKind;
  accent: string;
  softAccent: string;
  onPress: () => void;
  unreadCount?: number;
  style?: ViewStyle;
}) {
  const Icon = DASHBOARD_ICONS[icon];
  return (
    <TouchableOpacity style={[styles.actionCard, style]} onPress={onPress} activeOpacity={0.78}>
      {unreadCount > 0 ? <ActivityDot /> : null}
      <IconBox icon={Icon} color={accent} backgroundColor={softAccent} />
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
      {metric.hasActivity ? <ActivityDot /> : null}
      <IconBox icon={Icon} color={metric.tone} backgroundColor={metric.softTone} />
      <Text style={[styles.metricValue, { color: metric.tone }]}>{metric.value}</Text>
      <Text style={styles.metricLabel}>{metric.label}</Text>
      <Text style={styles.metricDetail}>{metric.detail}</Text>
    </View>
  );
}

function SwitchRoleButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.switchButton} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.switchButtonText}>Switch role</Text>
    </TouchableOpacity>
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
  activityChip: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: companyUi.surface,
    borderWidth: 1,
    borderColor: companyUi.border,
  },
  activityChipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: companyUi.red,
  },
  activityChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: companyUi.textSoft,
  },
  shell: {
    gap: spacing.md,
  },
  shellWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sideColumn: {
    gap: spacing.md,
  },
  sideColumnWide: {
    width: 336,
    flexShrink: 0,
  },
  mainColumn: {
    flex: 1,
    gap: spacing.md,
  },
  profileCard: {
    gap: spacing.md,
  },
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
  profileIdentity: {
    flex: 1,
    minWidth: 0,
  },
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
  companyLocation: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: companyUi.textMuted,
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
  profileActionCopy: {
    minWidth: 0,
  },
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
    position: 'relative',
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
  actionPanel: {
    gap: spacing.sm,
  },
  railPanel: {
    padding: 14,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  railActions: {
    gap: spacing.sm,
  },
  actionHalf: { width: '48.5%' },
  actionFull: { width: '100%' },
  actionCard: {
    minHeight: 82,
    backgroundColor: companyUi.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: companyUi.border,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    position: 'relative',
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: companyUi.text,
  },
  actionSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: companyUi.textSoft,
    marginTop: 3,
  },
  chevron: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '700',
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
  directOfferPanel: {
    gap: spacing.sm,
  },
  directOfferHelper: {
    marginTop: -6,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
  recentOfferList: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
    backgroundColor: companyUi.surface,
    overflow: 'hidden',
  },
  recentOfferRow: {
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recentOfferDivider: {
    borderTopWidth: 1,
    borderTopColor: companyUi.borderSoft,
  },
  recentOfferCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  recentOfferTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  recentOfferTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: companyUi.text,
  },
  recentOfferMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: 4,
    columnGap: 6,
  },
  recentOfferMeta: {
    maxWidth: '100%',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: companyUi.textSoft,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: companyUi.textMuted,
  },
  recentOfferAction: {
    minHeight: 34,
    paddingLeft: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  recentOfferActionText: {
    fontSize: 12,
    lineHeight: 16,
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
  inlineLink: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
  },
  inlineLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: companyUi.accent,
  },
  switchButton: {
    minHeight: 42,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: companyUi.border,
    backgroundColor: companyUi.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  switchButtonText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: companyUi.textSoft,
  },
});
