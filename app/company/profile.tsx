import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Stack } from 'expo-router';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { MetricCard } from '../../src/components/MetricCard';
import { SectionHeader } from '../../src/components/SectionHeader';
import { useCompanyDashboard } from '../../src/state/useCompanyDashboard';
import { colors, spacing, typography } from '../../src/theme';

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileRow}>
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={styles.profileValue}>{value}</Text>
    </View>
  );
}

export default function CompanyProfileScreen() {
  const { company, requests, loading } = useCompanyDashboard();

  if (loading || !company) {
    return (
      <>
        <Stack.Screen options={{ title: 'Company Profile' }} />
        <LoadingScreen color={colors.blue} role="company" />
      </>
    );
  }

  const acceptedCount = requests.filter((r) => r.status === 'accepted').length;
  const sentCount = requests.filter((r) => r.status === 'sent').length;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Company Profile' }} />
      <DemoModeBanner role="company" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <Card style={styles.heroCard} elevated>
          <View style={styles.heroHeader}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {company.companyName.charAt(0)}
              </Text>
            </View>
            <View style={styles.heroInfo}>
              <Text style={[typography.h3, styles.heroName]}>{company.companyName}</Text>
              <Text style={styles.heroMeta}>{company.city}, {company.country}</Text>
            </View>
          </View>
          <View style={styles.heroBadges}>
            <Badge
              label={company.companyType.charAt(0).toUpperCase() + company.companyType.slice(1)}
              variant="navy"
            />
            <Badge
              label={company.verificationStatus}
              variant={company.verificationStatus === 'verified' ? 'success' : 'warning'}
            />
          </View>
        </Card>

        {/* Company details */}
        <SectionHeader title="Company Details" />
        <Card style={styles.detailsCard}>
          <ProfileRow label="Company name" value={company.companyName} />
          <View style={styles.divider} />
          <ProfileRow label="Type" value={company.companyType} />
          <View style={styles.divider} />
          <ProfileRow label="Country" value={company.country} />
          <View style={styles.divider} />
          <ProfileRow label="City" value={company.city} />
          <View style={styles.divider} />
          <ProfileRow label="Contact email" value={company.contactEmail} />
          <View style={styles.divider} />
          <ProfileRow label="Website" value={company.website} />
        </Card>

        {/* Activity summary */}
        <SectionHeader title="Activity" style={styles.sectionGap} />
        <View style={styles.activityRow}>
          <MetricCard value={requests.length} label="Requests sent" color={colors.blue} />
          <View style={styles.activityGap} />
          <MetricCard value={acceptedCount} label="Accepted" color={colors.success} />
          <View style={styles.activityGap} />
          <MetricCard value={sentCount} label="Awaiting reply" color={colors.warning} />
        </View>

        {/* Demo notice */}
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Demo mode · This profile represents {company.companyName} for demonstration
            purposes. Profile editing will be available in a future release.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  heroCard: {
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
  },
  heroInfo: { flex: 1 },
  heroName: { marginBottom: 2 },
  heroMeta: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  heroBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  detailsCard: {
    marginBottom: spacing.md,
    padding: 0,
    overflow: 'hidden',
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  profileLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
    flex: 1,
  },
  profileValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.md,
  },
  sectionGap: {
    marginTop: spacing.md,
  },
  activityRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  activityGap: {
    width: spacing.sm,
  },
  notice: {
    backgroundColor: colors.borderLight,
    borderRadius: 10,
    padding: spacing.md,
  },
  noticeText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
  },
});
