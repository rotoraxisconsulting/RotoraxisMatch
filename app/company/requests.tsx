import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { MatchRequestCard } from '../../src/components/MatchRequestCard';
import { EmptyState } from '../../src/components/EmptyState';
import { useCompanyDashboard } from '../../src/state/useCompanyDashboard';
import { MatchRequest } from '../../src/types';
import { colors, spacing } from '../../src/theme';

type StatusFilter = 'all' | 'sent' | 'accepted' | 'rejected';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Sent' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
];

function filterRequests(reqs: MatchRequest[], status: StatusFilter): MatchRequest[] {
  if (status === 'all') return reqs;
  return reqs.filter((r) => r.status === status);
}

export default function RequestsScreen() {
  const { requests, technicianMap, refresh } = useCompanyDashboard();
  const [activeTab, setActiveTab] = useState<StatusFilter>('all');

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const sortedRequests = [...requests].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const filtered = filterRequests(sortedRequests, activeTab);

  const tabCounts: Record<StatusFilter, number> = {
    all: requests.length,
    sent: requests.filter((r) => r.status === 'sent').length,
    accepted: requests.filter((r) => r.status === 'accepted').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  };

  const emptyIcons: Record<StatusFilter, string> = {
    all: '📋',
    sent: '📤',
    accepted: '✅',
    rejected: '✕',
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Sent Requests' }} />
      <DemoModeBanner role="company" />

      {/* Status tab bar */}
      <View style={styles.tabBar}>
        {STATUS_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {tabCounts[tab.key] > 0 && (
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                    {tabCounts[tab.key]}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            title={activeTab === 'all' ? 'No requests yet' : `No ${activeTab} requests`}
            subtitle={
              activeTab === 'all'
                ? 'Search for technicians and send your first contact request.'
                : `You have no ${activeTab} requests at this time.`
            }
            icon={emptyIcons[activeTab]}
          />
        }
        renderItem={({ item }) => (
          <MatchRequestCard
            request={item}
            technician={technicianMap[item.technicianId]}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    gap: 5,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.blue,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.blue,
    fontWeight: '700',
  },
  tabBadge: {
    backgroundColor: colors.borderLight,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeActive: {
    backgroundColor: colors.blue + '1A',
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabBadgeTextActive: {
    color: colors.blue,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
});
