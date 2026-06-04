import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Text,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { BriefcaseBusiness, CheckCircle, Clock, MapPin, UserRound, XCircle } from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';
import type { LegacyVerificationStatus, Technician, TechnicianWithRelations, VerificationStatus } from '../types';
import { TECHNICIAN_TYPES } from '../constants/technicianTypes';
import {
  AdminBadge,
  AdminCard,
  AdminIconBox,
  AdminInitialAvatar,
  adminUi,
} from './admin/AdminUI';
import type { AdminTone } from './admin/AdminUI';
import { spacing } from '../theme';

interface Props {
  technician: Technician;
  details?: TechnicianWithRelations;
  onUpdateStatus: (id: string, status: VerificationStatus) => Promise<void>;
}

type ActionConfig = {
  status: VerificationStatus;
  label: string;
  tone: AdminTone;
  color: string;
  icon: React.ComponentType<LucideProps>;
};

const ACTIONS: ActionConfig[] = [
  { status: 'verified', label: 'Verify', tone: 'success', color: adminUi.green, icon: CheckCircle },
  { status: 'pending', label: 'Set pending', tone: 'warning', color: adminUi.amber, icon: Clock },
  { status: 'rejected', label: 'Reject', tone: 'error', color: adminUi.red, icon: XCircle },
];

// Accept LegacyVerificationStatus for runtime safety — old persisted data may have 'unverified'
function normalizedStatus(status: LegacyVerificationStatus): VerificationStatus {
  if (status === 'unverified') return 'pending';
  return status;
}

function verificationTone(status: VerificationStatus): AdminTone {
  const normalized = normalizedStatus(status);
  if (normalized === 'verified') return 'success';
  if (normalized === 'pending') return 'warning';
  if (normalized === 'rejected') return 'error';
  return 'muted';
}

function statusLabel(status: VerificationStatus): string {
  if (status === 'verified') return 'Verified';
  if (status === 'pending') return 'Pending review';
  if (status === 'rejected') return 'Rejected';
  return 'Unverified';
}

function technicianTypeLabel(details?: TechnicianWithRelations): string {
  if (!details) return 'Technician profile';
  return TECHNICIAN_TYPES.find((type) => type.code === details.technicianType)?.label ?? details.technicianType;
}

function compactValues(values: string[], max = 5): string[] {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length <= max) return unique;
  return [...unique.slice(0, max), `+${unique.length - max}`];
}

export function AdminTechnicianCard({ technician, details, onUpdateStatus }: Props) {
  const [loadingStatus, setLoadingStatus] = useState<VerificationStatus | null>(null);
  const currentStatus = normalizedStatus(technician.verificationStatus);

  async function handleAction(status: VerificationStatus) {
    setLoadingStatus(status);
    try {
      await onUpdateStatus(technician.id, status);
    } catch (error) {
      Alert.alert(
        'Technician verification failed',
        error instanceof Error ? error.message : 'Could not update technician verification.',
      );
    } finally {
      setLoadingStatus(null);
    }
  }

  const availableActions = ACTIONS.filter((action) => action.status !== currentStatus);
  const licenseChips = compactValues(
    details?.licenses.map((license) => license.licenseCode) ?? technician.licenseCategories,
  );
  const habilitationChips = compactValues(
    details?.habilitations.map((habilitation) => habilitation.aircraftTypeCode) ?? technician.aircraftTypes,
  );

  return (
    <AdminCard
      style={[
        styles.card,
        currentStatus === 'pending' && styles.cardPending,
        currentStatus === 'rejected' && styles.cardRejected,
      ]}
    >
      <View style={styles.header}>
        <View style={styles.identity}>
          <AdminInitialAvatar label={technician.fullName} color={adminUi.navy} />
          <View style={styles.titleBlock}>
            <Text style={styles.name}>{technician.fullName}</Text>
            <Text style={styles.code}>{technician.anonymousCode}</Text>
          </View>
        </View>
        <AdminBadge label={statusLabel(technician.verificationStatus)} tone={verificationTone(technician.verificationStatus)} />
      </View>

      <View style={styles.metaGrid}>
        <InfoPill icon={BriefcaseBusiness} label={technicianTypeLabel(details)} />
        <InfoPill icon={MapPin} label={`${technician.city}, ${technician.country}`} />
        <InfoPill icon={UserRound} label={`${technician.yearsExperience} years exp. - ${technician.profileCompleteness}% profile`} />
      </View>

      {licenseChips.length > 0 ? (
        <ChipGroup label="Licenses" values={licenseChips} tone="navy" />
      ) : null}

      {habilitationChips.length > 0 ? (
        <ChipGroup label="Habilitations" values={habilitationChips} tone="cyan" />
      ) : null}

      <View style={styles.actions}>
        {availableActions.map((action) => (
          <StatusActionButton
            key={action.status}
            action={action}
            loading={loadingStatus === action.status}
            disabled={loadingStatus !== null}
            onPress={() => handleAction(action.status)}
          />
        ))}
      </View>
    </AdminCard>
  );
}

function InfoPill({
  icon,
  label,
}: {
  icon: React.ComponentType<LucideProps>;
  label: string;
}) {
  return (
    <View style={styles.infoPill}>
      <AdminIconBox icon={icon} size={16} color={adminUi.accent} backgroundColor={adminUi.accentSoft} />
      <Text style={styles.infoText} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function ChipGroup({
  label,
  values,
  tone,
}: {
  label: string;
  values: string[];
  tone: AdminTone;
}) {
  return (
    <View style={styles.chipGroup}>
      <Text style={styles.chipLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {values.map((value) => (
          <AdminBadge key={value} label={value} tone={tone} small />
        ))}
      </View>
    </View>
  );
}

function StatusActionButton({
  action,
  loading,
  disabled,
  onPress,
}: {
  action: ActionConfig;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const Icon = action.icon;
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        { borderColor: action.color + '55', backgroundColor: action.color + '0F' },
        disabled && styles.actionBtnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.78}
    >
      {loading ? (
        <ActivityIndicator size="small" color={action.color} />
      ) : (
        <>
          <Icon size={15} color={action.color} strokeWidth={2.2} />
          <Text style={[styles.actionBtnText, { color: action.color }]}>{action.label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  cardPending: {
    borderColor: '#FDE68A',
    borderLeftWidth: 3,
  },
  cardRejected: {
    borderColor: '#FECACA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: adminUi.text,
  },
  code: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: adminUi.textMuted,
    fontFamily: 'monospace',
  },
  metaGrid: {
    gap: spacing.sm,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 14,
    backgroundColor: adminUi.surfaceSoft,
    borderWidth: 1,
    borderColor: adminUi.borderSoft,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: adminUi.textSoft,
  },
  chipGroup: {
    gap: spacing.xs,
  },
  chipLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    color: adminUi.textMuted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: adminUi.borderSoft,
  },
  actionBtn: {
    flexGrow: 1,
    flexBasis: 112,
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  actionBtnDisabled: {
    opacity: 0.55,
  },
  actionBtnText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
});
