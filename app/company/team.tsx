import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Modal,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { colors, spacing } from '../../src/theme';
import { LoadingScreen } from '../../src/components/LoadingScreen';
import { Badge } from '../../src/components/Badge';
import { companyRepositoryV2 } from '../../src/repositories/v2/companyRepositoryV2';
import {
  canManageCompanyMembers,
} from '../../src/utils/companyPermissionsV2';
import {
  DEMO_COMPANY_ID,
  DEMO_COMPANY_USER_ID,
  DEMO_COMPANY_MEMBER_ID,
} from '../../src/state/useCompanyDashboard';
import { CompanyMember } from '../../src/types/company';
import { CompanyMemberRole } from '../../src/types/enums';

const ROLE_LABELS: Record<CompanyMemberRole, string> = {
  admin: 'Admin',
  recruiter: 'Recruiter',
  viewer: 'Viewer',
};

type RoleBadgeVariant = 'navy' | 'success' | 'warning';
const ROLE_VARIANT: Record<CompanyMemberRole, RoleBadgeVariant> = {
  admin: 'navy',
  recruiter: 'success',
  viewer: 'warning',
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

export default function CompanyTeamScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [companyName, setCompanyName] = useState('');
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [currentMember, setCurrentMember] = useState<CompanyMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null); // memberId being actioned
  const [showAddModal, setShowAddModal] = useState(false);
  const [changeRoleTarget, setChangeRoleTarget] = useState<CompanyMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CompanyMember | null>(null);

  const load = useCallback(async () => {
    const [company, all] = await Promise.all([
      companyRepositoryV2.getById(DEMO_COMPANY_ID),
      companyRepositoryV2.getMembers(DEMO_COMPANY_ID),
    ]);
    setCompanyName(company?.name ?? 'Company');
    setMembers(all);
    setCurrentMember(all.find((m) => m.userId === DEMO_COMPANY_USER_ID) ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      load().finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function handleAddMember() {
    setShowAddModal(true);
  }

  async function doAddMember(role: CompanyMemberRole) {
    const demoUserId = `demo-user-${Date.now()}`;
    try {
      await companyRepositoryV2.addMember(DEMO_COMPANY_ID, demoUserId, role);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not add member.');
    }
  }

  function handleChangeRole(member: CompanyMember) {
    setChangeRoleTarget(member);
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

  function handleRemoveMember(member: CompanyMember) {
    setRemoveTarget(member);
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
      <>
        <Stack.Screen options={{ title: 'Company Team' }} />
        <LoadingScreen color={colors.blue} role="company" />
      </>
    );
  }

  const currentRole = currentMember?.role ?? 'viewer';
  const isAdmin = canManageCompanyMembers(currentRole);
  const adminCount = members.filter((m) => m.role === 'admin').length;

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Company Team' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>{companyName}</Text>
          <Text style={styles.pageSub}>
            {members.length} team member{members.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Current user role card */}
        <View style={styles.currentUserCard}>
          <View style={styles.currentUserLeft}>
            <View style={styles.currentUserAvatar}>
              <Text style={styles.currentUserAvatarText}>
                {avatarInitial(DEMO_COMPANY_USER_ID)}
              </Text>
            </View>
            <View>
              <Text style={styles.currentUserLabel}>Logged in as (demo)</Text>
              <Text style={styles.currentUserId} numberOfLines={1}>
                {DEMO_COMPANY_USER_ID}
              </Text>
            </View>
          </View>
          <Badge
            label={ROLE_LABELS[currentRole]}
            variant={ROLE_VARIANT[currentRole]}
          />
        </View>

        {/* Permission hint for non-admin */}
        {!isAdmin && (
          <View style={styles.permissionNote}>
            <Text style={styles.permissionNoteText}>
              {currentRole === 'viewer'
                ? 'Viewer role — read-only access. Contact an admin to request changes.'
                : 'Recruiter role — team management requires admin access.'}
            </Text>
          </View>
        )}

        {/* Members list */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Members</Text>
          {isAdmin && (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={handleAddMember}
              activeOpacity={0.75}
            >
              <Text style={styles.addBtnText}>+ Add demo member</Text>
            </TouchableOpacity>
          )}
        </View>

        {members.map((member) => {
          const isCurrentUser = member.userId === DEMO_COMPANY_USER_ID;
          const isLastAdmin = member.role === 'admin' && adminCount <= 1;
          const isActioning = actioning === member.id;

          return (
            <View key={member.id} style={[styles.memberCard, isCurrentUser && styles.memberCardCurrent]}>
              <View style={styles.memberMain}>
                <View style={[styles.memberAvatar, { backgroundColor: roleAvatarColor(member.role) }]}>
                  <Text style={styles.memberAvatarText}>
                    {avatarInitial(member.userId)}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <View style={styles.memberTopRow}>
                    <Text style={styles.memberUserId} numberOfLines={1}>
                      {member.userId}
                      {isCurrentUser && (
                        <Text style={styles.youLabel}> (you)</Text>
                      )}
                    </Text>
                    <Badge
                      label={ROLE_LABELS[member.role]}
                      variant={ROLE_VARIANT[member.role]}
                      small
                    />
                  </View>
                  <Text style={styles.memberDate}>
                    Added {formatDate(member.createdAt)}
                  </Text>
                  {/* TODO: enforce role change / remove via Supabase RLS in V2-9 */}
                </View>
              </View>

              {isAdmin && (
                <View style={styles.memberActions}>
                  <TouchableOpacity
                    style={[
                      styles.roleBtn,
                      isActioning && styles.btnDisabled,
                    ]}
                    onPress={() => handleChangeRole(member)}
                    disabled={isActioning}
                    activeOpacity={0.75}
                  >
                    {isActioning ? (
                      <ActivityIndicator size="small" color={colors.blue} />
                    ) : (
                      <Text style={styles.roleBtnText}>Change role</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.removeBtn,
                      (isLastAdmin || isCurrentUser || isActioning) &&
                        styles.btnDisabled,
                    ]}
                    onPress={() => handleRemoveMember(member)}
                    disabled={isLastAdmin || isCurrentUser || isActioning}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.removeBtnText,
                        (isLastAdmin || isCurrentUser) && styles.removeBtnTextDisabled,
                      ]}
                    >
                      {isLastAdmin ? 'Last admin' : 'Remove'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {/* Demo note */}
        <View style={styles.demoNote}>
          <Text style={styles.demoNoteText}>
            Demo mode — member management is local only. In production, Supabase RLS will
            enforce these permissions server-side.
          </Text>
        </View>
      </ScrollView>

      {/* Add Member Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.card}>
            <Text style={modalStyles.title}>Add demo member</Text>
            <Text style={modalStyles.subtitle}>Select a role for the new demo member:</Text>
            {(['admin', 'recruiter', 'viewer'] as CompanyMemberRole[]).map((role) => (
              <TouchableOpacity
                key={role}
                style={modalStyles.optionBtn}
                onPress={() => { setShowAddModal(false); doAddMember(role); }}
                activeOpacity={0.75}
              >
                <Text style={modalStyles.optionBtnText}>{ROLE_LABELS[role]}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={modalStyles.cancelBtn}
              onPress={() => setShowAddModal(false)}
              activeOpacity={0.75}
            >
              <Text style={modalStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change Role Modal */}
      <Modal
        visible={changeRoleTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setChangeRoleTarget(null)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.card}>
            <Text style={modalStyles.title}>Change role</Text>
            <Text style={modalStyles.subtitle} numberOfLines={2}>
              New role for {changeRoleTarget?.userId}:
            </Text>
            {(['admin', 'recruiter', 'viewer'] as CompanyMemberRole[])
              .filter((r) => r !== changeRoleTarget?.role)
              .map((role) => (
                <TouchableOpacity
                  key={role}
                  style={modalStyles.optionBtn}
                  onPress={() => {
                    const target = changeRoleTarget;
                    setChangeRoleTarget(null);
                    if (target) doChangeRole(target, role);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={modalStyles.optionBtnText}>{ROLE_LABELS[role]}</Text>
                </TouchableOpacity>
              ))}
            <TouchableOpacity
              style={modalStyles.cancelBtn}
              onPress={() => setChangeRoleTarget(null)}
              activeOpacity={0.75}
            >
              <Text style={modalStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Remove Member Modal */}
      <Modal
        visible={removeTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRemoveTarget(null)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.card}>
            <Text style={modalStyles.title}>Remove member?</Text>
            <Text style={modalStyles.subtitle} numberOfLines={2}>
              Remove {removeTarget?.userId} from the team?
            </Text>
            <TouchableOpacity
              style={modalStyles.destructiveBtn}
              onPress={() => {
                const target = removeTarget;
                setRemoveTarget(null);
                if (target) doRemoveMember(target);
              }}
              activeOpacity={0.75}
            >
              <Text style={modalStyles.destructiveBtnText}>Remove</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={modalStyles.cancelBtn}
              onPress={() => setRemoveTarget(null)}
              activeOpacity={0.75}
            >
              <Text style={modalStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function roleAvatarColor(role: CompanyMemberRole): string {
  if (role === 'admin') return colors.navy;
  if (role === 'recruiter') return colors.success;
  return colors.textMuted;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  contentWide: { maxWidth: 720, alignSelf: 'center', width: '100%' },

  headerRow: { marginBottom: spacing.md },
  pageTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 2 },
  pageSub: { fontSize: 12, color: colors.textSecondary },

  currentUserCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.blue + '30',
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  currentUserLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  currentUserAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  currentUserAvatarText: { fontSize: 14, fontWeight: '700', color: colors.white },
  currentUserLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500' },
  currentUserId: { fontSize: 13, fontWeight: '700', color: colors.text, maxWidth: 200 },

  permissionNote: {
    backgroundColor: colors.warning + '12',
    borderRadius: 10,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warning + '30',
    marginBottom: spacing.md,
  },
  permissionNoteText: { fontSize: 12, color: colors.warning, lineHeight: 18 },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addBtn: {
    backgroundColor: colors.blue,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  addBtnText: { fontSize: 12, fontWeight: '700', color: colors.white },

  memberCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberCardCurrent: {
    borderColor: colors.blue + '40',
  },
  memberMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  memberAvatarText: { fontSize: 16, fontWeight: '700', color: colors.white },
  memberInfo: { flex: 1 },
  memberTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginBottom: 2,
  },
  memberUserId: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  youLabel: { fontSize: 11, fontWeight: '500', color: colors.blue },
  memberDate: { fontSize: 11, color: colors.textMuted },

  memberActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  roleBtn: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: 8,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
  },
  roleBtnText: { fontSize: 12, fontWeight: '600', color: colors.blue },
  removeBtn: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 8,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
  },
  removeBtnText: { fontSize: 12, fontWeight: '600', color: colors.error },
  removeBtnTextDisabled: { color: colors.textMuted },
  btnDisabled: { opacity: 0.5 },

  demoNote: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  demoNoteText: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    fontStyle: 'italic',
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 19,
  },
  optionBtn: {
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: 10,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  optionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.blue,
  },
  destructiveBtn: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 10,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  destructiveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.error,
  },
  cancelBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  cancelBtnText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
});
