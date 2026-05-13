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
import { useRouter, Stack } from 'expo-router';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { MetricCard } from '../../src/components/MetricCard';
import { SectionHeader } from '../../src/components/SectionHeader';
import { IncomingRequestCard } from '../../src/components/IncomingRequestCard';
import { Button } from '../../src/components/Button';
import { useDemoSession } from '../../src/state/useDemoSession';
import { useTechnicianDashboard } from '../../src/state/useTechnicianDashboard';
import { colors, spacing, typography } from '../../src/theme';

export default function TechnicianDashboard() {
  const router = useRouter();
  const { clearSession } = useDemoSession();
  const { technician, requests, documents, companyMap, loading, acceptRequest, rejectRequest } =
    useTechnicianDashboard();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const pendingCount = requests.filter((r) => r.status === 'sent').length;
  const acceptedCount = requests.filter((r) => r.status === 'accepted').length;
  const recentRequests = requests.slice(0, 3);

  async function handleSwitchRole() {
    await clearSession();
    router.replace('/');
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Dashboard' }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Dashboard' }} />
      <DemoModeBanner role="technician" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile header card */}
        {technician && (
          <Card style={styles.profileCard} elevated>
            <View style={styles.profileRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitial}>
                  {technician.fullName.charAt(0)}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={[typography.h4, styles.profileName]}>{technician.fullName}</Text>
                <Text style={styles.profileCode}>{technician.anonymousCode}</Text>
                <View style={styles.profileBadges}>
                  <Badge
                    label={technician.verificationStatus}
                    variant={technician.verificationStatus === 'verified' ? 'success' : 'warning'}
                    small
                  />
                  <Badge
                    label={`${technician.yearsExperience} yrs exp`}
                    variant="muted"
                    small
                  />
                </View>
              </View>
            </View>

            {/* Profile completeness bar */}
            <View style={styles.completenessRow}>
              <View style={styles.completenessLabelRow}>
                <Text style={styles.completenessLabel}>Profile completeness</Text>
                <Text style={[styles.completenessLabel, { color: colors.technician, fontWeight: '700' }]}>
                  {technician.profileCompleteness}%
                </Text>
              </View>
              <View style={styles.progressBg}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${technician.profileCompleteness}%` as any },
                  ]}
                />
              </View>
            </View>
          </Card>
        )}

        {/* Metrics */}
        <View style={styles.metricsRow}>
          <MetricCard value={pendingCount} label="Pending" color={colors.warning} />
          <View style={styles.metricGap} />
          <MetricCard value={acceptedCount} label="Accepted" color={colors.success} />
          <View style={styles.metricGap} />
          <MetricCard value={documents.length} label="Documents" color={colors.technician} />
        </View>

        {/* Navigation cards */}
        <View style={styles.navGrid}>
          <NavCard
            icon="✏️"
            label="My Profile"
            subtitle="Edit availability & info"
            accentColor={colors.technician}
            onPress={() => router.push('/technician/profile' as any)}
            style={styles.navCardHalf}
          />
          <NavCard
            icon="📨"
            label="Contact Requests"
            subtitle={pendingCount > 0 ? `${pendingCount} pending` : `${requests.length} total`}
            accentColor={pendingCount > 0 ? colors.warning : colors.blue}
            badge={pendingCount > 0 ? pendingCount : undefined}
            onPress={() => router.push('/technician/requests' as any)}
            style={styles.navCardHalf}
          />
          <NavCard
            icon="📄"
            label="My Documents"
            subtitle={`${documents.length} document${documents.length !== 1 ? 's' : ''} on file`}
            accentColor={colors.navy}
            onPress={() => router.push('/technician/documents' as any)}
            style={styles.navCardFull}
          />
        </View>

        {/* Recent requests */}
        {recentRequests.length > 0 && (
          <>
            <SectionHeader
              title="Recent Requests"
              subtitle="Latest contact requests from companies"
              action={
                requests.length > 3
                  ? { label: 'View all', onPress: () => router.push('/technician/requests' as any) }
                  : undefined
              }
            />
            {recentRequests.map((req) => (
              <IncomingRequestCard
                key={req.id}
                request={req}
                company={companyMap[req.companyId]}
                onAccept={() => acceptRequest(req.id)}
                onReject={() => rejectRequest(req.id)}
              />
            ))}
          </>
        )}

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

function NavCard({
  icon,
  label,
  subtitle,
  accentColor,
  badge,
  onPress,
  style,
}: {
  icon: string;
  label: string;
  subtitle: string;
  accentColor: string;
  badge?: number;
  onPress: () => void;
  style?: object;
}) {
  return (
    <TouchableOpacity
      style={[navStyles.card, style]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[navStyles.iconWrap, { backgroundColor: accentColor + '15' }]}>
        <Text style={navStyles.icon}>{icon}</Text>
      </View>
      <View style={navStyles.content}>
        <Text style={navStyles.label}>{label}</Text>
        <Text style={navStyles.subtitle}>{subtitle}</Text>
      </View>
      {badge !== undefined && badge > 0 ? (
        <View style={[navStyles.badge, { backgroundColor: accentColor }]}>
          <Text style={navStyles.badgeText}>{badge}</Text>
        </View>
      ) : (
        <Text style={navStyles.arrow}>›</Text>
      )}
    </TouchableOpacity>
  );
}

const navStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  icon: { fontSize: 20 },
  content: { flex: 1 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 1,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  arrow: {
    fontSize: 20,
    color: colors.textMuted,
    fontWeight: '300',
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
  },
});

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
  profileCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.technician,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    marginBottom: 0,
  },
  profileCode: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  profileBadges: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  completenessRow: {
    gap: spacing.xs,
  },
  completenessLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  completenessLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  progressBg: {
    height: 6,
    backgroundColor: colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.technician,
    borderRadius: 3,
  },
  metricsRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  metricGap: { width: spacing.sm },
  navGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  navCardHalf: {
    width: '47.5%',
  },
  navCardFull: {
    width: '100%',
  },
  switchBtn: {
    marginTop: spacing.md,
  },
});
