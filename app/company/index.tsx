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
import { MatchRequestCard } from '../../src/components/MatchRequestCard';
import { Button } from '../../src/components/Button';
import { useDemoSession } from '../../src/state/useDemoSession';
import { useCompanyDashboard } from '../../src/state/useCompanyDashboard';
import { colors, spacing, typography } from '../../src/theme';

export default function CompanyDashboard() {
  const router = useRouter();
  const { clearSession } = useDemoSession();
  const { company, requests, technicianMap, loading } = useCompanyDashboard();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const sentCount = requests.filter((r) => r.status === 'sent').length;
  const acceptedCount = requests.filter((r) => r.status === 'accepted').length;
  const recentRequests = [...requests]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  async function handleSwitchRole() {
    await clearSession();
    router.replace('/');
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Dashboard' }} />
        <LoadingScreen color={colors.blue} role="company" />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Dashboard' }} />
      <DemoModeBanner role="company" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        {/* Company header card */}
        {company && (
          <Card style={styles.companyCard} elevated>
            <View style={styles.companyRow}>
              <View style={styles.companyAvatar}>
                <Text style={styles.companyAvatarText}>
                  {company.companyName.charAt(0)}
                </Text>
              </View>
              <View style={styles.companyInfo}>
                <Text style={[typography.h4, styles.companyName]}>{company.companyName}</Text>
                <Text style={styles.companyMeta}>{company.city}, {company.country}</Text>
              </View>
              <View style={styles.companyBadges}>
                <Badge
                  label={company.companyType.charAt(0).toUpperCase() + company.companyType.slice(1)}
                  variant="navy"
                />
                <Badge
                  label={company.verificationStatus}
                  variant={company.verificationStatus === 'verified' ? 'success' : 'warning'}
                />
              </View>
            </View>
          </Card>
        )}

        {/* Metrics */}
        <View style={styles.metricsRow}>
          <MetricCard value={requests.length} label="Total sent" color={colors.blue} />
          <View style={styles.metricGap} />
          <MetricCard value={sentCount} label="Awaiting reply" color={colors.warning} />
          <View style={styles.metricGap} />
          <MetricCard value={acceptedCount} label="Accepted" color={colors.success} />
        </View>

        {/* Navigation cards */}
        <View style={styles.navGrid}>
          <NavCard
            icon="🔍"
            label="Search Technicians"
            subtitle="Filter by license, aircraft & more"
            accentColor={colors.blue}
            onPress={() => router.push('/company/search' as any)}
            style={styles.navCardHalf}
          />
          <NavCard
            icon="📋"
            label="Sent Requests"
            subtitle={`${requests.length} request${requests.length !== 1 ? 's' : ''} total`}
            accentColor={colors.warning}
            onPress={() => router.push('/company/requests' as any)}
            style={styles.navCardHalf}
          />
          <NavCard
            icon="🏢"
            label="Company Profile"
            subtitle="View your company details"
            accentColor={colors.navy}
            onPress={() => router.push('/company/profile' as any)}
            style={styles.navCardHalf}
          />
          <NavCard
            icon="🗺️"
            label="Technician Map"
            subtitle="Browse technicians by location"
            accentColor={colors.technician}
            onPress={() => router.push('/map' as any)}
            style={styles.navCardHalf}
          />
        </View>

        {/* Recent requests */}
        {recentRequests.length > 0 && (
          <>
            <SectionHeader
              title="Recent Requests"
              subtitle="Your latest contact requests"
              action={{
                label: 'View all',
                onPress: () => router.push('/company/requests' as any),
              }}
            />
            {recentRequests.map((req) => (
              <MatchRequestCard
                key={req.id}
                request={req}
                technician={technicianMap[req.technicianId]}
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
  onPress,
  style,
}: {
  icon: string;
  label: string;
  subtitle: string;
  accentColor: string;
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
      <Text style={navStyles.arrow}>›</Text>
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
  companyCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  companyAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  companyAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  companyInfo: { flex: 1 },
  companyName: { marginBottom: 1 },
  companyMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  companyBadges: {
    alignItems: 'flex-end',
    gap: 4,
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
  switchBtn: {
    marginTop: spacing.md,
  },
});
