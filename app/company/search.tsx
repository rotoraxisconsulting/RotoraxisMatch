import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { TechnicianCard } from '../../src/components/TechnicianCard';
import { TechnicianFilters } from '../../src/components/TechnicianFilters';
import { EmptyState } from '../../src/components/EmptyState';
import { Button } from '../../src/components/Button';
import { RequestContactModal } from '../../src/components/RequestContactModal';
import { useTechnicianSearch } from '../../src/state/useTechnicianSearch';
import { useCompanyDashboard } from '../../src/state/useCompanyDashboard';
import { SafeTechnicianView } from '../../src/types';
import { colors, spacing } from '../../src/theme';

export default function TechnicianSearchScreen() {
  const { results, filters, loading, hasSearched, updateFilter, clearFilters, search } =
    useTechnicianSearch();
  const { requests, hasSentRequest, getRequestForTechnician, sendRequest } =
    useCompanyDashboard();

  const [selectedTech, setSelectedTech] = useState<SafeTechnicianView | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSearch() {
    await search(requests);
  }

  function handleRequestContact(tech: SafeTechnicianView) {
    setSelectedTech(tech);
    setModalVisible(true);
  }

  async function handleConfirmRequest(message: string) {
    if (!selectedTech) return;
    setSending(true);
    const freshRequests = await sendRequest(selectedTech.id, message);
    setSending(false);
    setModalVisible(false);
    setSelectedTech(null);
    await search(freshRequests);
  }

  function handleCancelModal() {
    setSelectedTech(null);
    setModalVisible(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Search Technicians' }} />
      <DemoModeBanner role="company" />

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <TechnicianFilters
              filters={filters}
              onChange={updateFilter}
              onClear={clearFilters}
            />
            <Button
              label="Search Technicians"
              variant="primary"
              onPress={handleSearch}
              loading={loading}
              fullWidth
              style={styles.searchBtn}
            />
            {hasSearched && !loading && (
              <View style={styles.resultRow}>
                <View style={styles.resultPill}>
                  <Text style={styles.resultCount}>
                    {results.length} {results.length === 1 ? 'result' : 'results'} found
                  </Text>
                </View>
              </View>
            )}
            {loading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.blue} size="small" />
                <Text style={styles.loadingText}>Searching…</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            hasSearched ? (
              <EmptyState
                title="No technicians found"
                subtitle="Try adjusting your filters or search without filters to see all available technicians."
                icon="✈️"
                action={{ label: 'Clear filters', onPress: clearFilters }}
              />
            ) : (
              <EmptyState
                title="Set your search criteria"
                subtitle="Use the filters above to find technicians that match your requirements, then tap Search."
                icon="🔍"
              />
            )
          ) : null
        }
        renderItem={({ item }) => (
          <TechnicianCard
            technician={item}
            requestStatus={getRequestForTechnician(item.id)?.status ?? null}
            onRequestContact={
              hasSentRequest(item.id) ? undefined : () => handleRequestContact(item)
            }
          />
        )}
      />

      <RequestContactModal
        visible={modalVisible}
        technician={selectedTech}
        onConfirm={handleConfirmRequest}
        onCancel={handleCancelModal}
        loading={sending}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  searchBtn: {
    marginBottom: spacing.sm,
  },
  resultRow: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  resultPill: {
    backgroundColor: colors.blue + '12',
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.blue + '30',
  },
  resultCount: {
    fontSize: 12,
    color: colors.blue,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
