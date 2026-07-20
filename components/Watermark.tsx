// components/Watermark.tsx
// Subtle "created by Jcommerce" mark for every screen.
// Two variants: 'floating' (absolute-positioned, bottom, safe-area aware)
// and 'inline' (renders in flow — for scroll views where absolute would
// float over content). Both use the cream palette and stay quiet.

import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../constants/theme';

type Props = {
  variant?: 'floating' | 'inline';
  style?: StyleProp<ViewStyle>;
  tint?: 'ink' | 'teal' | 'cerulean';
};

export const Watermark: React.FC<Props> = ({ variant = 'inline', style, tint = 'ink' }) => {
  const insets = useSafeAreaInsets();

  const dotColor =
    tint === 'teal' ? T.color.teal :
    tint === 'cerulean' ? T.color.cerulean :
    T.color.inkFaint;

  const content = (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={styles.text}>
        created by <Text style={styles.brand}>Jcommerce</Text>
      </Text>
    </View>
  );

  if (variant === 'floating') {
    return (
      <View
        pointerEvents="none"
        style={[
          styles.floating,
          { paddingBottom: Math.max(insets.bottom, 8) + 6 },
          style,
        ]}
      >
        {content}
      </View>
    );
  }

  return <View style={[styles.inline, style]}>{content}</View>;
};

const styles = StyleSheet.create({
  floating: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  inline: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.55,
  },
  text: {
    fontSize: 10,
    fontWeight: '600',
    color: T.color.inkFaint,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  brand: {
    color: T.color.teal,
    fontWeight: '800',
  },
});

export default Watermark;
