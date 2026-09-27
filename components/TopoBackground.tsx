// components/TopoBackground.tsx
// A quiet topographic-line pattern behind a screen: thin contour lines that
// bunch and spread like a campus map. Line work only, no filled shapes
// (see PWA_HANDOFF.md: no orbs/blobs), at very low contrast so it never
// competes with text.
//
// Use it as the FIRST child of a screen's root view; it fills the view,
// stays fixed while content scrolls, and ignores touches:
//   <View style={styles.root}>
//     <TopoBackground tone="cream" />
//     ...
//
// The pattern is deterministic (same on every device) and computed once.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { T } from '../constants/theme';
import { D } from '../constants/themeDark';
import { S } from '../constants/themeMid';

export type TopoTone = 'cream' | 'dark' | 'mid';

// Stroke colour and strength per role palette. Tuned by eye on real
// screens: visible as texture, never as lines you read.
const TONES: Record<TopoTone, { stroke: string; opacity: number }> = {
  cream: { stroke: T.color.teal, opacity: 0.09 },   // student, sign-in, legal
  dark:  { stroke: D.color.teal, opacity: 0.11 },   // dasher
  mid:   { stroke: S.color.cream, opacity: 0.06 },  // admin
};

// ─── Pattern ───────────────────────────────────────────────────────────────
// Horizontal lines, each pushed up and down by one smooth field. Because
// neighbouring lines sample nearly the same field, they move together:
// bunching where the field falls, spreading where it rises, which is what
// makes contour lines read as terrain. The field's slope in y stays below 1,
// so lines never cross.
const W = 400;
const H = 900;
const LINES = 30;
const SAMPLE = 12;

function field(x: number, y: number): number {
  return 36 * Math.sin(x / 97 + y / 160)
       + 20 * Math.sin(x / 53 - y / 71 + 1.7)
       + 12 * Math.sin((x + y) / 41 + 0.6);
}

// Catmull-Rom through the samples, written as cubic Béziers: smooth curves
// with no visible corners.
function smoothPath(points: [number, number][]): string {
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[Math.max(0, i - 1)];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[Math.min(points.length - 1, i + 2)];
    d += ` C${f(x1 + (x2 - x0) / 6)} ${f(y1 + (y2 - y0) / 6)}`
       + ` ${f(x2 - (x3 - x1) / 6)} ${f(y2 - (y3 - y1) / 6)}`
       + ` ${f(x2)} ${f(y2)}`;
  }
  return d;
}

const PATHS: string[] = Array.from({ length: LINES }, (_, i) => {
  const base = -80 + (i * (H + 160)) / (LINES - 1);
  const points: [number, number][] = [];
  for (let x = -24; x <= W + 24; x += SAMPLE) points.push([x, base + field(x, base)]);
  return smoothPath(points);
});

// ─── Component ─────────────────────────────────────────────────────────────
export const TopoBackground = React.memo(function TopoBackground({ tone = 'cream' }: { tone?: TopoTone }) {
  const { stroke, opacity } = TONES[tone];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        {PATHS.map((d, i) => (
          <Path
            key={i}
            d={d}
            fill="none"
            stroke={stroke}
            strokeOpacity={opacity}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </Svg>
    </View>
  );
});
