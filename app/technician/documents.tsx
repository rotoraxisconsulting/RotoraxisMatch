import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { Button } from '../../src/components/Button';
import {
  EmptyPanel,
  TechnicianBadge,
  TechnicianCard,
  TechnicianPageHeader,
  TechnicianScreen,
  techStyles,
  techUi,
} from '../../src/components/technician/TechnicianUI';
import { useTechnicianDashboard } from '../../src/state/useTechnicianDashboard';
import { colors, spacing } from '../../src/theme';
import { DocumentStatus, DocumentType, TechnicianDocument } from '../../src/types';

const TYPE_LABELS: Record<DocumentType, string> = {
  license: 'License',
  medical: 'Medical',
  training: 'Training',
  id: 'ID',
  resume: 'Resume',
  other: 'Other',
};

const TYPE_TONES: Record<DocumentType, 'navy' | 'cyan' | 'info' | 'muted'> = {
  license: 'navy',
  medical: 'cyan',
  training: 'info',
  id: 'muted',
  resume: 'muted',
  other: 'muted',
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  verified: 'Verified',
  pending: 'Under review',
  rejected: 'Rejected',
  expired: 'Expired',
};

const STATUS_TONES: Record<DocumentStatus, 'success' | 'warning' | 'error' | 'muted'> = {
  verified: 'success',
  pending: 'warning',
  rejected: 'error',
  expired: 'error',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function DocumentPanel({ document }: { document: TechnicianDocument }) {
  const expiresAt = (document as TechnicianDocument & { expiresAt?: string }).expiresAt;
  const rejectionReason = (document as TechnicianDocument & { rejectionReason?: string }).rejectionReason;

  return (
    <TechnicianCard style={styles.documentCard}>
      <View style={styles.documentTop}>
        <View style={styles.documentInfo}>
          <View style={styles.badgeRow}>
            <TechnicianBadge
              label={TYPE_LABELS[document.type]}
              tone={TYPE_TONES[document.type]}
              small
            />
          </View>
          <Text style={styles.fileName} numberOfLines={2}>{document.fileName}</Text>
        </View>
        <TechnicianBadge
          label={STATUS_LABELS[document.status]}
          tone={STATUS_TONES[document.status]}
          small
        />
      </View>

      <View style={styles.documentMeta}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Uploaded</Text>
          <Text style={styles.metaValue}>{formatDate(document.uploadedAt)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Expiration</Text>
          <Text style={styles.metaValue}>{expiresAt ? formatDate(expiresAt) : 'Not provided'}</Text>
        </View>
      </View>

      {document.status === 'rejected' && rejectionReason ? (
        <View style={styles.rejectionNote}>
          <Text style={styles.rejectionLabel}>Reason for rejection</Text>
          <Text style={styles.rejectionText}>{rejectionReason}</Text>
        </View>
      ) : null}
    </TechnicianCard>
  );
}

export default function TechnicianDocumentsScreen() {
  const router = useRouter();
  const { documents, loading, refresh } = useTechnicianDashboard();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const verifiedCount = documents.filter((d) => d.status === 'verified').length;
  const pendingCount = documents.filter((d) => d.status === 'pending').length;
  const attentionCount = documents.filter((d) => d.status === 'rejected' || d.status === 'expired').length;

  function handleUploadPress() {
    Alert.alert(
      'Document Upload',
      'Document upload will be available in a future release. Documents are currently managed through the verification process.',
      [{ text: 'OK' }],
    );
  }

  if (loading && documents.length === 0) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  return (
    <TechnicianScreen>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[techStyles.content, isWide && techStyles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        <TechnicianPageHeader
          eyebrow="Verification"
          title="My Documents"
          subtitle="Track licenses, certificates and verification documents on file."
          onBack={() => router.back()}
        />

        <TechnicianCard style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: techUi.green }]}>{verifiedCount}</Text>
            <Text style={styles.summaryLabel}>Verified</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: techUi.amber }]}>{pendingCount}</Text>
            <Text style={styles.summaryLabel}>Under review</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: attentionCount > 0 ? techUi.red : techUi.blue }]}>
              {documents.length}
            </Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
        </TechnicianCard>

        <Button
          label="Upload Document"
          variant="outline"
          onPress={handleUploadPress}
          fullWidth
          style={styles.uploadBtn}
        />

        {documents.length === 0 ? (
          <EmptyPanel
            title="No documents on file"
            subtitle="Upload will be available later. Documents are currently managed through verification."
          />
        ) : (
          <View style={styles.listBlock}>
            <Text style={styles.listTitle}>Documents on file</Text>
            {documents.map((document) => (
              <DocumentPanel key={document.id} document={document} />
            ))}
          </View>
        )}
      </ScrollView>
    </TechnicianScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  summaryValue: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: techUi.textMuted,
    textAlign: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: techUi.borderSoft,
  },
  uploadBtn: {
    marginBottom: spacing.lg,
    borderColor: techUi.accent,
    borderRadius: 16,
  },
  listBlock: {
    gap: spacing.sm,
  },
  listTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: techUi.text,
    marginBottom: 2,
  },
  documentCard: {
    gap: spacing.md,
  },
  rejectionNote: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rejectionLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: techUi.red,
    marginBottom: 3,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  rejectionText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: techUi.textSoft,
  },
  documentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  documentInfo: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  fileName: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: techUi.text,
  },
  documentMeta: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: techUi.borderSoft,
  },
  metaItem: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    backgroundColor: techUi.surfaceSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  metaLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: techUi.textMuted,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: techUi.textSoft,
  },
});
