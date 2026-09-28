// components/Backdrop.tsx
// The Japanese print backdrop behind every screen: seigaiha (青海波), the
// traditional overlapping-wave pattern, drawn as original vector line work,
// in bands at the top and bottom of the screen that fade out behind the
// content, so text and forms never sit on pattern.
//
// Use it as the FIRST child of a screen's root view; it fills the view,
// stays fixed while content scrolls, and ignores touches:
//   <View style={styles.root}>
//     <Backdrop tone="cream" />
//
// Rules (PWA_HANDOFF.md "Japanese print style"): pattern only, low opacity.
// Dasher and admin: bands at the top and bottom, the middle clear.
// Students ("cream", Tide Print): the pattern runs the whole height and
// changes on the way down: cerulean waves at the top (where the sea header
// fades into it), quieter through the middle where content sits, turning
// teal towards the bottom.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Mask, Pattern, Rect, Stop } from 'react-native-svg';
import { T } from '../constants/theme';
import { D } from '../constants/themeDark';
import { S } from '../constants/themeMid';

export type BackdropTone = 'cream' | 'dark' | 'mid';

// Per palette: the canvas colour (seigaiha fans are filled with it so each
// row hides the one behind, like the printed pattern) and the ink colour.
const TONES: Record<BackdropTone, { canvas: string; ink: string; pattern: number }> = {
  cream: { canvas: T.color.cream, ink: T.color.cerulean, pattern: 0.13 }, // indigo on washi
  dark:  { canvas: D.color.bg,    ink: D.color.cerulean, pattern: 0.12 }, // dasher
  mid:   { canvas: S.color.bg,    ink: S.color.cream,    pattern: 0.08 }, // admin
};

// Drawing space; scaled to cover any screen (preserveAspectRatio slice).
const W = 400;
const H = 900;

// ─── Seigaiha tile ─────────────────────────────────────────────────────────
// Fans of radius R on a grid: rows every R/2, alternate rows shifted by R.
// Every fan that overlaps the tile is drawn, top row first, so lower fans
// cover the ones above and the tile repeats seamlessly.
const R = 18;
const RINGS = [R, R * 0.75, R * 0.5, R * 0.25];
const FANS: [number, number][] = [
  [R, -R / 2], [-R, -R / 2], [3 * R, -R / 2],
  [0, 0], [2 * R, 0],
  [R, R / 2], [-R, R / 2], [3 * R, R / 2],
  [0, R], [2 * R, R],
  [R, 1.5 * R],
];

function SeigaihaTile({ canvas, ink, opacity }: { canvas: string; ink: string; opacity: number }) {
  return (
    <>
      {FANS.map(([cx, cy], i) => (
        <G key={i}>
          <Circle cx={cx} cy={cy} r={R} fill={canvas} />
          {RINGS.map(r => (
            <Circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={ink} strokeOpacity={opacity} strokeWidth={1} />
          ))}
        </G>
      ))}
    </>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────
export const Backdrop = React.memo(function Backdrop({
  tone = 'cream',
}: { tone?: BackdropTone }) {
  const { canvas, ink, pattern } = TONES[tone];
  // Ids are per tone so screens of different palettes that are mounted at
  // the same time (web keeps the previous screen in the page) can't pick up
  // each other's pattern.
  const pid = `seigaiha-${tone}`;
  const mid = `seigaiha-fade-${tone}`;
  const gid = `seigaiha-grad-${tone}`;

  if (tone === 'cream') return <TideBackdrop />;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <Pattern id={pid} patternUnits="userSpaceOnUse" width={2 * R} height={R}>
            <SeigaihaTile canvas={canvas} ink={ink} opacity={pattern} />
          </Pattern>
          {/* Visible at the top and bottom edges, clear in the middle. */}
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity="1" />
            <Stop offset="0.16" stopColor="#fff" stopOpacity="0" />
            <Stop offset="0.8" stopColor="#fff" stopOpacity="0" />
            <Stop offset="1" stopColor="#fff" stopOpacity="1" />
          </LinearGradient>
          <Mask id={mid} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
            <Rect x="0" y="0" width={W} height={H} fill={`url(#${gid})`} />
          </Mask>
        </Defs>

        <Rect x="0" y="0" width={W} height={H} fill={`url(#${pid})`} mask={`url(#${mid})`} />

      </Svg>
    </View>
  );
});

// ─── Students: the whole page, cerulean fading to teal ─────────────────────
// Drawn in real pixels (no viewBox scaling) from the top-left of the screen,
// with the same wave size as the sea header (components/Tide), so where the
// header fades out the two patterns line up exactly.
const TideBackdrop = React.memo(function TideBackdrop() {
  const canvas = T.color.cream;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="tide-cer" patternUnits="userSpaceOnUse" width={2 * R} height={R}>
            <SeigaihaTile canvas={canvas} ink={T.color.cerulean} opacity={0.16} />
          </Pattern>
          <Pattern id="tide-teal" patternUnits="userSpaceOnUse" width={2 * R} height={R}>
            <SeigaihaTile canvas={canvas} ink={T.color.teal} opacity={0.15} />
          </Pattern>
          {/* Cerulean: strong at the top, a whisper by the bottom. */}
          <LinearGradient id="tide-cer-g" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity="1" />
            <Stop offset="0.3" stopColor="#fff" stopOpacity="0.6" />
            <Stop offset="0.65" stopColor="#fff" stopOpacity="0.35" />
            <Stop offset="1" stopColor="#fff" stopOpacity="0.05" />
          </LinearGradient>
          {/* Teal: rises through the lower half. */}
          <LinearGradient id="tide-teal-g" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity="0" />
            <Stop offset="0.45" stopColor="#fff" stopOpacity="0.12" />
            <Stop offset="0.8" stopColor="#fff" stopOpacity="0.65" />
            <Stop offset="1" stopColor="#fff" stopOpacity="1" />
          </LinearGradient>
          <Mask id="tide-cer-m">
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#tide-cer-g)" />
          </Mask>
          <Mask id="tide-teal-m">
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#tide-teal-g)" />
          </Mask>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#tide-cer)" mask="url(#tide-cer-m)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#tide-teal)" mask="url(#tide-teal-m)" />
      </Svg>
    </View>
  );
});
