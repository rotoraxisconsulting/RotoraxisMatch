import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileCheck,
  Files,
  Inbox,
  Radio,
  ShieldCheck,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { useDemoSession } from '../../src/state/useDemoSession';
import { useAdminDashboard } from '../../src/state/useAdminDashboard';
import {
  AdminBadge,
  AdminCard,
  AdminIconBox,
  AdminPageHeader,
  AdminScreen,
  adminUi,
} from '../../src/components/admin/AdminUI';
import type { AdminTone } from '../../src/components/admin/AdminUI';
import { spacing } from '../../src/theme';

type MetricConfig = {
  label: string;
  value: number;
  detail: string;
  icon: React.ComponentType<LucideProps>;
  tone: string;
  softTone: string;
  urgent?: boolean;
};

type ActionConfig = {
  label: string;
  subtitle: string;
  icon: React.ComponentType<LucideProps>;
  tone: string;
  softTone: string;
  badge?: number;
  onPress: () => void;
};

export default function AdminDashboard() {
  const router = useRouter();
  const { clearSession } = useDemoSession();
  const { metrics, technicians, companies, documents, offers, loading } = useAdminDashboard();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 430;

  async function handleSwitchRole() {
    await clearSession();
    router.replace('/');
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={adminUi.accent} role="admin" />
      </>
    );
  }

  const pendingWorkload =
    metrics.pendingTechnicians +
    metrics.pendingCompanies +
    metrics.pendingDocuments +
    metrics.pendingOfferRequests +
    metrics.pendingApplications;
  const draftOffers = offers.filter((offer) => offer.status === 'draft').length;
  const verifiedDocuments = documents.filter((document) => document.status === 'verified').length;
  const rejectedOrExpiredDocuments = documents.filter(
    (document) => document.status === 'rejected' || document.status === 'expired',
  ).length;
  const rejectedTechnicians = technicians.filter(
    (technician) => technician.verificationStatus === 'rejected',
  ).length;
  const rejectedCompanies = companies.filter(
    (company) => company.verificationStatus === 'rejected',
  ).length;

  const technicianMetrics: MetricConfig[] = [
    {
      label: 'Total technicians',
      value: metrics.totalTechnicians,
      detail: 'Registered profiles',
      icon: Users,
      tone: adminUi.blue,
      softTone: adminUi.blueSoft,
    },
    {
      label: 'Pending technicians',
      value: metrics.pendingTechnicians,
      detail: 'Need verification',
      icon: Clock,
      tone: metrics.pendingTechnicians > 0 ? adminUi.amber : adminUi.textSoft,
      softTone: metrics.pendingTechnicians > 0 ? adminUi.amberSoft : adminUi.surfaceSoft,
      urgent: metrics.pendingTechnicians > 0,
    },
    {
      label: 'Verified technicians',
      value: metrics.verifiedTechnicians,
      detail: 'Active supply',
      icon: ShieldCheck,
      tone: adminUi.green,
      softTone: adminUi.greenSoft,
    },
    {
      label: 'Rejected technicians',
      value: rejectedTechnicians,
      detail: 'Not cleared',
      icon: XCircle,
      tone: rejectedTechnicians > 0 ? adminUi.red : adminUi.textSoft,
      softTone: rejectedTechnicians > 0 ? adminUi.redSoft : adminUi.surfaceSoft,
      urgent: rejectedTechnicians > 0,
    },
  ];

  const companyMetrics: MetricConfig[] = [
    {
      label: 'Total companies',
      value: metrics.totalCompanies,
      detail: 'Marketplace buyers',
      icon: Building2,
      tone: adminUi.accent,
      softTone: adminUi.accentSoft,
    },
    {
      label: 'Pending companies',
      value: metrics.pendingCompanies,
      detail: 'Awaiting review',
      icon: Clock,
      tone: metrics.pendingCompanies > 0 ? adminUi.amber : adminUi.textSoft,
      softTone: metrics.pendingCompanies > 0 ? adminUi.amberSoft : adminUi.surfaceSoft,
      urgent: metrics.pendingCompanies > 0,
    },
    {
      label: 'Verified companies',
      value: metrics.verifiedCompanies,
      detail: 'Cleared buyers',
      icon: ShieldCheck,
      tone: adminUi.green,
      softTone: adminUi.greenSoft,
    },
    {
      label: 'Rejected companies',
      value: rejectedCompanies,
      detail: 'Not cleared',
      icon: XCircle,
      tone: rejectedCompanies > 0 ? adminUi.red : adminUi.textSoft,
      softTone: rejectedCompanies > 0 ? adminUi.redSoft : adminUi.surfaceSoft,
      urgent: rejectedCompanies > 0,
    },
  ];

  const marketplaceMetrics: MetricConfig[] = [
    {
      label: 'Published offers',
      value: metrics.activeOffers,
      detail: 'Visible roles',
      icon: BriefcaseBusiness,
      tone: adminUi.green,
      softTone: adminUi.greenSoft,
    },
    {
      label: 'Draft offers',
      value: draftOffers,
      detail: 'Not public',
      icon: Files,
      tone: adminUi.textSoft,
      softTone: adminUi.surfaceSoft,
    },
    {
      label: 'Pending applications',
      value: metrics.pendingApplications,
      detail: 'Technician initiated',
      icon: ClipboardCheck,
      tone: metrics.pendingApplications > 0 ? adminUi.amber : adminUi.accent,
      softTone: metrics.pendingApplications > 0 ? adminUi.amberSoft : adminUi.accentSoft,
      urgent: metrics.pendingApplications > 0,
    },
    {
      label: 'Pending direct offers',
      value: metrics.pendingOfferRequests,
      detail: 'Company initiated',
      icon: Inbox,
      tone: metrics.pendingOfferRequests > 0 ? adminUi.amber : adminUi.blue,
      softTone: metrics.pendingOfferRequests > 0 ? adminUi.amberSoft : adminUi.blueSoft,
      urgent: metrics.pendingOfferRequests > 0,
    },
  ];

  const complianceMetrics: MetricConfig[] = [
    {
      label: 'Pending documents',
      value: metrics.pendingDocuments,
      detail: 'Review queue',
      icon: Clock,
      tone: metrics.pendingDocuments > 0 ? adminUi.amber : adminUi.textSoft,
      softTone: metrics.pendingDocuments > 0 ? adminUi.amberSoft : adminUi.surfaceSoft,
      urgent: metrics.pendingDocuments > 0,
    },
    {
      label: 'Verified documents',
      value: verifiedDocuments,
      detail: 'Cleared records',
      icon: FileCheck,
      tone: adminUi.green,
      softTone: adminUi.greenSoft,
    },
    {
      label: 'Rejected or expired',
      value: rejectedOrExpiredDocuments,
      detail: 'Compliance attention',
      icon: XCircle,
      tone: rejectedOrExpiredDocuments > 0 ? adminUi.red : adminUi.textSoft,
      softTone: rejectedOrExpiredDocuments > 0 ? adminUi.redSoft : adminUi.surfaceSoft,
      urgent: rejectedOrExpiredDocuments > 0,
    },
  ];

  const actions: ActionConfig[] = [
    {
      label: 'Technicians',
      subtitle: `${metrics.totalTechnicians} profiles - ${metrics.pendingTechnicians} pending`,
      icon: Users,
      tone: adminUi.blue,
      softTone: adminUi.blueSoft,
      badge: metrics.pendingTechnicians,
      onPress: () => router.push('/admin/technicians' as any),
    },
    {
      label: 'Companies',
      subtitle: `${metrics.totalCompanies} organizations - ${metrics.pendingCompanies} pending`,
      icon: Building2,
      tone: adminUi.accent,
      softTone: adminUi.accentSoft,
      badge: metrics.pendingCompanies,
      onPress: () => router.push('/admin/companies' as any),
    },
    {
      label: 'Documents',
      subtitle: `${metrics.totalDocuments} records - ${metrics.pendingDocuments} pending`,
      icon: Files,
      tone: adminUi.amber,
      softTone: adminUi.amberSoft,
      badge: metrics.pendingDocuments,
      onPress: () => router.push('/admin/documents' as any),
    },
    {
      label: 'Offers',
      subtitle: `${metrics.totalOffers} offers - ${metrics.activeOffers} published`,
      icon: BriefcaseBusiness,
      tone: adminUi.navy,
      softTone: adminUi.surfaceSoft,
      onPress: () => router.push('/admin/offers' as any),
    },
    {
      label: 'Requests & Applications',
      subtitle: `${metrics.totalDirectOffers} direct - ${metrics.totalApplicationsV2} applications`,
      icon: ClipboardCheck,
      tone: adminUi.green,
      softTone: adminUi.greenSoft,
      badge: metrics.pendingOfferRequests + metrics.pendingApplications,
      onPress: () => router.push('/admin/requests' as any),
    },
  ];

  return (
    <AdminScreen>
      <Stack.Screen options={{ headerShown: false }} />
      <DemoModeBanner role="admin" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        <AdminPageHeader
          eyebrow="Admin Console"
          title="Operations control room"
          subtitle="Moderate aviation talent, company demand, compliance records and marketplace activity."
          right={
            pendingWorkload > 0 ? (
              <AdminBadge label={`${pendingWorkload} pending`} tone="warning" />
            ) : (
              <AdminBadge label="Queue clear" tone="success" />
            )
          }
        />

        <AdminCard style={[styles.summaryCard, isWide && styles.summaryCardWide]}>
          <View style={styles.summaryMain}>
            <AdminIconBox
              icon={Radio}
              color={adminUi.accent}
              backgroundColor={adminUi.accentSoft}
              size={22}
            />
            <View style={styles.summaryTextBlock}>
              <Text style={styles.summaryTitle}>Marketplace supervision</Text>
              <Text style={styles.summaryText}>
                Local demo data is active. Review queues are grouped by users, marketplace flow and compliance state.
              </Text>
            </View>
          </View>
          <View style={styles.summaryStats}>
            <SummaryPill label="Workload" value={pendingWorkload} tone={pendingWorkload > 0 ? 'warning' : 'success'} />
            <SummaryPill label="Published" value={metrics.activeOffers} tone="success" />
            <SummaryPill label="Accepted" value={metrics.acceptedRequests} tone="info" />
          </View>
        </AdminCard>

        <View style={styles.sections}>
          <UserMetricSection
            technicianMetrics={technicianMetrics}
            companyMetrics={companyMetrics}
            isWide={isWide}
            isNarrow={isNarrow}
          />
          <MetricSection title="Marketplace" icon={BriefcaseBusiness} metrics={marketplaceMetrics} isNarrow={isNarrow} />
          <MetricSection title="Compliance" icon={ShieldCheck} metrics={complianceMetrics} isNarrow={isNarrow} />
        </View>

        <View style={styles.workspaceHeader}>
          <Text style={styles.sectionEyebrow}>Workspace</Text>
          <Text style={styles.workspaceTitle}>Admin actions</Text>
        </View>
        <View style={[styles.actionGrid, isWide && styles.actionGridWide]}>
          {actions.map((action) => (
            <ActionCard key={action.label} action={action} />
          ))}
        </View>

        <TouchableOpacity style={styles.switchButton} onPress={handleSwitchRole} activeOpacity={0.76}>
          <Text style={styles.switchText}>Switch role</Text>
        </TouchableOpacity>
      </ScrollView>
    </AdminScreen>
  );
}

