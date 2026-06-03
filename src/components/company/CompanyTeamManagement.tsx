import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react-native';
import {
  CompanyBadge,
  CompanyCard,
  IconBox,
  InitialAvatar,
  companyUi,
} from './CompanyUI';
import { companyRepositoryV2 } from '../../repositories/v2/companyRepositoryV2';
import { canManageCompanyMembers } from '../../utils/companyPermissionsV2';
import { useCompanySession } from '../../state/SessionContext';
import type { CompanyMember } from '../../types/company';
import type { CompanyMemberRole } from '../../types/enums';
import { spacing } from '../../theme';

const ROLE_LABELS: Record<CompanyMemberRole, string> = {
  admin: 'Admin',
  recruiter: 'Recruiter',
  viewer: 'Viewer',
};

const ROLE_HINTS: Record<CompanyMemberRole, string> = {
  admin: 'Can manage members and operational workflows.',
  recruiter: 'Can work offers, applications, direct offers and chats.',
  viewer: 'Read-only access to company workspace data.',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function avatarInitial(userId: string): string {
  return userId.charAt(0).toUpperCase();
}

function roleTone(role: CompanyMemberRole) {
  if (role === 'admin') return 'navy';
  if (role === 'recruiter') return 'info';
  return 'muted';
}

function roleColor(role: CompanyMemberRole): string {
  if (role === 'admin') return companyUi.navy;
  if (role === 'recruiter') return companyUi.accent;
  return companyUi.textMuted;
}

export function CompanyTeamManagement({ companyName }: { companyName: string }) {
  const { companyId, profileId, companyMemberRole } = useCompanySession();
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [currentMember, setCurrentMember] = useState<CompanyMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [changeRoleTarget, setChangeRoleTarget] = useState<CompanyMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CompanyMember | null>(null);

  const load = useCallback(async () => {
    const all = await companyRepositoryV2.getMembers(companyId);
    setMembers(all);
    setCurrentMember(all.find((m) => m.userId === profileId) ?? null);
  }, [companyId, profileId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [load]);

  async function doAddMember(role: CompanyMemberRole) {
    const demoUserId = `demo-user-${Date.now()}`;
    try {
      await companyRepositoryV2.addMember(companyId, demoUserId, role);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not add member.');
    }
  }

  async function doChangeRole(member: CompanyMember, newRole: CompanyMemberRole) {
    setActioning(member.id);
    try {
      await companyRepositoryV2.updateMemberRole(member.id, newRole);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not change role.');
    } finally {
      setActioning(null);
    }
  }

  async function doRemoveMember(member: CompanyMember) {
    setActioning(member.id);
    try {
      await companyRepositoryV2.removeMember(member.id);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not remove member.');
    } finally {
      setActioning(null);
    }
  }

  if (loading) {
    return (
      <CompanyCard style={styles.loadingCard}>
        <ActivityIndicator color={companyUi.accent} />
      </CompanyCard>
    );
  }

  const currentRole = currentMember?.role ?? companyMemberRole;
  const isAdmin = canManageCompanyMembers(currentRole);

  if (!isAdmin) return null;

  const adminCount = members.filter((m) => m.role === 'admin').length;
  const recruiterCount = members.filter((m) => m.role === 'recruiter').length;
  const viewerCount = members.filter((m) => m.role === 'viewer').length;

  return (
    <>
      <CompanyCard style={styles.teamCard}>
        <View style={styles.sectionHeader}>
          <IconBox icon={Users} color={companyUi.accent} backgroundColor={companyUi.accentSoft} />
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>Team access</Text>
            <Text style={styles.sectionSub}>
              {members.length} member{members.length !== 1 ? 's' : ''} across {companyName}.
            </Text>
          </View>
          <TouchableOpacity style={styles.headerAction} onPress={() => setShowAddModal(true)} activeOpacity={0.75}>
            <UserPlus color={companyUi.surface} size={16} strokeWidth={2} />
            <Text style={styles.headerActionText}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricRow}>
          <Metric value={adminCount} label="Admins" />
          <Metric value={recruiterCount} label="Recruiters" />
          <Metric value={viewerCount} label="Viewers" />
        </View>

        <View style={styles.sessionStrip}>
          <IconBox icon={ShieldCheck} size={17} color={companyUi.navy} backgroundColor={companyUi.surfaceSoft} />
          <View style={styles.sessionCopy}>
            <Text style={styles.sessionTitle}>Your admin session</Text>
            <Text style={styles.sessionText} numberOfLines={1}>{profileId}</Text>
          </View>
          <CompanyBadge label={ROLE_LABELS[currentRole]} tone={roleTone(currentRole)} small />
        </View>

        <View style={styles.memberList}>
          <Text style={styles.memberSectionTitle}>Members</Text>
          {members.map((member) => {
            const isCurrentUser = member.userId === profileId;
            const isLastAdmin = member.role === 'admin' && adminCount <= 1;
            const isActioning = actioning === member.id;

            return (
              <View
                key={member.id}
                style={[styles.memberCard, isCurrentUser && styles.memberCardCurrent]}
              >
                <View style={styles.memberMain}>
                  <InitialAvatar label={avatarInitial(member.userId)} color={roleColor(member.role)} />
                  <View style={styles.memberInfo}>
                    <View style={styles.memberTop}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {member.userId}
                      </Text>
                      <View style={styles.memberBadges}>
                        {isCurrentUser ? <CompanyBadge label="Current" tone="cyan" small /> : null}
                        <CompanyBadge label={ROLE_LABELS[member.role]} tone={roleTone(member.role)} small />
                      </View>
                    </View>
                    <Text style={styles.memberMeta}>Added {formatDate(member.createdAt)}</Text>
                    <Text style={styles.memberHint}>{ROLE_HINTS[member.role]}</Text>
                  </View>
                </View>

                <View style={styles.memberActions}>
                  <TouchableOpacity
                    style={[styles.secondaryButton, isActioning && styles.disabled]}
                    onPress={() => setChangeRoleTarget(member)}
                    disabled={isActioning}
                    activeOpacity={0.75}
                  >
                    {isActioning ? (
                      <ActivityIndicator size="small" color={companyUi.accent} />
                    ) : (
                      <Text style={styles.secondaryButtonText}>Change role</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.dangerButton,
                      (isLastAdmin || isCurrentUser || isActioning) && styles.disabled,
                    ]}
                    onPress={() => setRemoveTarget(member)}
                    disabled={isLastAdmin || isCurrentUser || isActioning}
                    activeOpacity={0.75}
                  >
                    <Trash2
                      color={isLastAdmin || isCurrentUser ? companyUi.textMuted : companyUi.red}
                      size={14}
                      strokeWidth={2}
                    />
                    <Text
                      style={[
                        styles.dangerButtonText,
                        (isLastAdmin || isCurrentUser) && styles.disabledText,
                      ]}
                    >
                      {isLastAdmin ? 'Last admin' : 'Remove'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </CompanyCard>

      <RolePickerModal
        visible={showAddModal}
        title="Add demo member"
        subtitle="Choose an access level for the new workspace member."
        roles={['admin', 'recruiter', 'viewer']}
        onSelect={(role) => {
          setShowAddModal(false);
          doAddMember(role);
        }}
        onCancel={() => setShowAddModal(false)}
      />

      <RolePickerModal
        visible={changeRoleTarget !== null}
        title="Change role"
        subtitle={`New role for ${changeRoleTarget?.userId ?? 'member'}.`}
        roles={(['admin', 'recruiter', 'viewer'] as CompanyMemberRole[]).filter(
          (role) => role !== changeRoleTarget?.role,
        )}
        onSelect={(role) => {
          const target = changeRoleTarget;
          setChangeRoleTarget(null);
          if (target) doChangeRole(target, role);
        }}
        onCancel={() => setChangeRoleTarget(null)}
      />

      <Modal
        visible={removeTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRemoveTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <CompanyCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>Remove member?</Text>
            <Text style={styles.modalSub} numberOfLines={2}>
              Remove {removeTarget?.userId} from the company team.
            </Text>
            <TouchableOpacity
              style={styles.modalDanger}
              onPress={() => {
                const target = removeTarget;
                setRemoveTarget(null);
                if (target) doRemoveMember(target);
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.modalDangerText}>Remove member</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setRemoveTarget(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </CompanyCard>
        </View>
      </Modal>
    </>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function RolePickerModal({
  visible,
  title,
  subtitle,
  roles,
  onSelect,
  onCancel,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  roles: CompanyMemberRole[];
  onSelect: (role: CompanyMemberRole) => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <CompanyCard style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalSub}>{subtitle}</Text>
          {roles.map((role) => (
            <TouchableOpacity
              key={role}
              style={styles.roleOption}
              onPress={() => onSelect(role)}
              activeOpacity={0.75}
            >
              <View style={styles.roleOptionCopy}>
                <Text style={styles.roleOptionTitle}>{ROLE_LABELS[role]}</Text>
                <Text style={styles.roleOptionSub}>{ROLE_HINTS[role]}</Text>
              </View>
              <CompanyBadge label={ROLE_LABELS[role]} tone={roleTone(role)} small />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.modalCancel} onPress={onCancel}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </CompanyCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loadingCard: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamCard: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: companyUi.text,
  },
  sectionSub: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
  headerAction: {
    minHeight: 38,
    borderRadius: 14,
    backgroundColor: companyUi.accent,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  headerActionText: {
    color: companyUi.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metric: {
    flex: 1,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
    backgroundColor: companyUi.surfaceSoft,
    borderRadius: 16,
    padding: 12,
  },
  metricValue: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '700',
    color: companyUi.text,
  },
  metricLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    color: companyUi.textSoft,
  },
  sessionStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: companyUi.borderSoft,
    backgroundColor: companyUi.surfaceSoft,
    borderRadius: 16,
    padding: 12,
  },
  sessionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sessionTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: companyUi.text,
  },
  sessionText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: companyUi.textMuted,
  },
  memberList: {
    gap: spacing.sm,
  },
  memberSectionTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: companyUi.text,
  },
  memberCard: {
    borderWidth: 1,
    borderColor: companyUi.border,
    backgroundColor: companyUi.surface,
    borderRadius: 18,
    padding: spacing.md,
    gap: 14,
  },
  memberCardCurrent: {
    borderColor: '#BAE6FD',
  },
  memberMain: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
  },
  memberTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  memberName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: companyUi.text,
  },
  memberBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  memberMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: companyUi.textMuted,
  },
  memberHint: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
  memberActions: {
    borderTopWidth: 1,
    borderTopColor: companyUi.borderSoft,
    paddingTop: 12,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: companyUi.blueSoft,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: companyUi.blue,
  },
  dangerButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: companyUi.redSoft,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  dangerButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: companyUi.red,
  },
  disabled: {
    opacity: 0.52,
  },
  disabledText: {
    color: companyUi.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    gap: spacing.sm,
  },
  modalTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    color: companyUi.text,
  },
  modalSub: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
  roleOption: {
    borderWidth: 1,
    borderColor: companyUi.border,
    borderRadius: 16,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: companyUi.surfaceSoft,
  },
  roleOptionCopy: {
    flex: 1,
    minWidth: 0,
  },
  roleOptionTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: companyUi.text,
  },
  roleOptionSub: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: companyUi.textSoft,
  },
  modalDanger: {
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: companyUi.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDangerText: {
    fontSize: 14,
    fontWeight: '700',
    color: companyUi.surface,
  },
  modalCancel: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: companyUi.textSoft,
  },
});
