import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MatchRequest, MatchRequestStatus } from '../types';
import { Badge, BadgeVariant } from './Badge';
import { Card } from './Card';
import { colors, spacing } from '../theme';

interface Props {
  request: MatchRequest;
  companyName?: string;
  technicianCode?: string;
}

function statusVariant(s: MatchRequestStatus): BadgeVariant {
  if (s === 'accepted') return 'success';
  if (s === 'rejected') return 'error';
  return 'info';
}

function statusLabel(s: MatchRequestStatus): string {
  if (s === 'accepted') return 'Accepted';
  if (s === 'rejected') return 'Rejected';
  return 'Awaiting reply';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AdminRequestCard({ request, companyName, technicianCode }: Props) {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.pair} numberOfLines={1}>
          {companyName ?? request.companyId}
          {'  →  '}
          {technicianCode ?? request.technicianId}
        </Text>
        <Badge label={statusLabel(request.status)} variant={statusVariant(request.status)} />
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.date}>{formatDate(request.createdAt)}</Text>
        {request.identityRevealed && (
          <View style={styles.identityPill}>
            <Text style={styles.identityText}>Identity shared</Text>
          </View>
        )}
      </View>

      {request.message ? (
        <Text style={styles.message} numberOfLines={2}>
          "{request.message}"
        </Text>
      ) : null}
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
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  pair: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  date: {
    fontSize: 12,
    color: colors.textMuted,
  },
  identityPill: {
    backgroundColor: colors.success + '20',
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  identityText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.success,
  },
  message: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 18,
  },
});
