import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { colors, spacing } from '../theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

const containerVariant: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.blue },
  secondary: { backgroundColor: colors.navy },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.blue,
  },
  ghost: { backgroundColor: 'transparent' },
};

const containerSize: Record<Size, ViewStyle> = {
  sm: { paddingHorizontal: spacing.md, paddingVertical: 6, minHeight: 36 },
  md: { paddingHorizontal: spacing.lg, paddingVertical: 12, minHeight: 48 },
  lg: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, minHeight: 56 },
};

const labelColor: Record<Variant, string> = {
  primary: colors.white,
  secondary: colors.white,
  outline: colors.blue,
  ghost: colors.blue,
};

const labelSize: Record<Size, number> = {
  sm: 13,
  md: 15,
  lg: 16,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        styles.base,
        containerVariant[variant],
        containerSize[size],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' || variant === 'secondary' ? colors.white : colors.blue}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.label,
            { color: labelColor[variant], fontSize: labelSize[size] },
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontWeight: '600',
  },
});
