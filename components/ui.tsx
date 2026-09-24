// components/ui.tsx
// Reusable building blocks used across every screen.
// Building these ONCE means consistent styling everywhere.
// Change a component here → it updates on every screen automatically.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { COLORS, SPACING, RADIUS } from '../constants';

// ─── BUTTON ────────────────────────────────────────────────────────────────
interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  style?: ViewStyle;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
}) => {
  const isDisabled = disabled || loading;

  const buttonStyle = [
    styles.button,
    variant === 'primary' && styles.buttonPrimary,
    variant === 'secondary' && styles.buttonSecondary,
    variant === 'ghost' && styles.buttonGhost,
    isDisabled && styles.buttonDisabled,
    style,
  ];

  const textStyle = [
    styles.buttonText,
    variant === 'secondary' && styles.buttonTextSecondary,
    variant === 'ghost' && styles.buttonTextGhost,
  ];

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? COLORS.white : COLORS.primary} size="small" />
      ) : (
        <Text style={textStyle}>{label}</Text>
      )}
    </TouchableOpacity>
  );
};

// ─── INPUT ─────────────────────────────────────────────────────────────────
interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  containerStyle,
  ...props
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.inputContainer, containerStyle]}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          error && styles.inputError,
        ]}
        placeholderTextColor={COLORS.textTertiary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

// ─── CARD ──────────────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const Card: React.FC<CardProps> = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

// ─── BADGE ─────────────────────────────────────────────────────────────────
interface BadgeProps {
  label: string;
  color?: string;
}

export const Badge: React.FC<BadgeProps> = ({ label, color = COLORS.primary }) => (
  <View style={[styles.badge, { backgroundColor: color + '22' }]}>
    <Text style={[styles.badgeText, { color }]}>{label}</Text>
  </View>
);

// ─── DIVIDER ───────────────────────────────────────────────────────────────
export const Divider: React.FC<{ label?: string }> = ({ label }) => (
  <View style={styles.dividerContainer}>
    <View style={styles.dividerLine} />
    {label && <Text style={styles.dividerLabel}>{label}</Text>}
    {label && <View style={styles.dividerLine} />}
  </View>
);

// ─── STYLES ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Button
  button: {
    height: 56,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  buttonPrimary: {
    backgroundColor: COLORS.primary,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  buttonGhost: {
    backgroundColor: 'transparent',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  buttonTextSecondary: {
    color: COLORS.primary,
  },
  buttonTextGhost: {
    color: COLORS.textSecondary,
  },

  // Input
  inputContainer: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    height: 54,
    paddingHorizontal: SPACING.md,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  inputFocused: {
    borderColor: COLORS.primary,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: SPACING.xs,
    marginLeft: 2,
  },

  // Card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },

  // Badge
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Divider
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.borderLight,
  },
  dividerLabel: {
    color: COLORS.textTertiary,
    fontSize: 13,
    marginHorizontal: SPACING.md,
  },
});