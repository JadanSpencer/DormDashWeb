// components/Swoosh.tsx
// The hand-drawn underline under the flyer's "move." (mustard, tapering at
// both ends). Decorative.
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { T } from '../constants/theme';

export function Swoosh({ width = 180, color = T.color.mustard }: { width?: number; color?: string }) {
  return (
    <Svg width={width} height={14} viewBox="0 0 200 14" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M3 10 C 50 3, 120 1, 197 6 C 150 5, 70 7, 4 12 Z" fill={color} />
    </Svg>
  );
}