function UserMetricSection({
  technicianMetrics,
  companyMetrics,
  isWide,
  isNarrow,
}: {
  technicianMetrics: MetricConfig[];
  companyMetrics: MetricConfig[];
  isWide: boolean;
  isNarrow: boolean;
}) {
  return (
    <AdminCard style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <AdminIconBox icon={Users} size={18} color={adminUi.accent} backgroundColor={adminUi.accentSoft} />
        <Text style={styles.sectionTitle}>Users</Text>
      </View>
      <View style={[styles.userGroupGrid, isWide && styles.userGroupGridWide]}>
        <UserMetricGroup
          title="Technician profiles"
          subtitle="Registered talent profiles"
          icon={UserRound}
          metrics={technicianMetrics}
          isNarrow={isNarrow}
        />
        <UserMetricGroup
          title="Company accounts"
          subtitle="Marketplace buyers and operators"
          icon={Building2}
          metrics={companyMetrics}
          isNarrow={isNarrow}
        />
      </View>
    </AdminCard>
  );
}

function UserMetricGroup({
  title,
  subtitle,
  icon,
  metrics,
  isNarrow,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<LucideProps>;
  metrics: MetricConfig[];
  isNarrow: boolean;
}) {
  return (
    <View style={styles.userGroup}>
      <View style={styles.userGroupHeader}>
        <AdminIconBox icon={icon} size={17} color={adminUi.accent} backgroundColor={adminUi.accentSoft} />
        <View style={styles.userGroupTitleBlock}>
          <Text style={styles.userGroupTitle}>{title}</Text>
          <Text style={styles.userGroupSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.metricGrid}>
        {metrics.map((metric) => (
          <MetricTile key={metric.label} metric={metric} isNarrow={isNarrow} compact />
        ))}
      </View>
    </View>
  );
}

