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
import { useTechnicianDashboard, DEMO_TECHNICIAN_ID } from '../../src/state/useTechnicianDashboard';
import { chatRepository } from '../../src/repositories/v2/chatRepository';
import { offerRequestRepository } from '../../src/repositories/v2/offerRequestRepository';
import { offerApplicationRepository } from '../../src/repositories/v2/offerApplicationRepository';
import { activityRepository } from '../../src/repositories/v2/activityRepository';
import { colors, spacing, typography } from '../../src/theme';

export default function TechnicianDashboard() {
  const router = useRouter();
  const { clearSession } = useDemoSession();
  const { technician, documents, loading } = useTechnicianDashboard();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const [chatCount, setChatCount] = useState(0);
  const [pendingDirectOffers, setPendingDirectOffers] = useState(0);
  const [pendingApplications, setPendingApplications] = useState(0);
  const [unreadDirectOffers, setUnreadDirectOffers] = useState(0);
  const [unreadBrowseOffers, setUnreadBrowseOffers] = useState(0);

  useEffect(() => {
    chatRepository.getRoomsForTechnician(DEMO_TECHNICIAN_ID).then((rooms) => {
      setChatCount(rooms.length);
    });
    offerRequestRepository.getForTechnician(DEMO_TECHNICIAN_ID).then((reqs) => {
      setPendingDirectOffers(reqs.filter((r) => r.status === 'pending').length);
    });
    offerApplicationRepository.getForTechnician(DEMO_TECHNICIAN_ID).then((apps) => {
      setPendingApplications(apps.filter((a) => a.status === 'pending').length);
    });
    activityRepository.getUnreadCount('technician', DEMO_TECHNICIAN_ID, ['direct_offer_received']).then(setUnreadDirectOffers);
    activityRepository.getUnreadCount('technician', DEMO_TECHNICIAN_ID, ['application_accepted', 'application_rejected']).then(setUnreadBrowseOffers);
  }, []);

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
          <MetricCard value={pendingDirectOffers} label="Direct Offers" color={colors.warning} />
          <View style={styles.metricGap} />
          <MetricCard value={pendingApplications} label="Applications" color={colors.success} />
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
            icon="📩"
            label="Direct Offers"
            subtitle={
              pendingDirectOffers > 0
                ? `${pendingDirectOffers} pending`
                : 'Offers sent directly to you'
            }
            accentColor={unreadDirectOffers > 0 ? colors.error : pendingDirectOffers > 0 ? colors.warning : colors.blue}
            badge={unreadDirectOffers > 0 ? unreadDirectOffers : undefined}
            onPress={() => router.push('/technician/direct-offers' as any)}
            style={styles.navCardHalf}
          />
          <NavCard
            icon="🔭"
            label="Browse Offers"
            subtitle="Discover matching job offers"
            accentColor={unreadBrowseOffers > 0 ? colors.error : colors.success}
            badge={unreadBrowseOffers > 0 ? unreadBrowseOffers : undefined}
            onPress={() => router.push('/technician/offers' as any)}
            style={styles.navCardHalf}
          />
          <NavCard
            icon="📄"
            label="My Documents"
            subtitle={`${documents.length} document${documents.length !== 1 ? 's' : ''} on file`}
            accentColor={colors.navy}
            onPress={() => router.push('/technician/documents' as any)}
            style={styles.navCardHalf}
          />
          <NavCard
            icon="💬"
            label="Chats"
            subtitle={chatCount > 0 ? `${chatCount} open conversation${chatCount !== 1 ? 's' : ''}` : 'Accepted contacts only'}
            accentColor={colors.cyan}
            onPress={() => router.push('/technician/chats' as any)}
            style={styles.navCardFull}
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
