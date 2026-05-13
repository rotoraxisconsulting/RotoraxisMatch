import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Company, VerificationStatus } from '../types';
import { Badge } from './Badge';
import { Card } from './Card';
import { colors, spacing } from '../theme';

interface Props {
  company: Company;
  onUpdateStatus: (id: string, status: VerificationStatus) => Promise<void>;
}

const ACTIONS: { status: VerificationStatus; label: string; color: string }[] = [
  { status: 'verified', label: 'Verify', color: colors.success },
  { status: 'pending', label: 'Pending', color: colors.warning },
  { status: 'unverified', label: 'Reject', color: colors.error },
];

function verificationVariant(s: VerificationStatus) {
  if (s === 'verified') return 'success' as const;
  if (s === 'pending') return 'warning' as const;
  return 'muted' as const;
}

function typeVariant(t: string) {
  if (t === 'airline') return 'navy' as const;
  if (t === 'mro') return 'blue' as const;
  if (t === 'operator') return 'cyan' as const;
  return 'muted' as const;
}

export function AdminCompanyCard({ company, onUpdateStatus }: Props) {
  const [loadingStatus, setLoadingStatus] = useState<VerificationStatus | null>(null);

  async function handleAction(status: VerificationStatus) {
    setLoadingStatus(status);
    try {
      await onUpdateStatus(company.id, status);
    } finally {
      setLoadingStatus(null);
    }
  }

  const availableActions = ACTIONS.filter(
    (a) => a.status !== company.verificationStatus,
  );

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>{company.companyName}</Text>
        <Badge
          label={company.verificationStatus}
          variant={verificationVariant(company.verificationStatus)}
        />
      </View>

      <View style={styles.metaRow}>
        <Badge
          label={company.companyType.charAt(0).toUpperCase() + company.companyType.slice(1)}
          variant={typeVariant(company.companyType)}
          small
        />
        <Text style={styles.location}>
          {company.city}, {company.country}
        </Text>
      </View>

      <Text style={styles.email}>{company.contactEmail}</Text>

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
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  location: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  email: {
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