function MetricSection({
  title,
  icon,
  metrics,
  isNarrow,
}: {
  title: string;
  icon: React.ComponentType<LucideProps>;
  metrics: MetricConfig[];
  isNarrow: boolean;
}) {
  return (
    <AdminCard style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <AdminIconBox icon={icon} size={18} color={adminUi.accent} backgroundColor={adminUi.accentSoft} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.metricGrid}>
        {metrics.map((metric) => (
          <MetricTile key={metric.label} metric={metric} isNarrow={isNarrow} />
        ))}
      </View>
    </AdminCard>
  );
}

function MetricTile({
  metric,
  isNarrow,
  compact = false,
}: {
  metric: MetricConfig;
  isNarrow: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.metricTile,
        compact && styles.metricTileCompact,
        isNarrow && styles.metricTileNarrow,
        metric.urgent && styles.metricTileUrgent,
      ]}
    >
      <View style={styles.metricTop}>
        <AdminIconBox icon={metric.icon} size={17} color={metric.tone} backgroundColor={metric.softTone} />
        <Text style={[styles.metricValue, { color: metric.tone }]}>{metric.value}</Text>
      </View>
      <Text style={styles.metricLabel}>{metric.label}</Text>
      <Text style={styles.metricDetail}>{metric.detail}</Text>
    </View>
  );
}

function SummaryPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: AdminTone;
}) {
  return (
    <View style={styles.summaryPill}>
      <AdminBadge label={label} tone={tone} small />
      <Text style={styles.summaryPillValue}>{value}</Text>
    </View>
  );
}

function ActionCard({ action }: { action: ActionConfig }) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={action.onPress} activeOpacity={0.78}>
      <View style={styles.actionIconRow}>
        <AdminIconBox icon={action.icon} color={action.tone} backgroundColor={action.softTone} size={20} />
        {action.badge && action.badge > 0 ? <AdminBadge label={`${action.badge} pending`} tone="warning" small /> : null}
      </View>
      <View style={styles.actionTextBlock}>
        <Text style={styles.actionTitle}>{action.label}</Text>
        <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
      </View>
      <ChevronRight size={18} color={adminUi.textMuted} strokeWidth={2.2} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  summaryCard: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  summaryCardWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  summaryTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: adminUi.text,
  },
  summaryText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: adminUi.textSoft,
  },
  summaryStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryPill: {
    minWidth: 92,
    padding: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminUi.borderSoft,
    backgroundColor: adminUi.surfaceSoft,
    gap: spacing.xs,
  },
  summaryPillValue: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
    color: adminUi.text,
  },
  sections: {
    gap: spacing.md,
  },
  sectionCard: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionEyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: adminUi.accent,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: adminUi.text,
  },
  userGroupGrid: {
    gap: spacing.sm,
  },
  userGroupGridWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  userGroup: {
    flex: 1,
    minWidth: 0,
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: adminUi.borderSoft,
    backgroundColor: adminUi.surfaceSoft,
  },
  userGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  userGroupTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  userGroupTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: adminUi.text,
  },
  userGroupSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: adminUi.textMuted,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: 150,
    borderWidth: 1,
    borderColor: adminUi.borderSoft,
    borderRadius: 16,
    backgroundColor: adminUi.surfaceSoft,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metricTileCompact: {
    flexBasis: 128,
    backgroundColor: adminUi.surface,
  },
  metricTileNarrow: {
    flexBasis: 132,
  },
  metricTileUrgent: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  metricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metricValue: {
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '700',
  },
  metricLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: adminUi.text,
  },
  metricDetail: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: adminUi.textMuted,
  },
  workspaceHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  workspaceTitle: {
    marginTop: 2,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: adminUi.text,
  },
  actionGrid: {
    gap: spacing.sm,
  },
  actionGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionCard: {
    flexGrow: 1,
    flexBasis: 250,
    minHeight: 136,
    backgroundColor: adminUi.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: adminUi.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  actionIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  actionTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: adminUi.text,
  },
  actionSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: adminUi.textSoft,
  },
  switchButton: {
    marginTop: spacing.lg,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminUi.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminUi.surface,
  },
  switchText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: adminUi.textSoft,
  },
});
