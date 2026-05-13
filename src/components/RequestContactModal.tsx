import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Button } from './Button';
import { colors, spacing, typography } from '../theme';
import { SafeTechnicianView } from '../types';

interface RequestContactModalProps {
  visible: boolean;
  technician: SafeTechnicianView | null;
  onConfirm: (message: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

const DEFAULT_MESSAGE =
  'We have reviewed your profile and would like to discuss a potential opportunity. Looking forward to connecting.';

export function RequestContactModal({
  visible,
  technician,
  onConfirm,
  onCancel,
  loading = false,
}: RequestContactModalProps) {
  const [message, setMessage] = useState('');

  function handleConfirm() {
    onConfirm(message.trim() || DEFAULT_MESSAGE);
    setMessage('');
  }

  function handleCancel() {
    setMessage('');
    onCancel();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={[typography.h4, styles.title]}>Request Contact</Text>

          {technician ? (
            <Text style={styles.code}>{technician.anonymousCode}</Text>
          ) : null}

          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              The technician's full identity will only be shared if they accept your
              request. Your company details will be visible to them.
            </Text>
          </View>

          <Text style={styles.inputLabel}>Message (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder={DEFAULT_MESSAGE}
            placeholderTextColor={colors.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={3}
            maxLength={400}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{message.length}/400</Text>

          <View style={styles.actions}>
            <Button
              label="Cancel"
              variant="outline"
              onPress={handleCancel}
              style={styles.cancelBtn}
            />
            <Button
              label="Send Request"
              variant="primary"
              onPress={handleConfirm}
              loading={loading}
              style={styles.sendBtn}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10,22,40,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    marginBottom: spacing.xs,
  },
  code: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.company,
    marginBottom: spacing.md,
    letterSpacing: 0.4,
  },
  notice: {
    backgroundColor: colors.blue + '12',
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.blue,
  },
  noticeText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.text,
    minHeight: 80,
    backgroundColor: colors.background,
  },
  charCount: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
  },
  sendBtn: {
    flex: 2,
  },
});
