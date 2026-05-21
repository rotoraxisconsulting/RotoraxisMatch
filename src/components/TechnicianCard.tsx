import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from './Card';
import { Badge, BadgeVariant } from './Badge';
import { Button } from './Button';
import { colors, spacing } from '../theme';
import { SafeTechnicianView, VerificationStatus, AvailabilityStatus, MatchRequestStatus } from '../types';
import { getMatchLabel } from '../utils/matching';

interface TechnicianCardProps {
  technician: SafeTechnicianView;
  onRequestContact?: () => void;
  requestStatus?: MatchRequestStatus | null;
}

function scoreVariant(score: number): BadgeVariant {
  if (score >= 80) return 'success';
  if (score >= 60) return 'blue';
  if (score >= 40) return 'warning';
  return 'muted';
}

function scoreColor(score: number): string {
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.blue;
  if (score >= 40) return colors.warning;
  return colors.textMuted;
}

function verificationVariant(s: VerificationStatus): BadgeVariant {
  if (s === 'verified') return 'success';
  if (s === 'pending') return 'warning';
  return 'muted';
}

function availabilityVariant(s: AvailabilityStatus): BadgeVariant {
  if (s === 'available') return 'success';
  if (s === 'open_to_offers') return 'cyan';
  return 'muted';
}

function availabilityLabel(s: AvailabilityStatus): string {
  if (s === 'available') return 'Available';
  if (s === 'open_to_offers') return 'Open to offers';
  return 'Unavailable';
}

function requestButtonLabel(status?: MatchRequestStatus | null): string {
  if (status === 'sent') return 'Request Sent';
  if (status === 'accepted') return 'Accepted';
  if (status === 'rejected') return 'Request Rejected';
  return 'Request Contact';
}

export function TechnicianCard({ technician: t, onRequestContact, requestStatus }: TechnicianCardProps) {
  const hasRequest = !!requestStatus;
  const isIdentityRevealed = !!(t.fullName || t.email || t.phone);

  return (
    <Card style={styles.card} elevated>
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.code}>{t.anonymousCode}</Text>
          <Badge
            label={availabilityLabel(t.availability.status ?? 'unavailable')}
            variant={availabilityVariant(t.availability.status ?? 'unavailable')}
            small
          />
        </View>
        {t.matchingScore !== undefined && (
          <View style={[styles.scoreRing, { borderColor: scoreColor(t.matchingScore) }]}>
            <Text style={[styles.scoreValue, { color: scoreColor(t.matchingScore) }]}>
              {t.matchingScore}
            </Text>
            <Text style={[styles.scoreLabel, { color: scoreColor(t.matchingScore) }]}>
              {getMatchLabel(t.matchingScore)}
            </Text>
          </View>
        )}
      </View>

      {/* Identity (only when revealed) */}
      {isIdentityRevealed && (
        <View style={styles.identityBlock}>
          <Text style={styles.identityHeading}>Identity revealed</Text>
          {t.fullName ? <Text style={styles.identityName}>{t.fullName}</Text> : null}
          {t.email ? <Text style={styles.identityContact}>{t.email}</Text> : null}
          {t.phone ? <Text style={styles.identityContact}>{t.phone}</Text> : null}
        </View>
      )}

      {/* Licenses */}
      {t.licenseCategories.length > 0 && (
        <View style={styles.row}>
          <Text style={styles.fieldLabel}>Licenses</Text>
          <View style={styles.chips}>
            {t.licenseCategories.map((l) => (
              <Badge key={l} label={l} variant="navy" small />
            ))}
          </View>
        </View>
      )}

      {/* Aircraft types */}
      {t.aircraftTypes.length > 0 && (
        <View style={styles.row}>
          <Text style={styles.fieldLabel}>Aircraft</Text>
          <View style={styles.chips}>
            {t.aircraftTypes.slice(0, 3).map((a) => (
              <Badge key={a} label={a} variant="info" small />
            ))}
            {t.aircraftTypes.length > 3 && (
              <Badge label={`+${t.aircraftTypes.length - 3}`} variant="muted" small />
            )}
          </View>
        </View>
      )}

      {/* Specialties */}
      {t.specialties.length > 0 && (
        <View style={styles.row}>
          <Text style={styles.fieldLabel}>Specialties</Text>
          <View style={styles.chips}>
            {t.specialties.slice(0, 3).map((s) => (
              <Badge key={s} label={s} variant="cyan" small />
            ))}
            {t.specialties.length > 3 && (
              <Badge label={`+${t.specialties.length - 3}`} variant="muted" small />
            )}
          </View>
        </View>
      )}

      {/* Info grid */}
      <View style={styles.infoGrid}>
        <InfoCell value={`${t.city}, ${t.country}`} label="Location" />
        <View style={styles.infoDivider} />
        <InfoCell value={t.baseAirport} label="Base" />
        <View style={styles.infoDivider} />
        <InfoCell value={`${t.yearsExperience} yrs`} label="Experience" />
        <View style={styles.infoDivider} />
        <View style={styles.infoCell}>
          <Badge
            label={t.verificationStatus}
            variant={verificationVariant(t.verificationStatus)}
            small
          />
          <Text style={styles.infoCellKey}>Verification</Text>
        </View>
      </View>

      {/* Request button */}
      <Button
        label={requestButtonLabel(requestStatus)}
        variant={hasRequest ? 'outline' : 'primary'}
        size="sm"
        disabled={hasRequest}
        onPress={onRequestContact ?? (() => {})}
        fullWidth
      />
    </Card>
  );
}

function InfoCell({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.infoCell}>
      <Text style={styles.infoCellValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.infoCellKey}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flex: 1,
    gap: 6,
  },
  code: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
  },
  scoreRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  scoreValue: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  scoreLabel: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    lineHeight: 11,
  },
  identityBlock: {
    backgroundColor: colors.success + '10',
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.sm,
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
  identityName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  identityContact: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  row: {
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  infoGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
    marginBottom: spacing.md,
  },
  infoCell: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  infoDivider: {
    width: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 2,
  },
  infoCellValue: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  infoCellKey: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
