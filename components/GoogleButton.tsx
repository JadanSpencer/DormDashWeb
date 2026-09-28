// components/GoogleButton.tsx
// "Continue with Google", following Google's sign-in button rules: the
// four-colour G on a light surface, the words "Continue with Google". The
// G's colours are Google's brand colours (the one place hex is used outside
// the theme; Google requires them unchanged).
// Only rendered where Google sign-in works (web, see services/auth.ts).

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { T } from '../constants/theme';
import { pressPlate } from './Tide';

export function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" accessibilityElementsHidden importantForAccessibility="no">
      <Path fill="#EA4335" d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z" />
      <Path fill="#4285F4" d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <Path fill="#FBBC05" d="M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A9.008 9.008 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z" />
      <Path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.97 13.04C2.45 15.98 5.48 18 9 18z" />
    </Svg>
  );
}

export function GoogleButton({ onPress, busy = false, disabled = false }: {
  onPress: () => void; busy?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ busy, disabled: busy || disabled }}
      style={({ pressed }) => [styles.btn, pressPlate(pressed, 3), (busy || disabled) && { opacity: 0.7 }]}
    >
      {busy ? <ActivityIndicator color={T.color.ink} /> : <GoogleG />}
      <Text style={styles.text}>Continue with Google</Text>
    </Pressable>
  );
}

/** A thin "or" rule between the email form and the Google button. */
export function OrRule() {
  return (
    <Text style={styles.or} accessibilityElementsHidden importantForAccessibility="no">or</Text>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    height: 54, borderRadius: T.radius.pill,
    backgroundColor: T.color.card, borderWidth: 1.5, borderColor: T.color.lineStrong,
    ...T.plate.card, shadowOffset: { width: 0, height: 3 },
  },
  text: { ...T.type.button, color: T.color.ink },
  or: { textAlign: 'center', color: T.color.inkFaint, fontSize: 13, fontWeight: '700', marginVertical: T.space.sm },
});
