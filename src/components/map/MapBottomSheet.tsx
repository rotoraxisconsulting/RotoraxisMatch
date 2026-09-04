import React from 'react';
import {
  Modal,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../../theme';
import { techUi } from '../technician/TechnicianUI';

export interface MapBottomSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  sheetStyle?: StyleProp<ViewStyle>;
  closeLabel?: string;
}

export function MapBottomSheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
  contentContainerStyle,
  sheetStyle,
  closeLabel = 'Close panel',
}: MapBottomSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <TouchableOpacity
        accessibilityLabel={closeLabel}
        accessibilityRole="button"
        activeOpacity={1}
        onPress={onClose}
        style={styles.overlay}
      />
      <View
        accessibilityViewIsModal
        style={[styles.sheet, sheetStyle]}
      >
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            activeOpacity={0.75}
            onPress={onClose}
            style={styles.close}
          >
            <X color={techUi.text} size={20} strokeWidth={2.3} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            contentContainerStyle,
            !footer && { paddingBottom: Math.max(insets.bottom, spacing.lg) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>

        {footer ? (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            {footer}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10,21,32,0.46)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '86%',
    maxWidth: 620,
    alignSelf: 'center',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: techUi.surface,
    paddingTop: 8,
    overflow: 'hidden',
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: techUi.border,
    marginBottom: 6,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '800', color: techUi.text },
  subtitle: { marginTop: 2, fontSize: 12, lineHeight: 16, fontWeight: '500', color: techUi.textMuted },
  close: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: techUi.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: techUi.borderSoft,
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: techUi.surface,
  },
});
