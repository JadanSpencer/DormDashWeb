// components/Seal.tsx
// A vermilion hanko (name seal), like the artist's stamp on a woodblock
// print, in Yuji Syuku brush script, slightly rotated as if pressed by hand.
//   寮 ("dormitory")  the DormDash seal: wordmark, and "order placed"
//   走 ("run")        the dasher is on the way
//   配 ("deliver")    delivered
// `stamp` presses it in once when it first appears (a quick scale-down, on
// the native driver); it stays still for people who reduce motion.
//
// The font file contains only 寮 配 走 (assets/fonts/YujiSyuku-Seal.ttf).
// To use another character, re-subset the font first.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { FONT, T, useReducedMotion } from '../constants/theme';

const LABELS = { '寮': 'DormDash seal', '走': 'On the way', '配': 'Delivered' };

export function Seal({
  size = 40, char = '寮', stamp = false, label, style,
}: {
  size?: number;
  char?: '寮' | '配' | '走';
  stamp?: boolean;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const press = useRef(new Animated.Value(stamp ? 0 : 1)).current;
  useEffect(() => {
    if (!stamp) return;
    if (reduced) { press.setValue(1); return; }
    Animated.timing(press, {
      toValue: 1, duration: 320, delay: 150,
      easing: Easing.out(Easing.back(2.2)), useNativeDriver: true,
    }).start();
  }, [stamp, reduced]);

  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] });
  const opacity = press.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] });

  return (
    <Animated.View
      accessible
      accessibilityLabel={label ?? LABELS[char]}
      style={[styles.seal, {
        width: size, height: size, borderRadius: size * 0.14,
        opacity, transform: [{ rotate: '-4deg' }, { scale }],
      }, style]}
    >
      <View style={[styles.inner, { borderRadius: size * 0.1, margin: size * 0.07 }]} />
      <Text
        allowFontScaling={false}
        style={{ fontFamily: FONT.seal, fontSize: size * 0.62, lineHeight: size * 0.9, color: T.color.card }}
      >
        {char}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  seal: { backgroundColor: T.color.shu, alignItems: 'center', justifyContent: 'center' },
  inner: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1, borderColor: 'rgba(250, 252, 251, 0.55)',
  },
});
