import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { colors, spacing } from '../../../src/theme';
import { LoadingScreen } from '../../../src/components/LoadingScreen';
import { chatRepository } from '../../../src/repositories/v2/chatRepository';
import { offerRequestRepository } from '../../../src/repositories/v2/offerRequestRepository';
import { offerApplicationRepository } from '../../../src/repositories/v2/offerApplicationRepository';
import { offerRepository } from '../../../src/repositories/v2/offerRepository';
import { technicianRepositoryV2 } from '../../../src/repositories/v2/technicianRepositoryV2';
import { isUnlocked } from '../../../src/types/privacy';
import { DEMO_COMPANY_ID, DEMO_COMPANY_MEMBER_ROLE } from '../../../src/state/useCompanyDashboard';
import { canSendChatMessages } from '../../../src/utils/companyPermissionsV2';
import { ChatRoom, ChatMessage } from '../../../src/types/chat';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
    ' · ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function CompanyChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const scrollRef = useRef<ScrollView>(null);

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [headerTitle, setHeaderTitle] = useState('Chat');
  const [subTitle, setSubTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;

    const r = await chatRepository.getRoom(id);
    if (!r) { setLocked(true); return; }
    setRoom(r);

    // Verify linked record is still accepted
    let isAccepted = false;
    let offerId: string | undefined;

    if (r.offerRequestId) {
      const req = await offerRequestRepository.getById(r.offerRequestId);
      isAccepted = req?.status === 'accepted';
      offerId = req?.offerId;
    } else if (r.offerApplicationId) {
      const app = await offerApplicationRepository.getById(r.offerApplicationId);
      isAccepted = app?.status === 'accepted';
      offerId = app?.offerId;
    }

    if (!isAccepted) { setLocked(true); return; }

    const [techView, offer, msgs] = await Promise.all([
      technicianRepositoryV2.getViewForCompany(r.technicianId, DEMO_COMPANY_ID),
      offerId ? offerRepository.getById(offerId) : Promise.resolve(null),
      chatRepository.getMessages(id),
    ]);

    const techDisplay = techView && isUnlocked(techView)
      ? `${techView.firstName} ${techView.lastName}`
      : (techView?.anonymousCode ?? 'Technician');

    setHeaderTitle(techDisplay);
    setSubTitle(offer?.title ?? '');
    setMessages(msgs);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [messages]);

  async function handleSend() {
    const body = text.trim();
    if (!body || !id) return;
    setSending(true);
    try {
      const msg = await chatRepository.sendMessage(id, DEMO_COMPANY_ID, 'company', body);
      setText('');
      setMessages((prev) => [...prev, msg]);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not send message.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Chat' }} />
        <LoadingScreen color={colors.blue} role="company" />
      </>
    );
  }

  if (locked || !room) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Chat' }} />
        <View style={styles.locked}>
          <Text style={styles.lockedIcon}>🔒</Text>
          <Text style={styles.lockedTitle}>Chat unavailable</Text>
          <Text style={styles.lockedSub}>
            This chat is only accessible for accepted contacts.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: headerTitle }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Chat header */}
        {subTitle ? (
          <View style={styles.chatHeader}>
            <Text style={styles.chatHeaderSub} numberOfLines={1}>{subTitle}</Text>
          </View>
        ) : null}

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={[styles.messagesContent, isWide && styles.messagesWide]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 && (
            <View style={styles.noMessages}>
              <Text style={styles.noMessagesText}>No messages yet. Say hello!</Text>
            </View>
          )}
          {messages.map((msg) => {
            const isMine = msg.senderRole === 'company';
            return (
              <View key={msg.id} style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
                  {msg.body}
                </Text>
                <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs]}>
                  {formatTime(msg.sentAt)}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Input bar */}
        {/* TODO: enforce canSendChatMessages via Supabase RLS in V2-9 */}
        {canSendChatMessages(DEMO_COMPANY_MEMBER_ROLE) ? (
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Type a message…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={1000}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || sending}
              activeOpacity={0.75}
            >
              <Text style={styles.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inputBar}>
            <Text style={styles.viewerNote}>Viewer role — cannot send messages.</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  locked: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  lockedIcon: { fontSize: 40, marginBottom: spacing.md },
  lockedTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  lockedSub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', maxWidth: 280 },
  chatHeader: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
  },
  chatHeaderSub: { fontSize: 12, color: colors.blue, fontWeight: '600' },
  messages: { flex: 1 },
  messagesContent: { padding: spacing.md, paddingBottom: spacing.lg },
  messagesWide: { maxWidth: 720, alignSelf: 'center', width: '100%' },
  noMessages: { alignItems: 'center', paddingVertical: spacing.xl },
  noMessagesText: { fontSize: 13, color: colors.textMuted },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  bubbleMine: {
    backgroundColor: colors.blue,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextMine: { color: colors.white },
  bubbleTextTheirs: { color: colors.text },
  bubbleTime: { fontSize: 10, marginTop: 4 },
  bubbleTimeMine: { color: colors.white + 'AA', textAlign: 'right' },
  bubbleTimeTheirs: { color: colors.textMuted },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: colors.blue,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  viewerNote: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
