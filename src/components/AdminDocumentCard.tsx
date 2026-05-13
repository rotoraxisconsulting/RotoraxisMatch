import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { TechnicianDocument, DocumentStatus, DocumentType } from '../types';
import { Badge, BadgeVariant } from './Badge';
import { Card } from './Card';
import { colors, spacing } from '../theme';

interface Props {
  document: TechnicianDocument;
  technicianName?: string;
  onUpdateStatus: (id: string, status: DocumentStatus) => Promise<void>;
}

const ACTIONS: { status: DocumentStatus; label: string; color: string }[] = [
  { status: 'verified', label: 'Verify', color: colors.success },
  { status: 'pending', label: 'Pending', color: colors.warning },
  { status: 'rejected', label: 'Reject', color: colors.error },
];

function statusVariant(s: DocumentStatus): BadgeVariant {
  if (s === 'verified') return 'success';
  if (s === 'pending') return 'warning';
  return 'error';
}

function typeVariant(t: DocumentType): BadgeVariant {
  if (t === 'license') return 'navy';
  if (t === 'medical') return 'info';
  if (t === 'training') return 'cyan';
  return 'muted';
}

function typeLabel(t: DocumentType): string {
  const map: Record<DocumentType, string> = {
    license: 'License',
    medical: 'Medical',
    training: 'Training',
    id: 'ID',
    resume: 'Resume',
    other: 'Other',
  };
  return map[t];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AdminDocumentCard({ document, technicianName, onUpdateStatus }: Props) {
  const [loadingStatus, setLoadingStatus] = useState<DocumentStatus | null>(null);

  async function handleAction(status: DocumentStatus) {
    setLoadingStatus(status);
    try {
      await onUpdateStatus(document.id, status);
    } finally {
      setLoadingStatus(null);
    }
  }

  const availableActions = ACTIONS.filter((a) => a.status !== document.status);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.typeBadgeRow}>
          <Badge label={typeLabel(document.type)} variant={typeVariant(document.type)} small />
        </View>
        <Badge label={document.status} variant={statusVariant(document.status)} />
      </View>

      <Text style={styles.fileName} numberOfLines={1}>
        {document.fileName}
      </Text>

      <Text style={styles.meta}>
        {technicianName ?? document.technicianId} · {formatDate(document.uploadedAt)}
      </Text>

      <View style={styles.actions}>
        {availableActions.map(({ status, label, color }) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.actionBtn,
              { borderColor: color },
              loadingStatus !== null && styles.actionBtnDisabled,
            ]}
            onPress={() => handleAction(status)}
            disabled={loadingStatus !== null}
            activeOpacity={0.8}
          >
            {loadingStatus === status ? (
              <ActivityIndicator size="small" color={color} />
            ) : (
              <Text style={[styles.actionBtnText, { color }]}>{label}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadgeRow: {
    flexDirection: 'row',
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  meta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
