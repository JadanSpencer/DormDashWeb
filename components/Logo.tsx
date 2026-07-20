// components/Logo.tsx
// DormDash — the D-with-speed-lines mark, rendered as SVG so it scales
// crisp to any size and can be tinted by context.
//
// Two variants:
//   • 'brand' (default) — cerulean D + teal-to-cerulean speed lines.
//     Use anywhere on cream. This is the in-app mark.
//   • 'inverse' — white D + white speed lines with graduated opacity.
//     Use inside a dark tile (splash tile, notification chip, dark card).
//
// Usage:
//   <Logo size={64} />
//   <Logo size={40} variant="inverse" />

import React from 'react';
import Svg, { Path, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { T } from '../constants/theme';

type Variant = 'brand' | 'inverse';

type Props = {
  size?: number;
  variant?: Variant;
};

export const Logo: React.FC<Props> = ({ size = 64, variant = 'brand' }) => {
  const dColor = variant === 'inverse' ? '#FFFFFF' : T.color.cerulean;
  const line1 = variant === 'inverse' ? '#FFFFFF' : T.color.teal;
  const line2 = variant === 'inverse' ? '#FFFFFF' : T.color.cerulean;

  return (
    <Svg width={size} height={size * (100 / 112)} viewBox="0 0 112 100" fill="none">
      <Defs>
        <LinearGradient id="speedGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={line1} stopOpacity="0.55" />
          <Stop offset="1" stopColor={line2} stopOpacity="1" />
        </LinearGradient>
      </Defs>

      {/* Speed lines — four horizontal bars, tapering from short/faint on
          the left to longer/opaque as they meet the D. */}
      <G>
        <Path d="M8 42 L28 42" stroke="url(#speedGrad)" strokeWidth="4.5" strokeLinecap="round" opacity="0.7" />
        <Path d="M4 52 L30 52" stroke="url(#speedGrad)" strokeWidth="4.5" strokeLinecap="round" opacity="0.85" />
        <Path d="M10 62 L32 62" stroke="url(#speedGrad)" strokeWidth="4.5" strokeLinecap="round" />
        <Path d="M16 72 L30 72" stroke="url(#speedGrad)" strokeWidth="4.5" strokeLinecap="round" opacity="0.75" />
      </G>

      {/* The D — angled top-left cut, rounded right curve.
          Drawn as a single path so the notch is native to the shape. */}
      <Path
        d="M42 22
           L82 22
           A28 28 0 0 1 82 78
           L42 78
           Z
           M52 32
           L52 68
           L78 68
           A18 18 0 0 0 78 32
           Z"
        fill={dColor}
        fillRule="evenodd"
      />
    </Svg>
  );
};

export default Logo;
