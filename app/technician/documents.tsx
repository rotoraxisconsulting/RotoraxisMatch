import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Alert,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { DemoModeBanner } from '../../src/components/DemoModeBanner';
import { DocumentCard } from '../../src/components/DocumentCard';
import { EmptyState } from '../../src/components/EmptyState';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { useTechnicianDashboard } from '../../src/state/useTechnicianDashboard';
import { colors, spacing } from '../../src/theme';

export default function TechnicianDocumentsScreen() {
  const { documents, loading, refresh } = useTechnicianDashboard();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const verifiedCount = documents.filter((d) => d.status === 'verified').length;
  const pendingCount = documents.filter((d) => d.status === 'pending').length;

  function handleUploadPress() {
    Alert.alert(
      'Document Upload',
      'Document upload will be available in a future release. Documents are currently managed through the verification process.',
      [{ text: 'OK' }],
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'My Documents' }} />
      <DemoModeBanner role="technician" />

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Summary card */}
            {documents.length > 0 && (
              <Card style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, { color: colors.success }]}>
                      {verifiedCount}
                    </Text>
                    <Text style={styles.summaryLabel}>Verified</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, { color: colors.warning }]}>
                      {pendingCount}
                    </Text>
                    <Text style={styles.summaryLabel}>Under review</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, { color: colors.blue }]}>
                      {documents.length}
                    </Text>
                    <Text style={styles.summaryLabel}>Total</Text>
                  </View>
                </View>
              </Card>
            )}

            {/* Upload button */}
            <Button
              label="Upload Document"
              variant="outline"
              onPress={handleUploadPress}
              fullWidth
              style={styles.uploadBtn}
            />

            {documents.length > 0 && (
              <Text style={styles.listTitle}>Documents on file</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="📄"
              title="No documents on file"
              subtitle="Upload your licenses, certifications and other documents to improve your profile completeness."
            />
          ) : null
        }
        renderItem={({ item }) => <DocumentCard document={item} />}
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
  summaryCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  uploadBtn: {
    marginBottom: spacing.lg,
    borderColor: colors.technician,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
});
