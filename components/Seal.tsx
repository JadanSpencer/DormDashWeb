// components/Seal.tsx
// A vermilion hanko (name seal), like the artist's stamp on a woodblock
// print: 寮 ("dormitory") in Yuji Syuku brush script, slightly rotated as
// if pressed by hand. Used beside the DormDash wordmark.
//
// The font file contains only 寮 配 走 (assets/fonts/YujiSyuku-Seal.ttf).
// To use another character, re-subset the font first.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FONT, T } from '../constants/theme';

export function Seal({ size = 40, char = '寮' }: { size?: number; char?: '寮' | '配' | '走' }) {
  return (
    <View
      accessible
      accessibilityLabel="DormDash seal"
      style={[styles.seal, {
        width: size, height: size, borderRadius: size * 0.14,
        transform: [{ rotate: '-4deg' }],
      }]}
    >
      <View style={[styles.inner, { borderRadius: size * 0.1, margin: size * 0.07 }]} />
      <Text
        allowFontScaling={false}
        style={{ fontFamily: FONT.seal, fontSize: size * 0.62, lineHeight: size * 0.9, color: T.color.cream }}
      >
        {char}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  seal: { backgroundColor: T.color.shu, alignItems: 'center', justifyContent: 'center' },
  inner: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1, borderColor: 'rgba(250, 245, 236, 0.55)',
  },
});
