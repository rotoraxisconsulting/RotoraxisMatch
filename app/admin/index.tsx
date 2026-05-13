import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { useDemoSession } from '../../src/state/useDemoSession';
import { useAdminDashboard } from '../../src/state/useAdminDashboard';
import { colors, spacing } from '../../src/theme';

export default function AdminDashboard() {
  const router = useRouter();
  const { clearSession } = useDemoSession();
  const { metrics, loading } = useAdminDashboard();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  async function handleSwitchRole() {
    await clearSession();
    router.replace('/');
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Admin Panel' }} />
        <LoadingScreen color={colors.admin} role="admin" />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Admin Panel' }} />
      <DemoModeBanner role="admin" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header card */}
        <Card style={styles.headerCard} elevated>
          <View style={[styles.headerIcon, { backgroundColor: colors.admin + '18' }]}>
            <Text style={styles.headerEmoji}>⚙️</Text>
          </View>
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>Platform Admin</Text>
            <Text style={styles.headerSub}>
              Verify technicians, companies and documents
            </Text>
          </View>
        </Card>

        {/* Metrics grid */}
        <View style={styles.metricsGrid}>
          <MetricCell
            value={metrics.totalTechnicians}
            label="Technicians"
            color={colors.blue}
          />
          <MetricCell
            value={metrics.verifiedTechnicians}
            label="Verified techs"
            color={colors.success}
          />
          <MetricCell
            value={metrics.pendingTechnicians}
            label="Pending techs"
            color={metrics.pendingTechnicians > 0 ? colors.warning : colors.textMuted}
            highlight={metrics.pendingTechnicians > 0}
          />
          <MetricCell
            value={metrics.totalCompanies}
            label="Companies"
            color={colors.cyan}
          />
          <MetricCell
            value={metrics.pendingDocuments}
            label="Docs pending"
            color={metrics.pendingDocuments > 0 ? colors.warning : colors.success}
            highlight={metrics.pendingDocuments > 0}
          />
          <MetricCell
            value={metrics.totalRequests}
            label="Requests"
            color={colors.admin}
          />
        </View>

        {/* Navigation grid */}
        <View style={styles.navGrid}>
          <AdminNavCard
            icon="👷"
            label="Technicians"
            subtitle={`${metrics.totalTechnicians} total`}
            badge={metrics.pendingTechnicians > 0 ? metrics.pendingTechnicians : undefined}
            accentColor={colors.blue}
            onPress={() => router.push('/admin/technicians' as any)}
          />
          <AdminNavCard
            icon="🏢"
            label="Companies"
            subtitle={`${metrics.totalCompanies} total`}
            badge={metrics.pendingCompanies > 0 ? metrics.pendingCompanies : undefined}
            accentColor={colors.cyan}
            onPress={() => router.push('/admin/companies' as any)}
          />
          <AdminNavCard
            icon="📄"
            label="Documents"
            subtitle={`${metrics.totalDocuments} total`}
            badge={metrics.pendingDocuments > 0 ? metrics.pendingDocuments : undefined}
            accentColor={colors.warning}
            onPress={() => router.push('/admin/documents' as any)}
          />
          <AdminNavCard
            icon="📋"
            label="Requests"
            subtitle={`${metrics.acceptedRequests}/${metrics.totalRequests} accepted`}
            accentColor={colors.admin}
            onPress={() => router.push('/admin/requests' as any)}
          />
        </View>

        <Button
          label="Switch role"
          onPress={handleSwitchRole}
          variant="ghost"
          fullWidth
          style={styles.switchBtn}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCell({
  value,
  label,
  color,
  highlight,
}: {
  value: number;
  label: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.metricCell, highlight && styles.metricCellHighlight]}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function AdminNavCard({
  icon,
  label,
  subtitle,
  badge,
  accentColor,
  onPress,
}: {
  icon: string;
  label: string;
  subtitle: string;
  badge?: number;
  accentColor: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.navCard}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.navIconWrap, { backgroundColor: accentColor + '15' }]}>
        <Text style={styles.navIcon}>{icon}</Text>
      </View>
      <View style={styles.navContent}>
        <Text style={styles.navLabel}>{label}</Text>
        <Text style={styles.navSub}>{subtitle}</Text>
        {badge !== undefined && badge > 0 ? (
          <View style={[styles.pendingPill, { backgroundColor: colors.warning + '22' }]}>
            <Text style={[styles.pendingPillText, { color: colors.warning }]}>
              {badge} pending
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.navArrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  contentWide: {
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerEmoji: { fontSize: 26 },
  headerTextBlock: { flex: 1 },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 13,
    color: colors.textSecondary,
  },

  // Metrics
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metricCell: {
    width: '30.5%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 3,
  },
  metricCellHighlight: {
    borderColor: colors.warning + '60',
    backgroundColor: colors.warning + '06',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  metricLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Nav cards
  navGrid: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  navIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  navIcon: { fontSize: 22 },
  navContent: { flex: 1 },
  navLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 1,
  },
  navSub: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  navArrow: {
    fontSize: 20,
    color: colors.textMuted,
    fontWeight: '300',
  },
  pendingPill: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  pendingPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  switchBtn: {
    marginTop: spacing.xs,
  },
});
