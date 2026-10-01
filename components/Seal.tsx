// components/Seal.tsx
// The flyer's gold stamp (like its "Launching Oct 1" badge): a mustard
// circle with a dashed inner ring and a word or two in the italic headline
// face, tilted as if stuck on by hand. Marks an order's big moments:
//   '寮'  order placed   "Order in!"
//   '走'  on the way     "Runner a run!"
//   '配'  delivered      "Food land!"
// (The characters are kept as the API from the earlier seal design.) Small
// stamps (under 46px) show one mark instead of words so they stay legible.
// `stamp` presses it in once when it first appears (native driver); it stays
// still for people who reduce motion.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { FONT, T, useReducedMotion } from '../constants/theme';

type Char = '寮' | '配' | '走';
const WORDS: Record<Char, string[]> = { '寮': ['Order', 'in!'], '走': ['Runner', 'a run!'], '配': ['Food', 'land!'] };
const MARKS: Record<Char, string> = { '寮': '•', '走': '→', '配': '✓' };
const LABELS: Record<Char, string> = { '寮': 'Order placed', '走': 'On the way', '配': 'Delivered' };

export function Seal({
  size = 40, char = '寮', stamp = false, label, style,
}: {
  size?: number;
  char?: Char;
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
  const words = size >= 46 ? WORDS[char] : null;
  const fontSize = words ? size * (words.length > 1 ? 0.22 : 0.2) : size * 0.5;

  return (
    <Animated.View
      accessible
      accessibilityLabel={label ?? LABELS[char]}
      style={[styles.stamp, {
        width: size, height: size, borderRadius: size / 2,
        opacity, transform: [{ rotate: '-8deg' }, { scale }],
      }, style]}
    >
      <View style={[styles.ring, { borderRadius: size / 2, margin: Math.max(3, size * 0.07) }]} />
      {words ? words.map(w => (
        <Text key={w} allowFontScaling={false} style={[styles.word, { fontSize, lineHeight: fontSize * 1.08 }]}>{w}</Text>
      )) : (
        <Text allowFontScaling={false} style={[styles.mark, { fontSize, lineHeight: fontSize * 1.15 }]}>{MARKS[char]}</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    backgroundColor: T.color.mustard, alignItems: 'center', justifyContent: 'center',
    ...T.plate.mustard, shadowOffset: { width: 0, height: 2 },
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(22, 56, 69, 0.55)',
  },
  word: { fontFamily: FONT.heading, color: T.color.ink, textAlign: 'center' },
  mark: { fontWeight: '900', color: T.color.ink, textAlign: 'center' },
});
