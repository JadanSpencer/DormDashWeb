// components/Coin.tsx
// A Runner token as a struck gold coin (original SVG):
//   • a milled (reeded) edge, like real money
//   • a domed face: light from the top left, deeper gold at the bottom right
//   • a bevelled inner ring
//   • the Runner mark, the three speed stripes beside the R, struck
//     into the face with a light lower edge
// Small coins (under 22px) drop the milling and the ring so they stay crisp.
// CoinStack fans a few coins together to show an amount.
// Decorative: the amount is always also written in text beside it.

import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { T } from '../constants/theme';

// ─── Geometry (40 × 40) ────────────────────────────────────────────────────
// Milled edge: 60 short ridges between the rim and the face, one path.
const MILLING = (() => {
  let d = '';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const x1 = 20 + Math.cos(a) * 17.4, y1 = 20 + Math.sin(a) * 17.4;
    const x2 = 20 + Math.cos(a) * 19.1, y2 = 20 + Math.sin(a) * 19.1;
    d += `M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  return d;
})();

// The Runner mark (drawn in a 112 × 100 box, centre 58,50), scaled to sit
// in the middle of the face.
const MARK_SCALE = 0.235;
const MARK_T = `translate(${(20 - 58 * MARK_SCALE).toFixed(2)} ${(20 - 50 * MARK_SCALE).toFixed(2)}) scale(${MARK_SCALE})`;
// R: stem, round bowl (counter cut out) and a kicked leg.
const R_PATH = 'M42 22 L70 22 A17 17 0 0 1 70 56 L86 78 L72 78 L59 56 L54 56 L54 78 L42 78 Z M54 32 L54 46 L69 46 A7 7 0 0 0 69 32 Z';
const STRIPES = ['M14 38 L32 38', 'M6 50 L32 50', 'M14 62 L32 62'];

function Mark({ color, dx = 0, dy = 0, small }: { color: string; dx?: number; dy?: number; small: boolean }) {
  return (
    <G transform={`translate(${dx} ${dy}) ${MARK_T}`}>
      <G stroke={color} strokeWidth={small ? 9 : 7} strokeLinecap="round">
        {STRIPES.map(d => <Path key={d} d={d} />)}
      </G>
      <Path d={R_PATH} fill={color} fillRule="evenodd" />
    </G>
  );
}

export function Coin({ size = 24 }: { size?: number }) {
  const c = T.color;
  const small = size < 22;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <RadialGradient id="dd-coin-face" cx="36%" cy="30%" r="75%">
          <Stop offset="0" stopColor={c.goldLight} />
          <Stop offset="0.5" stopColor={c.gold} />
          <Stop offset="1" stopColor={c.goldShade} />
        </RadialGradient>
      </Defs>

      {/* Rim and milled edge */}
      <Circle cx={20} cy={20} r={19.6} fill={c.goldDeep} />
      {!small && <Path d={MILLING} stroke={c.goldShade} strokeWidth={0.9} />}

      {/* Domed face */}
      <Circle cx={20} cy={20} r={small ? 18 : 17.2} fill="url(#dd-coin-face)" />

      {/* Bevelled inner ring: dark above, light below */}
      {!small && (
        <>
          <Circle cx={20} cy={20} r={14.4} fill="none" stroke={c.goldDeep} strokeOpacity={0.35} strokeWidth={1} />
          <Path d="M7.2 23.6 A13.4 13.4 0 0 0 32.8 23.6" stroke={c.goldLight} strokeOpacity={0.9} strokeWidth={0.9} fill="none" />
        </>
      )}

      {/* Struck mark: a light lower edge, then the mark itself */}
      <Mark color={c.goldLight} dx={0.35} dy={0.5} small={small} />
      <Mark color={c.goldDeep} small={small} />

      {/* Sheen on the upper left of the rim */}
      <Path d="M7.4 14.2 A13.6 13.6 0 0 1 17 6.7" stroke={c.goldTint} strokeOpacity={0.8}
        strokeWidth={small ? 1.8 : 1.4} strokeLinecap="round" fill="none" />
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
