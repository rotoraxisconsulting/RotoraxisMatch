import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Badge, BadgeVariant } from './Badge';
import { Button } from './Button';
import { colors, spacing } from '../theme';
import { MatchRequest, Company } from '../types';

interface IncomingRequestCardProps {
  request: MatchRequest;
  company?: Company | null;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
}

function statusVariant(status: string): BadgeVariant {
  if (status === 'accepted') return 'success';
  if (status === 'rejected') return 'error';
  return 'blue';
}

function statusLabel(status: string): string {
  if (status === 'accepted') return 'Accepted';
  if (status === 'rejected') return 'Declined';
  return 'Awaiting your response';
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

export function IncomingRequestCard({
  request,
  company,
  onAccept,
  onReject,
}: IncomingRequestCardProps) {
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const isPending = request.status === 'sent';
  const isAccepted = request.status === 'accepted';
  const accent = statusAccent(request.status);

  function confirmAccept() {
    Alert.alert(
      'Accept Request',
      `Accepting will share your full name, email, and phone number with ${company?.companyName ?? 'this company'}. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setAccepting(true);
            await onAccept();
            setAccepting(false);
          },
        },
      ],
    );
  }

  function confirmReject() {
    Alert.alert(
      'Decline Request',
      `Decline the direct offer from ${company?.companyName ?? 'this company'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setRejecting(true);
            await onReject();
            setRejecting(false);
          },
        },
      ],
    );
  }

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      {/* Company header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.companyName}>
            {company?.companyName ?? 'Unknown Company'}
          </Text>
          <Text style={styles.date}>{formatDate(request.createdAt)}</Text>
        </View>
        <View style={styles.headerRight}>
          {company && (
            <Badge
              label={company.companyType.charAt(0).toUpperCase() + company.companyType.slice(1)}
              variant="navy"
              small
            />
          )}
          {company && (
            <Badge
              label={company.verificationStatus}
              variant={company.verificationStatus === 'verified' ? 'success' : 'warning'}
              small
            />
          )}
        </View>
      </View>

      {/* Message */}
      {request.message ? (
        <Text style={styles.message}>"{request.message}"</Text>
      ) : null}

      {/* Status */}
      <View style={styles.statusRow}>
        <Badge label={statusLabel(request.status)} variant={statusVariant(request.status)} />
      </View>

      {/* Accepted: show company contact */}
      {isAccepted && company && (
        <View style={styles.contactBlock}>
          <Text style={styles.contactHeading}>Company contact</Text>
          <Text style={styles.contactValue}>{company.contactEmail}</Text>
          {company.website ? (
            <Text style={styles.contactValue}>{company.website}</Text>
          ) : null}
        </View>
      )}

      {/* Action buttons for pending requests */}
      {isPending && (
        <View style={styles.actions}>
          <Button
            label="Accept"
            variant="primary"
            size="sm"
            onPress={confirmAccept}
            loading={accepting}
            disabled={rejecting}
            style={styles.acceptBtn}
          />
          <Button
            label="Decline"
            variant="outline"
            size="sm"
            onPress={confirmReject}
            loading={rejecting}
            disabled={accepting}
            style={styles.rejectBtn}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
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
    gap: 3,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  companyName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
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
    marginBottom: spacing.sm,
  },
  statusRow: {
    marginBottom: spacing.sm,
  },
  contactBlock: {
    backgroundColor: colors.success + '10',
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
    gap: 2,
  },
  contactHeading: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  contactValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  acceptBtn: {
    flex: 2,
  },
  rejectBtn: {
    flex: 1,
    borderColor: colors.error,
  },
});
