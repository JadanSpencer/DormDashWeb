// components/Flow.tsx
// The flyer's background line work: wide contour loops sweeping in from the
// corners (like the rings on the UWI Mona launch flyer), and the big faint
// italic D behind the header. Line work only, low contrast, never behind
// text at full strength. Computed once; the same on every device.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { FONT } from '../constants/theme';

const W = 400;
const H = 900;

// Closed, gently wobbling loops around a centre (off-screen corners), so
// only their long sweeping arcs cross the screen.
function loop(cx: number, cy: number, r: number, k: number): string {
  const N = 40;
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = r * (1 + 0.07 * Math.sin(3 * a + k) + 0.04 * Math.sin(5 * a - k * 0.7));
    pts.push([cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr]);
  }
  // Closed Catmull-Rom as cubic Béziers.
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)}`
       + ` ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)}`
       + ` ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}

const LOOPS: string[] = [
  // bottom-left family
  ...[110, 180, 250, 320, 390].map((r, i) => loop(-30, 860, r, i * 0.9)),
  // top-right family
  ...[90, 160, 230, 300].map((r, i) => loop(450, 60, r, 2 + i * 0.8)),
];

/** Contour loops filling their parent. */
export const FlowLines = React.memo(function FlowLines({ color, opacity, width = 2 }: {
  color: string; opacity: number; width?: number;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        {LOOPS.map((d, i) => (
          <Path key={i} d={d} fill="none" stroke={color} strokeOpacity={opacity}
            strokeWidth={width} vectorEffect="non-scaling-stroke" />
        ))}
      </Svg>
    </View>
  );
});

/** The flyer's huge faint italic D, cropped at the right edge of its parent. */
export function BigD({ color, opacity, size = 420, top = -60, right = -90 }: {
  color: string; opacity: number; size?: number; top?: number; right?: number;
}) {
  return (
    <Text
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
      allowFontScaling={false}
      style={[styles.d, { color, opacity, fontSize: size, lineHeight: size * 1.1, top, right }]}
    >
      D
    </Text>
  );
}

const styles = StyleSheet.create({
  d: { position: 'absolute', fontFamily: FONT.heading },
});
