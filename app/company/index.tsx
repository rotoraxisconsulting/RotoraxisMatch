import React, { useState, useEffect } from 'react';
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
import { Button } from '../../src/components/Button';
import { useDemoSession } from '../../src/state/useDemoSession';
import { useCompanyDashboard, DEMO_COMPANY_ID } from '../../src/state/useCompanyDashboard';
import { offerApplicationRepository } from '../../src/repositories/v2/offerApplicationRepository';
import { offerRequestRepository } from '../../src/repositories/v2/offerRequestRepository';
import { chatRepository } from '../../src/repositories/v2/chatRepository';
import { activityRepository } from '../../src/repositories/v2/activityRepository';
import { colors, spacing, typography } from '../../src/theme';

export default function CompanyDashboard() {
  const router = useRouter();
  const { clearSession } = useDemoSession();
  const { company, loading } = useCompanyDashboard();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const [pendingApplications, setPendingApplications] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [pendingDirectOffers, setPendingDirectOffers] = useState(0);
  const [unreadApplications, setUnreadApplications] = useState(0);
  const [unreadJobOffers, setUnreadJobOffers] = useState(0);

  useEffect(() => {
    offerApplicationRepository.getForCompany(DEMO_COMPANY_ID).then((apps) => {
      setPendingApplications(apps.filter((a) => a.status === 'pending').length);
    });
    chatRepository.getRoomsForCompany(DEMO_COMPANY_ID).then((rooms) => {
      setChatCount(rooms.length);
    });
    offerRequestRepository.getForCompany(DEMO_COMPANY_ID).then((reqs) => {
      setPendingDirectOffers(reqs.filter((r) => r.status === 'pending').length);
    });
    activityRepository.getUnreadCount('company', DEMO_COMPANY_ID, ['application_received']).then(setUnreadApplications);
    activityRepository.getUnreadCount('company', DEMO_COMPANY_ID, ['direct_offer_accepted', 'direct_offer_rejected']).then(setUnreadJobOffers);
  }, []);

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
          <MetricCard value={pendingApplications} label="Pending apps" color={colors.warning} />
          <View style={styles.metricGap} />
          <MetricCard value={pendingDirectOffers} label="Direct offers" color={colors.blue} />
          <View style={styles.metricGap} />
          <MetricCard value={chatCount} label="Active chats" color={colors.success} />
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
            icon="🏢"
            label="Company Profile"
            subtitle="View your company details"
            accentColor={colors.navy}
            onPress={() => router.push('/company/profile' as any)}
            style={styles.navCardHalf}
          />
          <NavCard
            icon="📋"
            label="Job Offers"
            subtitle="Manage your offers & matches"
            accentColor={unreadJobOffers > 0 ? colors.error : colors.success}
            badge={unreadJobOffers > 0 ? unreadJobOffers : undefined}
            onPress={() => router.push('/company/offers' as any)}
            style={styles.navCardHalf}
          />
          <NavCard
            icon="📥"
            label="Applications"
            subtitle={pendingApplications > 0 ? `${pendingApplications} pending review` : 'Review incoming applications'}
            accentColor={unreadApplications > 0 ? colors.error : pendingApplications > 0 ? colors.warning : colors.blue}
            badge={unreadApplications > 0 ? unreadApplications : undefined}
            onPress={() => router.push('/company/applications' as any)}
            style={styles.navCardHalf}
          />
          <NavCard
            icon="💬"
            label="Chats"
            subtitle={chatCount > 0 ? `${chatCount} open conversation${chatCount !== 1 ? 's' : ''}` : 'Accepted contacts only'}
            accentColor={colors.cyan}
            onPress={() => router.push('/company/chats' as any)}
            style={styles.navCardHalf}
          />
          <NavCard
            icon="👥"
            label="Team"
            subtitle="Manage company members & roles"
            accentColor={colors.navy}
            onPress={() => router.push('/company/team' as any)}
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
