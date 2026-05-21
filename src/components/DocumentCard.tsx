import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from './Card';
import { Badge, BadgeVariant } from './Badge';
import { colors, spacing } from '../theme';
import { TechnicianDocument, DocumentType, DocumentStatus } from '../types';

interface DocumentCardProps {
  document: TechnicianDocument;
}

const TYPE_LABELS: Record<DocumentType, string> = {
  license: 'License',
  medical: 'Medical',
  training: 'Training',
  id: 'ID',
  resume: 'Resume',
  other: 'Other',
};

const TYPE_VARIANTS: Record<DocumentType, BadgeVariant> = {
  license: 'navy',
  medical: 'cyan',
  training: 'blue',
  id: 'info',
  resume: 'muted',
  other: 'muted',
};

const STATUS_VARIANTS: Record<DocumentStatus, BadgeVariant> = {
  verified: 'success',
  pending: 'warning',
  rejected: 'error',
  expired: 'error',
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  verified: 'Verified',
  pending: 'Under review',
  rejected: 'Rejected',
  expired: 'Expired',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DocumentCard({ document: doc }: DocumentCardProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.info}>
          <View style={styles.typeRow}>
            <Badge label={TYPE_LABELS[doc.type]} variant={TYPE_VARIANTS[doc.type]} small />
          </View>
          <Text style={styles.fileName} numberOfLines={1}>
            {doc.fileName}
          </Text>
          <Text style={styles.date}>Uploaded {formatDate(doc.uploadedAt)}</Text>
        </View>
        <Badge label={STATUS_LABELS[doc.status]} variant={STATUS_VARIANTS[doc.status]} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  typeRow: {
    flexDirection: 'row',
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  date: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
