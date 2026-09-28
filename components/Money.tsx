// components/Money.tsx
// Prices in the Tide Print style: the "J$" is set smaller than the digits,
// so the eye goes to the amount, and digits are fixed-width (tabular) so a
// total doesn't shift sideways as it changes. Anything that isn't J$ (e.g.
// "12.5 tokens") is shown as given.
//   <Money style={styles.price}>{fmt(value)}</Money>

import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

export function Money({ children, style, numberOfLines }: {
  children: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const m = /^(-?)J\$(.*)$/.exec(children);
  if (!m) return <Text style={[styles.tabular, style]} numberOfLines={numberOfLines}>{children}</Text>;
  const size = StyleSheet.flatten(style)?.fontSize ?? 15;
  return (
    <Text style={[styles.tabular, style]} numberOfLines={numberOfLines} accessibilityLabel={`${m[1]}${m[2]} Jamaican dollars`}>
      {m[1]}<Text style={{ fontSize: Math.round(size * 0.68) }}>J$</Text>{m[2]}
    </Text>
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
});
