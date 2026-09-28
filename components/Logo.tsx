// components/Logo.tsx
// DormDash — the D with three speed stripes, rendered as SVG so it scales
// crisp to any size and can be tinted by context.
//
// Two variants:
//   • 'brand' (default) — indigo D with three indigo speed stripes.
//     Use anywhere on cream. This is the in-app mark.
//   • 'inverse' — the same in warm white, for dark tiles.
//
// Usage:
//   <Logo size={64} />
//   <Logo size={40} variant="inverse" />

import React from 'react';
import Svg, { Path, G } from 'react-native-svg';
import { T } from '../constants/theme';

type Variant = 'brand' | 'inverse';

type Props = {
  size?: number;
  variant?: Variant;
};

export const Logo: React.FC<Props> = ({ size = 64, variant = 'brand' }) => {
  const color = variant === 'inverse' ? T.color.card : T.color.cerulean;

  return (
    <Svg width={size} height={size * (100 / 112)} viewBox="0 0 112 100" fill="none">
      {/* Three speed stripes to the left of the D: short, long, short.
          Solid colour (a gradient here didn't render on the web). */}
      <G stroke={color} strokeWidth={6} strokeLinecap="round">
        <Path d="M14 38 L32 38" opacity={0.7} />
        <Path d="M6 50 L32 50" />
        <Path d="M14 62 L32 62" opacity={0.7} />
      </G>

      {/* The D: rounded right curve, drawn as one path with its counter cut out. */}
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
        fill={color}
        fillRule="evenodd"
      />
    </Svg>
  );
};

export default Logo;
