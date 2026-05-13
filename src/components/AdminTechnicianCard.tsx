import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Technician, VerificationStatus } from '../types';
import { Badge } from './Badge';
import { Card } from './Card';
import { colors, spacing } from '../theme';

interface Props {
  technician: Technician;
  onUpdateStatus: (id: string, status: VerificationStatus) => Promise<void>;
}

const ACTIONS: { status: VerificationStatus; label: string; color: string }[] = [
  { status: 'verified', label: 'Verify', color: colors.success },
  { status: 'pending', label: 'Pending', color: colors.warning },
  { status: 'unverified', label: 'Unverify', color: colors.error },
];

function verificationVariant(s: VerificationStatus) {
  if (s === 'verified') return 'success' as const;
  if (s === 'pending') return 'warning' as const;
  return 'muted' as const;
}

export function AdminTechnicianCard({ technician, onUpdateStatus }: Props) {
  const [loadingStatus, setLoadingStatus] = useState<VerificationStatus | null>(null);

  async function handleAction(status: VerificationStatus) {
    setLoadingStatus(status);
    try {
      await onUpdateStatus(technician.id, status);
    } finally {
      setLoadingStatus(null);
    }
  }

  const availableActions = ACTIONS.filter(
    (a) => a.status !== technician.verificationStatus,
  );

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.code}>{technician.anonymousCode}</Text>
        <Badge
          label={technician.verificationStatus}
          variant={verificationVariant(technician.verificationStatus)}
        />
      </View>

      <Text style={styles.name}>{technician.fullName}</Text>
      <Text style={styles.location}>
        {technician.city}, {technician.country}
        {technician.baseAirport ? ` · ${technician.baseAirport}` : ''}
      </Text>

      {technician.licenseCategories.length > 0 && (
        <View style={styles.tagRow}>
          {technician.licenseCategories.map((lic) => (
            <Badge key={lic} label={lic} variant="navy" small />
          ))}
        </View>
      )}

      <Text style={styles.stats}>
        {technician.yearsExperience} yr exp · {technician.profileCompleteness}% profile
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
  code: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  location: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  stats: {
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
