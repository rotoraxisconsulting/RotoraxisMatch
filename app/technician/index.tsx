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
  Users,
  XCircle,
} from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { Button } from '../../src/components/Button';
import { useDemoSession } from '../../src/state/useDemoSession';
import { useTechnicianDashboard } from '../../src/state/useTechnicianDashboard';
import { useTechnicianSession } from '../../src/state/SessionContext';
import { chatRepository } from '../../src/repositories/v2/chatRepository';
import { offerRequestRepository } from '../../src/repositories/v2/offerRequestRepository';
import { offerApplicationRepository } from '../../src/repositories/v2/offerApplicationRepository';
import { activityRepository } from '../../src/repositories/v2/activityRepository';
import { colors, spacing } from '../../src/theme';
import type { Company, MatchRequest, Technician } from '../../src/types';

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
  hasActivity?: boolean;
};

const ui = {
  page: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceSoft: '#F8FAFC',
  border: '#E5E7EB',
  borderSoft: '#EEF2F7',
  text: '#0F172A',
  textSoft: '#475569',
  textMuted: '#94A3B8',
  accent: '#0E7490',
  accentSoft: '#E0F7FA',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  green: '#047857',
  greenSoft: '#ECFDF5',
  amber: '#B45309',
  amberSoft: '#FFFBEB',
  red: '#DC2626',
  redSoft: '#FEF2F2',
  navy: '#111827',
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
  const { technicianId } = useTechnicianSession();
  const { clearSession } = useDemoSession();
  const { technician, requests, documents, companyMap, loading, refresh } = useTechnicianDashboard();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 390;

  const [chatCount, setChatCount] = useState(0);
  const [pendingDirectOffers, setPendingDirectOffers] = useState(0);
  const [pendingApplications, setPendingApplications] = useState(0);
  const [unreadDirectOffers, setUnreadDirectOffers] = useState(0);
  const [unreadBrowseOffers, setUnreadBrowseOffers] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);

  useEffect(() => {
    chatRepository.getRoomsForTechnician(technicianId).then((rooms) => {
      setChatCount(rooms.length);
    });
    offerRequestRepository.getForTechnician(technicianId).then((reqs) => {
      setPendingDirectOffers(reqs.filter((r) => r.status === 'pending').length);
    });
    offerApplicationRepository.getForTechnician(technicianId).then((apps) => {
      setPendingApplications(apps.filter((a) => a.status === 'pending').length);
    });
    activityRepository.getUnreadCount('technician', technicianId, ['direct_offer_received']).then(setUnreadDirectOffers);
    activityRepository.getUnreadCount('technician', technicianId, ['application_accepted', 'application_rejected']).then(setUnreadBrowseOffers);
    activityRepository.getUnreadCount('technician', technicianId, ['chat_message_received']).then(setUnreadChats);
  }, [technicianId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function handleSwitchRole() {
    await clearSession();
    router.replace('/');
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  const unreadTotal = unreadDirectOffers + unreadBrowseOffers + unreadChats;
  const metrics: DashboardMetric[] = [
    {
      icon: 'directOffers',
      label: 'Direct offers',
      value: pendingDirectOffers,
      detail: 'Pending',
      tone: pendingDirectOffers > 0 ? ui.amber : ui.accent,
      softTone: pendingDirectOffers > 0 ? ui.amberSoft : ui.accentSoft,
      hasActivity: unreadDirectOffers > 0,
    },
    {
      icon: 'connections',
      label: 'Connections',
      value: chatCount,
      detail: 'Open chats',
      tone: ui.blue,
      softTone: ui.blueSoft,
      hasActivity: unreadChats > 0,
    },
    {
      icon: 'documentCheck',
      label: 'Documents',
      value: documents.length,
      detail: `${documents.filter((d) => d.status === 'verified').length} verified`,
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
      hasActivity: unreadBrowseOffers > 0,
    },
  ];

  const actionWidthStyle = isNarrow ? styles.actionFull : styles.actionHalf;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <Stack.Screen options={{ headerShown: false }} />
      <DemoModeBanner role="technician" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.eyebrow}>Technician Dashboard</Text>
            <Text style={styles.pageTitle}>Operations overview</Text>
          </View>
          {unreadTotal > 0 ? (
            <View style={styles.activityChip}>
              <View style={styles.activityChipDot} />
              <Text style={styles.activityChipText}>
                {unreadTotal} new
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.shell, isWide && styles.shellWide]}>
          <View style={[styles.sideColumn, isWide && styles.sideColumnWide]}>
            {technician ? (
              <ProfilePanel
                technician={technician}
                documentsCount={documents.length}
                onProfilePress={() => router.push('/technician/profile' as any)}
                onDocumentsPress={() => router.push('/technician/documents' as any)}
              />
            ) : null}

            {isWide ? (
              <>
                <ActionPanel
                  rail
                  router={router}
                  chatCount={chatCount}
                  pendingDirectOffers={pendingDirectOffers}
                  pendingApplications={pendingApplications}
                  unreadDirectOffers={unreadDirectOffers}
                  unreadApplications={unreadBrowseOffers}
                  unreadChats={unreadChats}
                  actionWidthStyle={styles.actionFull}
                />
                <Button
                  label="Switch role"
                  onPress={handleSwitchRole}
                  variant="ghost"
                  fullWidth
                  style={styles.switchBtn}
                />
              </>
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
                    hasActivity={metric.hasActivity}
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
                unreadDirectOffers={unreadDirectOffers}
                unreadApplications={unreadBrowseOffers}
                unreadChats={unreadChats}
                actionWidthStyle={actionWidthStyle}
              />
            ) : null}

            <RecentRequestsPanel
              requests={requests.slice(0, 3)}
              companyMap={companyMap}
              unreadCount={unreadDirectOffers}
              onOpen={(id) => router.push(`/technician/direct-offers/${id}` as any)}
            />

            {!isWide ? (
              <Button
                label="Switch role"
                onPress={handleSwitchRole}
                variant="ghost"
                fullWidth
                style={styles.switchBtn}
              />
            ) : null}
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
  unreadDirectOffers: number;
  unreadApplications: number;
  unreadChats: number;
  actionWidthStyle: ViewStyle;
  rail?: boolean;
};

function ActionPanel({
  router,
  chatCount,
  pendingDirectOffers,
  pendingApplications,
  unreadDirectOffers,
  unreadApplications,
  unreadChats,
  actionWidthStyle,
  rail = false,
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
            unreadCount={unreadDirectOffers}
            onPress={() => router.push('/technician/direct-offers' as any)}
            rail
          />
          <ActionCard
            title="My Applications"
            subtitle={pendingApplications > 0 ? `${pendingApplications} pending` : 'Application history'}
            accent={pendingApplications > 0 ? ui.accent : ui.textSoft}
            softAccent={pendingApplications > 0 ? ui.accentSoft : ui.surfaceSoft}
            icon="applications"
            unreadCount={unreadApplications}
            onPress={() => router.push('/technician/applications' as any)}
            rail
          />
          <ActionCard
            title="Chats"
            subtitle={chatCount > 0 ? `${chatCount} open` : 'Accepted contacts only'}
            accent={ui.blue}
            softAccent={ui.blueSoft}
            icon="chats"
            unreadCount={unreadChats}
            onPress={() => router.push('/technician/chats' as any)}
            rail
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
              subtitle={pendingDirectOffers > 0 ? `${pendingDirectOffers} pending company offer${pendingDirectOffers !== 1 ? 's' : ''}` : 'Sent directly by companies'}
              accent={pendingDirectOffers > 0 ? ui.amber : ui.blue}
              softAccent={pendingDirectOffers > 0 ? ui.amberSoft : ui.blueSoft}
              icon="directOffers"
              unreadCount={unreadDirectOffers}
              onPress={() => router.push('/technician/direct-offers' as any)}
              style={actionWidthStyle}
              primary
            />
          </View>

          <View style={styles.secondaryActions}>
            <ActionCard
              title="My Applications"
              subtitle={pendingApplications > 0 ? `${pendingApplications} pending` : 'Application history'}
              accent={pendingApplications > 0 ? ui.accent : ui.textSoft}
              softAccent={pendingApplications > 0 ? ui.accentSoft : ui.surfaceSoft}
              icon="applications"
              unreadCount={unreadApplications}
              onPress={() => router.push('/technician/applications' as any)}
            />
            <ActionCard
              title="Chats"
              subtitle={chatCount > 0 ? `${chatCount} open conversation${chatCount !== 1 ? 's' : ''}` : 'Accepted contacts only'}
              accent={ui.blue}
              softAccent={ui.blueSoft}
              icon="chats"
              unreadCount={unreadChats}
              onPress={() => router.push('/technician/chats' as any)}
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
  unreadCount?: number;
  style?: ViewStyle;
  primary?: boolean;
  rail?: boolean;
};

function ActionCard({
  title,
  subtitle,
  accent,
  softAccent,
  icon,
  onPress,
  unreadCount = 0,
  style,
  primary = false,
  rail = false,
}: ActionCardProps) {
  const showActivity = unreadCount > 0;

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
      {showActivity ? <View style={styles.unreadDot} /> : null}
      <View style={[styles.actionMark, { backgroundColor: softAccent }]}>
        <DashboardIcon kind={icon} color={accent} />
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

type ProfilePanelProps = {
  technician: Technician;
  documentsCount: number;
  onProfilePress: () => void;
  onDocumentsPress: () => void;
};

function ProfilePanel({
  technician,
  documentsCount,
  onProfilePress,
  onDocumentsPress,
}: ProfilePanelProps) {
  const completeness = Math.max(0, Math.min(100, technician.profileCompleteness));
  const base = technician.baseAirport || technician.city || 'Base pending';
  const aircraft = compactList(technician.aircraftTypes, 'Aircraft pending');

  return (
    <View style={styles.profileCard}>
      <SectionTitle label="Profile" value="Technician" />

      <View style={styles.profileTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsFor(technician.fullName)}</Text>
        </View>
        <View style={styles.profileIdentity}>
          <Text style={styles.profileName} numberOfLines={1}>{technician.fullName}</Text>
          <Text style={styles.profileRole} numberOfLines={1}>{technicianRoleLabel(technician)}</Text>
          <Text style={styles.profileCode}>{technician.anonymousCode}</Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <StatusPill status={technician.verificationStatus} />
        <View style={styles.subtlePill}>
          <DashboardIcon kind="availability" color={ui.textSoft} small />
          <Text style={styles.subtlePillText}>{availabilityLabel(technician)}</Text>
        </View>
      </View>

      <View style={styles.completenessBlock}>
        <View style={styles.completenessLabelRow}>
          <Text style={styles.completenessLabel}>Profile completeness</Text>
          <Text style={styles.completenessValue}>{completeness}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${completeness}%` as any }]} />
        </View>
      </View>

      <View style={styles.profileFacts}>
        <Fact label="Base" value={base} />
        <Fact label="Aircraft" value={aircraft} />
        <Fact label="Experience" value={`${technician.yearsExperience} yrs`} />
      </View>

      <View style={styles.profileActions}>
        <ProfileAction
          title="My Profile"
          subtitle="Edit details"
          icon="profile"
          accent={ui.accent}
          softAccent={ui.accentSoft}
          onPress={onProfilePress}
        />
        <ProfileAction
          title="My Documents"
          subtitle={`${documentsCount} file${documentsCount !== 1 ? 's' : ''}`}
          icon="documents"
          accent={ui.green}
          softAccent={ui.greenSoft}
          onPress={onDocumentsPress}
        />
      </View>
    </View>
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
  hasActivity?: boolean;
  style?: ViewStyle;
};

function MetricTile({ label, value, detail, icon, tone, softTone, hasActivity, style }: MetricTileProps) {
  return (
    <View style={[styles.metricTile, style]}>
      {hasActivity ? <View style={styles.metricActivityDot} /> : null}
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
  return (
    <Icon
      color={color}
      size={small ? 16 : 20}
      strokeWidth={2}
    />
  );
}

type RecentRequestsPanelProps = {
  requests: MatchRequest[];
  companyMap: Record<string, Company>;
  unreadCount: number;
  onOpen: (id: string) => void;
};

function RecentRequestsPanel({ requests, companyMap, unreadCount, onOpen }: RecentRequestsPanelProps) {
  return (
    <View style={styles.panel}>
      <SectionTitle
        label="Recent direct offers"
        value={unreadCount > 0 ? `${unreadCount} unread` : `${requests.length} latest`}
        alert={unreadCount > 0}
      />

      {requests.length > 0 ? (
        <View style={styles.requestList}>
          {requests.map((request) => (
            <TouchableOpacity
              key={request.id}
              style={styles.requestRow}
              onPress={() => onOpen(request.id)}
              activeOpacity={0.78}
            >
              <View style={styles.requestCompanyMark}>
                <DashboardIcon kind="company" color={colors.white} />
              </View>
              <View style={styles.requestCopy}>
                <View style={styles.requestTitleRow}>
                  <Text style={styles.requestTitle} numberOfLines={1}>
                    {companyMap[request.companyId]?.companyName ?? 'Company'}
                  </Text>
                  <RequestStatus status={request.status} />
                </View>
                <Text style={styles.requestMessage} numberOfLines={2}>
                  {request.message ?? 'Direct offer received.'}
                </Text>
                <Text style={styles.requestDate}>{formatDate(request.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.emptyRecent}>
          <Text style={styles.emptyRecentTitle}>No direct offers yet</Text>
          <Text style={styles.emptyRecentText}>
            New company offers will appear here when they arrive.
          </Text>
        </View>
      )}
    </View>
  );
}

function SectionTitle({ label, value, alert = false }: { label: string; value?: string; alert?: boolean }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {value ? (
        <View style={styles.sectionValueWrap}>
          {alert ? <View style={styles.sectionValueDot} /> : null}
          <Text style={styles.sectionValue}>{value}</Text>
        </View>
      ) : null}
    </View>
  );
}

function StatusPill({ status }: { status: Technician['verificationStatus'] }) {
  const verified = status === 'verified';
  const rejected = status === 'rejected';
  const bg = verified ? ui.greenSoft : rejected ? ui.redSoft : ui.amberSoft;
  const text = verified ? ui.green : rejected ? ui.red : ui.amber;
  const icon: DashboardIconKind = verified ? 'verified' : rejected ? 'rejected' : 'pending';

  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]}>
      <DashboardIcon kind={icon} color={text} small />
      <Text style={[styles.statusPillText, { color: text }]}>{statusLabel(status)}</Text>
    </View>
  );
}

function RequestStatus({ status }: { status: MatchRequest['status'] }) {
  const color = status === 'accepted' ? ui.green : status === 'sent' ? ui.amber : ui.red;
  const bg = status === 'accepted' ? ui.greenSoft : status === 'sent' ? ui.amberSoft : ui.redSoft;
  const icon: DashboardIconKind = status === 'accepted' ? 'accepted' : status === 'sent' ? 'pending' : 'rejected';

  return (
    <View style={[styles.requestStatus, { backgroundColor: bg }]}>
      <DashboardIcon kind={icon} color={color} small />
      <Text style={[styles.requestStatusText, { color }]}>{requestStatusLabel(status)}</Text>
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

function initialsFor(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return initials || 'T';
}

function technicianRoleLabel(technician: Technician): string {
  if (technician.licenseCategories.length > 0) {
    return `${technician.licenseCategories.slice(0, 2).join(' / ')} licensed technician`;
  }
  return 'Aviation technician';
}

function availabilityLabel(technician: Technician): string {
  switch (technician.availability.status) {
    case 'available':
      return 'Available now';
    case 'open_to_offers':
      return 'Open to offers';
    case 'unavailable':
      return 'Unavailable';
    default:
      return 'Availability pending';
  }
}

function compactList(items: string[], emptyLabel: string): string {
  if (items.length === 0) return emptyLabel;
  if (items.length <= 2) return items.join(', ');
  return `${items.slice(0, 2).join(', ')} +${items.length - 2}`;
}

function statusLabel(status: Technician['verificationStatus']): string {
  if (status === 'verified') return 'Verified';
  if (status === 'rejected') return 'Rejected';
  return 'Pending review';
}

function requestStatusLabel(status: MatchRequest['status']): string {
  if (status === 'sent') return 'Pending';
  if (status === 'accepted') return 'Accepted';
  return 'Closed';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: ui.page,
  },
  scroll: {
    flex: 1,
  },
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
    fontSize: 12,
    fontWeight: '600',
    color: ui.accent,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: ui.text,
  },
  activityChip: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: ui.surface,
    borderWidth: 1,
    borderColor: ui.border,
  },
  activityChipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: ui.red,
  },
  activityChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSoft,
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
  panel: {
    backgroundColor: ui.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: ui.border,
    padding: spacing.md,
    ...(softShadow ?? {}),
  },
  railPanel: {
    padding: 14,
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
    color: ui.text,
  },
  sectionValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionValueDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: ui.red,
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
  profileRole: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: ui.textSoft,
    marginTop: 2,
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
  subtlePill: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: ui.surfaceSoft,
    borderWidth: 1,
    borderColor: ui.borderSoft,
  },
  subtlePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSoft,
  },
  completenessBlock: {
    marginTop: spacing.md,
  },
  completenessLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  completenessLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textSoft,
  },
  completenessValue: {
    fontSize: 12,
    fontWeight: '700',
    color: ui.accent,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: ui.borderSoft,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: ui.accent,
  },
  profileFacts: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  fact: {
    flex: 1,
    minWidth: 0,
    backgroundColor: ui.surfaceSoft,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: ui.borderSoft,
  },
  factLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: ui.textMuted,
    marginBottom: 3,
  },
  factValue: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.text,
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
  profileActionCopy: {
    minWidth: 0,
  },
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
    position: 'relative',
  },
  metricHalf: {
    width: '48.5%',
  },
  metricFull: {
    width: '100%',
  },
  metricActivityDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ui.red,
  },
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
  railActions: {
    gap: spacing.sm,
  },
  actionHalf: {
    width: '48.5%',
  },
  actionFull: {
    width: '100%',
  },
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
    position: 'relative',
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
  unreadDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ui.red,
    zIndex: 2,
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
  actionRightPrimary: {
    alignSelf: 'flex-end',
  },
  chevron: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '700',
    color: ui.textMuted,
  },

  requestList: {
    gap: spacing.sm,
  },
  requestRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: ui.surfaceSoft,
    borderWidth: 1,
    borderColor: ui.borderSoft,
  },
  requestCompanyMark: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: ui.navy,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  requestCopy: {
    flex: 1,
    minWidth: 0,
  },
  requestTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requestTitle: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: ui.text,
  },
  requestMessage: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: ui.textSoft,
    marginTop: 4,
  },
  requestDate: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: ui.textMuted,
    marginTop: 6,
  },
  requestStatus: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  requestStatusText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
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
  emptyRecentText: {
    fontSize: 12,
    lineHeight: 17,
    color: ui.textSoft,
    fontWeight: '600',
    marginTop: 4,
  },
  switchBtn: {
    marginTop: 2,
  },
});
