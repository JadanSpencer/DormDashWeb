// components/Coin.tsx
// A DormDash token as a gold coin (original SVG): a dark rim, a gold face
// with a soft highlight, a stamped inner ring, and the DormDash D struck in
// the centre. CoinStack fans a few coins together to show an amount.
// Decorative: the amount is always also written in text beside it.

import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { T } from '../constants/theme';

// The D from components/Logo, centred in the coin's 40×40 space.
const D_PATH =
  'M14.5 12.5 L22 12.5 A7.5 7.5 0 0 1 22 27.5 L14.5 27.5 Z ' +
  'M17.2 15.2 L17.2 24.8 L22 24.8 A4.8 4.8 0 0 0 22 15.2 Z';

export function Coin({ size = 24 }: { size?: number }) {
  const c = T.color;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden importantForAccessibility="no">
      <Circle cx={20} cy={20} r={19.5} fill={c.goldDeep} />
      <Circle cx={20} cy={20} r={17} fill={c.gold} />
      {/* soft highlight across the upper-left of the face */}
      <Path d="M8.5 16 A12.5 12.5 0 0 1 24 7.6" stroke={c.goldLight} strokeWidth={2.4}
        strokeLinecap="round" fill="none" opacity={0.9} />
      <Circle cx={20} cy={20} r={13} fill="none" stroke={c.goldDeep} strokeOpacity={0.45} strokeWidth={1.2} />
      <Path d={D_PATH} fill={c.goldDeep} fillRule="evenodd" transform="translate(1.2 0)" />
    </Svg>
  );
}

/** `count` coins fanned left to right, each overlapping the one before. */
export function CoinStack({ count, size = 24 }: { count: number; size?: number }) {
  const step = size * 0.68;
  return (
    <View style={{ width: size + step * (count - 1), height: size }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ position: 'absolute', left: i * step }}>
          <Coin size={size} />
        </View>
      ))}
    </View>
  );
}
