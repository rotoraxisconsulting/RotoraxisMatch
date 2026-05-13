import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Badge, BadgeVariant } from './Badge';
import { colors, spacing } from '../theme';
import { MatchRequest, SafeTechnicianView } from '../types';

interface MatchRequestCardProps {
  request: MatchRequest;
  technician?: SafeTechnicianView | null;
}

function statusVariant(status: string): BadgeVariant {
  if (status === 'accepted') return 'success';
  if (status === 'rejected') return 'error';
  return 'blue';
}

function statusLabel(status: string): string {
  if (status === 'accepted') return 'Accepted';
  if (status === 'rejected') return 'Rejected';
  return 'Awaiting reply';
}

function statusAccent(status: string): string {
  if (status === 'accepted') return colors.success;
  if (status === 'rejected') return colors.error;
  return colors.blue;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MatchRequestCard({ request, technician }: MatchRequestCardProps) {
  const isRevealed = request.status === 'accepted' && request.identityRevealed;
  const accent = statusAccent(request.status);

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.code}>
            {technician?.anonymousCode ?? request.technicianId}
          </Text>
          {isRevealed && technician?.fullName ? (
            <Text style={styles.fullName}>{technician.fullName}</Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          <Badge label={statusLabel(request.status)} variant={statusVariant(request.status)} />
          <Text style={styles.date}>{formatDate(request.createdAt)}</Text>
        </View>
      </View>

      {request.message ? (
        <Text style={styles.message} numberOfLines={2}>
          "{request.message}"
        </Text>
      ) : null}

      {isRevealed && technician ? (
        <View style={styles.identityBlock}>
          <Text style={styles.identityHeading}>Identity revealed</Text>
          {technician.email ? (
            <View style={styles.contactRow}>
              <Text style={styles.contactKey}>Email</Text>
              <Text style={styles.contactVal}>{technician.email}</Text>
            </View>
          ) : null}
          {technician.phone ? (
            <View style={styles.contactRow}>
              <Text style={styles.contactKey}>Phone</Text>
              <Text style={styles.contactVal}>{technician.phone}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {technician ? (
        <View style={styles.tagRow}>
          {technician.licenseCategories.slice(0, 2).map((l) => (
            <View key={l} style={styles.tag}>
              <Text style={styles.tagText}>{l}</Text>
            </View>
          ))}
          <View style={styles.tag}>
            <Text style={styles.tagText}>{technician.country}</Text>
          </View>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{technician.yearsExperience} yrs exp</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  headerLeft: {
    flex: 1,
    marginRight: spacing.sm,
    gap: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  code: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.3,
  },
  fullName: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  date: {
    fontSize: 11,
    color: colors.textMuted,
  },
  message: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  identityBlock: {
    backgroundColor: colors.success + '10',
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  identityHeading: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  contactKey: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    width: 44,
  },
  contactVal: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: spacing.xs,
  },
  tag: {
    backgroundColor: colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
