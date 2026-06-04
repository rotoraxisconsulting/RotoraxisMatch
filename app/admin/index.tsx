import React, { useEffect, useState } from 'react';
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
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { useAuth } from '../../src/auth/AuthContext';
import { useSession } from '../../src/state/SessionContext';
import { supabase } from '../../src/lib/supabase';
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

type SupabaseAdminMetrics = {
  totalProfiles: number;
  pendingProfiles: number;
  activeProfiles: number;
  totalTechnicians: number;
  pendingTechnicians: number;
  verifiedTechnicians: number;
  totalCompanies: number;
  pendingCompanies: number;
  verifiedCompanies: number;
};

export default function AdminDashboard() {
  const router = useRouter();
  const { profile, loading: authLoading, signOut } = useAuth();
  const { sessionLoading } = useSession();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isNarrow = width < 430;

  const [supaMetrics, setSupaMetrics] = useState<SupabaseAdminMetrics>({
    totalProfiles: 0,
    pendingProfiles: 0,
    activeProfiles: 0,
    totalTechnicians: 0,
    pendingTechnicians: 0,
    verifiedTechnicians: 0,
    totalCompanies: 0,
    pendingCompanies: 0,
    verifiedCompanies: 0,
  });
  const [metricsLoading, setMetricsLoading] = useState(true);

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
    Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending_verification'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'technician'),
      supabase.from('technician_profiles').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
      supabase.from('technician_profiles').select('id', { count: 'exact', head: true }).eq('verification_status', 'verified'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'company_user'),
      supabase.from('companies').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
      supabase.from('companies').select('id', { count: 'exact', head: true }).eq('verification_status', 'verified'),
    ]).then(([total, pending, active, techTotal, techPending, techVerified, compTotal, compPending, compVerified]) => {
      setSupaMetrics({
        totalProfiles: total.count ?? 0,
        pendingProfiles: pending.count ?? 0,
        activeProfiles: active.count ?? 0,
        totalTechnicians: techTotal.count ?? 0,
        pendingTechnicians: techPending.count ?? 0,
        verifiedTechnicians: techVerified.count ?? 0,
        totalCompanies: compTotal.count ?? 0,
        pendingCompanies: compPending.count ?? 0,
        verifiedCompanies: compVerified.count ?? 0,
      });
      setMetricsLoading(false);
    });
  }, [profile?.id]);

  async function handleSignOut() {
    await signOut();
    router.replace('/');
  }

  if (authLoading || sessionLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={adminUi.accent} />
      </>
    );
  }

  const pendingWorkload = supaMetrics.pendingProfiles;
  const rejectedTechnicians = 0;
  const rejectedCompanies = 0;
  const draftOffers = 0;
  const verifiedDocuments = 0;
  const rejectedOrExpiredDocuments = 0;

  const technicianMetrics: MetricConfig[] = [
    {
      label: 'Total technicians',
      value: supaMetrics.totalTechnicians,
      detail: 'Registered profiles',
      icon: Users,
      tone: adminUi.blue,
      softTone: adminUi.blueSoft,
    },
    {
      label: 'Pending technicians',
      value: supaMetrics.pendingTechnicians,
      detail: 'Need verification',
      icon: Clock,
      tone: supaMetrics.pendingTechnicians > 0 ? adminUi.amber : adminUi.textSoft,
      softTone: supaMetrics.pendingTechnicians > 0 ? adminUi.amberSoft : adminUi.surfaceSoft,
      urgent: supaMetrics.pendingTechnicians > 0,
    },
    {
      label: 'Verified technicians',
      value: supaMetrics.verifiedTechnicians,
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
      tone: adminUi.textSoft,
      softTone: adminUi.surfaceSoft,
    },
  ];

  const companyMetrics: MetricConfig[] = [
    {
      label: 'Total companies',
      value: supaMetrics.totalCompanies,
      detail: 'Marketplace buyers',
      icon: Building2,
      tone: adminUi.accent,
      softTone: adminUi.accentSoft,
    },
    {
      label: 'Pending companies',
      value: supaMetrics.pendingCompanies,
      detail: 'Awaiting review',
      icon: Clock,
      tone: supaMetrics.pendingCompanies > 0 ? adminUi.amber : adminUi.textSoft,
      softTone: supaMetrics.pendingCompanies > 0 ? adminUi.amberSoft : adminUi.surfaceSoft,
      urgent: supaMetrics.pendingCompanies > 0,
    },
    {
      label: 'Verified companies',
      value: supaMetrics.verifiedCompanies,
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
      tone: adminUi.textSoft,
      softTone: adminUi.surfaceSoft,
    },
  ];

  const marketplaceMetrics: MetricConfig[] = [
    {
      label: 'Published offers',
      value: 0,
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
      value: 0,
      detail: 'Technician initiated',
      icon: ClipboardCheck,
      tone: adminUi.accent,
      softTone: adminUi.accentSoft,
    },
    {
      label: 'Pending direct offers',
      value: 0,
      detail: 'Company initiated',
      icon: Inbox,
      tone: adminUi.blue,
      softTone: adminUi.blueSoft,
    },
  ];

  const complianceMetrics: MetricConfig[] = [
    {
      label: 'Pending documents',
      value: 0,
      detail: 'Review queue',
      icon: Clock,
      tone: adminUi.textSoft,
      softTone: adminUi.surfaceSoft,
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
      tone: adminUi.textSoft,
      softTone: adminUi.surfaceSoft,
    },
  ];

  const actions: ActionConfig[] = [
    {
      label: 'Technicians',
      subtitle: `${supaMetrics.totalTechnicians} profiles — ${supaMetrics.pendingTechnicians} pending`,
      icon: Users,
      tone: adminUi.blue,
      softTone: adminUi.blueSoft,
      badge: supaMetrics.pendingTechnicians,
      onPress: () => router.push('/admin/technicians' as any),
    },
    {
      label: 'Companies',
      subtitle: `${supaMetrics.totalCompanies} organizations — ${supaMetrics.pendingCompanies} pending`,
      icon: Building2,
      tone: adminUi.accent,
      softTone: adminUi.accentSoft,
      badge: supaMetrics.pendingCompanies,
      onPress: () => router.push('/admin/companies' as any),
    },
    {
      label: 'Documents',
      subtitle: 'Review uploaded documents',
      icon: Files,
      tone: adminUi.amber,
      softTone: adminUi.amberSoft,
      onPress: () => router.push('/admin/documents' as any),
    },
    {
      label: 'Offers',
      subtitle: 'Moderate marketplace offers',
      icon: BriefcaseBusiness,
      tone: adminUi.navy,
      softTone: adminUi.surfaceSoft,
      onPress: () => router.push('/admin/offers' as any),
    },
    {
      label: 'Requests & Applications',
      subtitle: 'Direct offers and applications',
      icon: ClipboardCheck,
      tone: adminUi.green,
      softTone: adminUi.greenSoft,
      onPress: () => router.push('/admin/requests' as any),
    },
  ];

  return (
    <AdminScreen>
      <Stack.Screen options={{ headerShown: false }} />
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
                Live Supabase data. Review queues grouped by users, marketplace flow and compliance state.
              </Text>
            </View>
          </View>
          <View style={styles.summaryStats}>
            <SummaryPill label="Pending" value={supaMetrics.pendingProfiles} tone={supaMetrics.pendingProfiles > 0 ? 'warning' : 'success'} />
            <SummaryPill label="Active" value={supaMetrics.activeProfiles} tone="success" />
            <SummaryPill label="Total" value={supaMetrics.totalProfiles} tone="info" />
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

        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.75}
        >
          <Text style={styles.signOutBtnText}>Sign out</Text>
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
  signOutBtn: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: adminUi.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  signOutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: adminUi.red,
  },
});
