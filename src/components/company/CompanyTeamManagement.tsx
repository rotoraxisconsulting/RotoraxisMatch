import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
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

const LAST_ADMIN_MESSAGE = 'A company must have at least one admin.';
const ADMIN_ONLY_MESSAGE = 'Only company admins can manage members.';
const INVITE_ROLES: CompanyMemberRole[] = ['recruiter', 'viewer', 'admin'];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function memberDisplayName(member: CompanyMember): string {
  return member.displayName?.trim() || member.email || 'Unnamed member';
}

function avatarInitial(member: CompanyMember): string {
  if (member.displayName?.trim()) return member.displayName.trim().charAt(0).toUpperCase();
  if (member.email?.trim()) return member.email.trim().charAt(0).toUpperCase();
  return member.userId.charAt(0).toUpperCase();
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

  // Invite modal state
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CompanyMemberRole>('recruiter');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccessMessage, setInviteSuccessMessage] = useState<string | null>(null);

  // Role change + remove modal state
  const [changeRoleTarget, setChangeRoleTarget] = useState<CompanyMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CompanyMember | null>(null);

  // Edit name modal state
  const [editNameTarget, setEditNameTarget] = useState<CompanyMember | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  const load = useCallback(async (): Promise<CompanyMember[]> => {
    if (!companyId) {
      setMembers([]);
      setCurrentMember(null);
      return [];
    }
    const all = await companyRepositoryV2.getMembers(companyId);
    setMembers(all);
    setCurrentMember(all.find((m) => m.userId === profileId) ?? null);
    return all;
  }, [companyId, profileId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((error) => {
        if (active) {
          Alert.alert('Team members unavailable', errorMessage(error, 'Could not load company members.'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  function openInviteModal() {
    setInviteName('');
    setInviteEmail('');
    setInviteRole('recruiter');
    setInviteError(null);
    setInviteSuccessMessage(null);
    setInviteModalVisible(true);
  }

  function closeInviteModal() {
    if (inviteSubmitting) return;
    setInviteModalVisible(false);
    setInviteError(null);
  }

  async function doInviteMember() {
    if (!companyId) {
      setInviteError('Your company membership could not be resolved.');
      return;
    }

    const email = inviteEmail.trim().toLowerCase();
    if (!isValidEmail(email)) {
      setInviteError('Enter a valid email address.');
      return;
    }

    setInviteSubmitting(true);
    setInviteError(null);
    try {
      const freshMembers = await load();
      const actingMember = freshMembers.find((m) => m.userId === profileId);
      if (!actingMember || !canManageCompanyMembers(actingMember.role)) {
        throw new Error(ADMIN_ONLY_MESSAGE);
      }

      await companyRepositoryV2.addMember(companyId, email, inviteRole, inviteName.trim() || undefined);
      await load();
      setInviteModalVisible(false);
      setInviteName('');
      setInviteEmail('');
      setInviteRole('recruiter');
      setInviteSuccessMessage('Invitation sent. The user must open the email and set a password before signing in.');
    } catch (error) {
      setInviteError(errorMessage(error, 'Could not invite member.'));
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function doChangeRole(member: CompanyMember, newRole: CompanyMemberRole) {
    if (!companyId) {
      Alert.alert('Error', 'Your company membership could not be resolved.');
      return;
    }

    setActioning(member.id);
    try {
      const freshMembers = await load();
      const actingMember = freshMembers.find((m) => m.userId === profileId);
      if (!actingMember || !canManageCompanyMembers(actingMember.role)) {
        throw new Error(ADMIN_ONLY_MESSAGE);
      }

      const target = freshMembers.find((m) => m.id === member.id);
      if (!target) throw new Error('Member could not be found in your company.');

      if (target.role === 'admin' && newRole !== 'admin') {
        const adminCount = freshMembers.filter((m) => m.role === 'admin').length;
        if (adminCount <= 1) throw new Error(LAST_ADMIN_MESSAGE);
      }

      await companyRepositoryV2.updateMemberRole(companyId, target.id, newRole);
      await load();
    } catch (error) {
      Alert.alert('Error', errorMessage(error, 'Could not change role.'));
    } finally {
      setActioning(null);
    }
  }

  async function doRemoveMember(member: CompanyMember) {
    if (!companyId) {
      Alert.alert('Error', 'Your company membership could not be resolved.');
      return;
    }

    setActioning(member.id);
    try {
      const freshMembers = await load();
      const actingMember = freshMembers.find((m) => m.userId === profileId);
      if (!actingMember || !canManageCompanyMembers(actingMember.role)) {
        throw new Error(ADMIN_ONLY_MESSAGE);
      }

      const target = freshMembers.find((m) => m.id === member.id);
      if (!target) throw new Error('Member could not be found in your company.');

      if (target.role === 'admin') {
        const adminCount = freshMembers.filter((m) => m.role === 'admin').length;
        if (adminCount <= 1) throw new Error(LAST_ADMIN_MESSAGE);
      }

      await companyRepositoryV2.removeMember(companyId, target.id);
      await load();
    } catch (error) {
      Alert.alert('Error', errorMessage(error, 'Could not remove member.'));
    } finally {
      setActioning(null);
    }
  }

  async function doEditName(member: CompanyMember, newName: string) {
    if (!companyId) {
      Alert.alert('Error', 'Your company membership could not be resolved.');
      return;
    }

    setActioning(member.id);
    try {
      await companyRepositoryV2.updateMemberName(companyId, member.id, newName);
      await load();
    } catch (error) {
      Alert.alert('Error', errorMessage(error, 'Could not update member name.'));
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
          <TouchableOpacity
            style={styles.headerAction}
            onPress={openInviteModal}
            activeOpacity={0.75}
          >
            <UserPlus color={companyUi.surface} size={15} strokeWidth={2.2} />
            <Text style={styles.headerActionText}>Invite</Text>
          </TouchableOpacity>
        </View>

        {inviteSuccessMessage ? (
          <View style={styles.inviteSuccess}>
            <Text style={styles.inviteSuccessTitle}>Invitation sent</Text>
            <Text style={styles.inviteSuccessText}>{inviteSuccessMessage}</Text>
          </View>
        ) : null}

        <View style={styles.metricRow}>
          <Metric value={adminCount} label="Admins" />
          <Metric value={recruiterCount} label="Recruiters" />
          <Metric value={viewerCount} label="Viewers" />
        </View>

        <View style={styles.sessionStrip}>
          <IconBox icon={ShieldCheck} size={17} color={companyUi.navy} backgroundColor={companyUi.surfaceSoft} />
          <View style={styles.sessionCopy}>
            <Text style={styles.sessionTitle}>Your admin session</Text>
            <Text style={styles.sessionText} numberOfLines={1}>
              {currentMember ? memberDisplayName(currentMember) : profileId}
            </Text>
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
                  <InitialAvatar label={avatarInitial(member)} color={roleColor(member.role)} />
                  <View style={styles.memberInfo}>
                    <View style={styles.memberTop}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {memberDisplayName(member)}
                      </Text>
                      <View style={styles.memberBadges}>
                        {isCurrentUser ? <CompanyBadge label="Current" tone="cyan" small /> : null}
                        <CompanyBadge label={ROLE_LABELS[member.role]} tone={roleTone(member.role)} small />
                      </View>
                    </View>
                    {member.email ? (
                      <Text style={styles.memberEmail} numberOfLines={1}>{member.email}</Text>
                    ) : null}
                    <Text style={styles.memberMeta}>Added {formatDate(member.createdAt)}</Text>
                    <Text style={styles.memberHint}>{ROLE_HINTS[member.role]}</Text>
                  </View>
                </View>

                <View style={styles.memberActions}>
                  <TouchableOpacity
                    style={[styles.editButton, isActioning && styles.disabled]}
                    onPress={() => {
                      setEditNameValue(member.displayName ?? '');
                      setEditNameTarget(member);
                    }}
                    disabled={isActioning}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.editButtonText}>Edit name</Text>
                  </TouchableOpacity>
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
                    onPress={() => {
                      if (isLastAdmin) {
                        Alert.alert('Cannot remove member', LAST_ADMIN_MESSAGE);
                        return;
                      }
                      if (isCurrentUser) {
                        Alert.alert('Cannot remove member', 'You cannot remove your own company membership from this screen.');
                        return;
                      }
                      setRemoveTarget(member);
                    }}
                    disabled={isActioning}
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

      {/* Invite member modal */}
      <InviteMemberModal
        visible={inviteModalVisible}
        name={inviteName}
        email={inviteEmail}
        role={inviteRole}
        loading={inviteSubmitting}
        error={inviteError}
        onChangeName={setInviteName}
        onChangeEmail={setInviteEmail}
        onChangeRole={setInviteRole}
        onSubmit={doInviteMember}
        onCancel={closeInviteModal}
      />

      {/* Change role modal */}
      <RolePickerModal
        visible={changeRoleTarget !== null}
        title="Change role"
        subtitle={`New role for ${changeRoleTarget ? memberDisplayName(changeRoleTarget) : 'member'}.`}
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

      {/* Remove member modal */}
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
              Remove {removeTarget ? memberDisplayName(removeTarget) : 'this member'} from the company team.
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

      {/* Edit name modal */}
      <Modal
        visible={editNameTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditNameTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <CompanyCard style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit name</Text>
            <Text style={styles.modalSub} numberOfLines={2}>
              Display name for {editNameTarget?.email ?? editNameTarget?.userId ?? 'this member'}.
            </Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={editNameValue}
                onChangeText={setEditNameValue}
                placeholder="e.g. Maria García"
                placeholderTextColor={companyUi.textMuted}
                maxLength={100}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity
              style={styles.modalPrimary}
              onPress={() => {
                const target = editNameTarget;
                setEditNameTarget(null);
                if (target) doEditName(target, editNameValue);
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.modalPrimaryText}>Save name</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setEditNameTarget(null)}>
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

function InviteMemberModal({
  visible,
  name,
  email,
  role,
  loading,
  error,
  onChangeName,
  onChangeEmail,
  onChangeRole,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  name: string;
  email: string;
  role: CompanyMemberRole;
  loading: boolean;
  error: string | null;
  onChangeName: (name: string) => void;
  onChangeEmail: (email: string) => void;
  onChangeRole: (role: CompanyMemberRole) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <CompanyCard style={styles.modalCard}>
          <Text style={styles.modalTitle}>Invite member</Text>
          <Text style={styles.modalSub}>Send access to a company user.</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Name (optional)</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={onChangeName}
              placeholder="e.g. Maria García"
              placeholderTextColor={companyUi.textMuted}
              maxLength={100}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={onChangeEmail}
              placeholder="name@company.com"
              placeholderTextColor={companyUi.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Role</Text>
            <View style={styles.inviteRoleRow}>
              {INVITE_ROLES.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.inviteRoleOption,
                    role === option && styles.inviteRoleOptionActive,
                    loading && styles.disabled,
                  ]}
                  onPress={() => onChangeRole(option)}
                  disabled={loading}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.inviteRoleText,
                      role === option && styles.inviteRoleTextActive,
                    ]}
                  >
                    {ROLE_LABELS[option]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {error ? <Text style={styles.modalError}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.modalPrimary, loading && styles.disabled]}
            onPress={onSubmit}
            disabled={loading}
            activeOpacity={0.75}
          >
            {loading ? (
              <ActivityIndicator size="small" color={companyUi.surface} />
            ) : (
              <Text style={styles.modalPrimaryText}>Send invite</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.modalCancel} onPress={onCancel} disabled={loading}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </CompanyCard>
      </View>
    </Modal>
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
  inviteSuccess: {
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: companyUi.greenSoft,
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  inviteSuccessTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: companyUi.green,
  },
  inviteSuccessText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: companyUi.textSoft,
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
  memberEmail: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: companyUi.textMuted,
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
    gap: spacing.xs,
  },
  editButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: companyUi.surfaceSoft,
    borderWidth: 1,
    borderColor: companyUi.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: companyUi.textSoft,
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
    fontSize: 12,
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
    gap: 5,
  },
  dangerButtonText: {
    fontSize: 12,
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
  inputGroup: {
    gap: 7,
  },
  inputLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: companyUi.textSoft,
  },
  input: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: companyUi.border,
    backgroundColor: companyUi.surfaceSoft,
    paddingHorizontal: 12,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: companyUi.text,
  },
  inviteRoleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  inviteRoleOption: {
    minHeight: 36,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: companyUi.border,
    backgroundColor: companyUi.surfaceSoft,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteRoleOptionActive: {
    borderColor: companyUi.accent,
    backgroundColor: companyUi.accent,
  },
  inviteRoleText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: companyUi.textSoft,
  },
  inviteRoleTextActive: {
    color: companyUi.surface,
  },
  modalError: {
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: companyUi.redSoft,
    borderRadius: 14,
    padding: 10,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: companyUi.red,
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
  modalPrimary: {
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: companyUi.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryText: {
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
