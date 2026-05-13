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
import { IncomingRequestCard } from '../../src/components/IncomingRequestCard';
import { EmptyState } from '../../src/components/EmptyState';
import { useTechnicianDashboard } from '../../src/state/useTechnicianDashboard';
import { MatchRequest } from '../../src/types';
import { colors, spacing } from '../../src/theme';

type StatusFilter = 'all' | 'sent' | 'accepted' | 'rejected';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Declined' },
];

function filterRequests(reqs: MatchRequest[], status: StatusFilter): MatchRequest[] {
  if (status === 'all') return reqs;
  return reqs.filter((r) => r.status === status);
}

export default function TechnicianRequestsScreen() {
  const { requests, companyMap, loading, acceptRequest, rejectRequest, refresh } =
    useTechnicianDashboard();
  const [activeTab, setActiveTab] = useState<StatusFilter>('all');

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const filtered = filterRequests(requests, activeTab);

  const tabCounts: Record<StatusFilter, number> = {
    all: requests.length,
    sent: requests.filter((r) => r.status === 'sent').length,
    accepted: requests.filter((r) => r.status === 'accepted').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  };

  const emptyIcons: Record<StatusFilter, string> = {
    all: '📨',
    sent: '⏳',
    accepted: '✅',
    rejected: '❌',
  };

  const emptyMessages: Record<StatusFilter, { title: string; subtitle: string }> = {
    all: {
      title: 'No requests yet',
      subtitle: 'Contact requests from companies will appear here once your profile is live.',
    },
    sent: {
      title: 'No pending requests',
      subtitle: 'You have no requests awaiting your response.',
    },
    accepted: {
      title: 'No accepted requests',
      subtitle: 'Accepted requests will appear here after you respond to them.',
    },
    rejected: {
      title: 'No declined requests',
      subtitle: 'Declined requests will appear here.',
    },
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Contact Requests' }} />
      <DemoModeBanner role="technician" />

      {/* Status tab bar */}
      <View style={styles.tabBar}>
        {STATUS_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tabCounts[tab.key] > 0 && (
              <View
                style={[
                  styles.tabBadge,
                  activeTab === tab.key && styles.tabBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.tabBadgeText,
                    activeTab === tab.key && styles.tabBadgeTextActive,
                  ]}
                >
                  {tabCounts[tab.key]}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon={emptyIcons[activeTab]}
              title={emptyMessages[activeTab].title}
              subtitle={emptyMessages[activeTab].subtitle}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <IncomingRequestCard
            request={item}
            company={companyMap[item.companyId]}
            onAccept={() => acceptRequest(item.id)}
            onReject={() => rejectRequest(item.id)}
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
    paddingVertical: 12,
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.technician,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.technician,
    fontWeight: '600',
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
    backgroundColor: colors.technician + '25',
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabBadgeTextActive: {
    color: colors.technician,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
});
