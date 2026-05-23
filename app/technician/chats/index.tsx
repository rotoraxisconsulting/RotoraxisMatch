import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { colors, spacing } from '../../../src/theme';
import { LoadingScreen } from '../../../src/components/LoadingScreen';
import { chatRepository } from '../../../src/repositories/v2/chatRepository';
import { offerRequestRepository } from '../../../src/repositories/v2/offerRequestRepository';
import { offerApplicationRepository } from '../../../src/repositories/v2/offerApplicationRepository';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { companyRepositoryV2 } from '../../../src/repositories/v2/companyRepositoryV2';
import { DEMO_TECHNICIAN_ID } from '../../../src/state/useTechnicianDashboard';
import { ChatRoom, ChatMessage } from '../../../src/types/chat';

type RoomEntry = {
  room: ChatRoom;
  companyName: string;
  offerTitle: string | null;
  lastMessage: ChatMessage | null;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function TechnicianChatsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [entries, setEntries] = useState<RoomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const rooms = await chatRepository.getRoomsForTechnician(DEMO_TECHNICIAN_ID);

    const built = await Promise.all(rooms.map(async (room) => {
      let offerId: string | undefined;

      if (room.offerRequestId) {
        const req = await offerRequestRepository.getById(room.offerRequestId);
        offerId = req?.offerId;
      } else if (room.offerApplicationId) {
        const app = await offerApplicationRepository.getById(room.offerApplicationId);
        offerId = app?.offerId;
      }

      const [company, offer, messages] = await Promise.all([
        companyRepositoryV2.getById(room.companyId),
        offerId ? offerRepository.getById(offerId) : Promise.resolve(null),
        chatRepository.getMessages(room.id),
      ]);

      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

      return {
        room,
        companyName: company?.name ?? 'Company',
        offerTitle: offer?.title ?? null,
        lastMessage,
      };
    }));

    built.sort((a, b) => {
      const aTime = a.lastMessage?.sentAt ?? a.room.createdAt;
      const bTime = b.lastMessage?.sentAt ?? b.room.createdAt;
      return bTime.localeCompare(aTime);
    });

    setEntries(built);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      load().finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Chats' }} />
        <LoadingScreen color={colors.technician} role="technician" />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Chats' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Chats</Text>
          <Text style={styles.pageSub}>
            {entries.length} conversation{entries.length !== 1 ? 's' : ''} · accepted contacts only
          </Text>
        </View>

        {entries.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>No chats yet</Text>
            <Text style={styles.emptySub}>
              Chat becomes available when a company accepts your application or you accept their direct offer.
            </Text>
          </View>
        )}

        {entries.map(({ room, companyName, offerTitle, lastMessage }) => (
          <TouchableOpacity
            key={room.id}
            style={styles.card}
            onPress={() => router.push(`/technician/chats/${room.id}` as any)}
            activeOpacity={0.75}
          >
            <View style={styles.cardTop}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{companyName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.companyName} numberOfLines={1}>{companyName}</Text>
                  {lastMessage && (
                    <Text style={styles.time}>{formatTime(lastMessage.sentAt)}</Text>
                  )}
                </View>
                {offerTitle && (
                  <Text style={styles.offerLine} numberOfLines={1}>{offerTitle}</Text>
                )}
                <Text style={styles.preview} numberOfLines={1}>
                  {lastMessage
                    ? (lastMessage.senderRole === 'technician' ? 'You: ' : '') + lastMessage.body
                    : 'No messages yet'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  contentWide: { maxWidth: 720, alignSelf: 'center', width: '100%' },
  headerRow: { marginBottom: spacing.md },
  pageTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 2 },
  pageSub: { fontSize: 12, color: colors.textSecondary },
  empty: { alignItems: 'center', paddingVertical: spacing.xxxl },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptySub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', maxWidth: 280 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: colors.white },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  companyName: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
  time: { fontSize: 11, color: colors.textMuted, flexShrink: 0, paddingLeft: spacing.xs },
  offerLine: { fontSize: 11, color: colors.technician, fontWeight: '600', marginBottom: 2 },
  preview: { fontSize: 12, color: colors.textSecondary },
});
