// components/Backdrop.tsx
// The Japanese print backdrop behind every screen. Original vector art,
// drawn in the spirit of ukiyo-e prints (no copied images):
//   • seigaiha (青海波), the traditional overlapping-wave pattern, in bands
//     at the top and bottom of the screen that fade out behind the content,
//     so text and forms never sit on pattern;
//   • variant="petals": a few sakura petals drifting at the top edge (Home);
//   • variant="wave": a breaking wave with a small Mount Fuji etched in faint
//     indigo line into the bottom corner (register: its header sits at the
//     top edge, where petals would overlap it);
//   • variant="hero": petals and the wave (sign-in).
//
// Use it as the FIRST child of a screen's root view; it fills the view,
// stays fixed while content scrolls, and ignores touches:
//   <View style={styles.root}>
//     <Backdrop tone="cream" />
//
// Rules (PWA_HANDOFF.md "Japanese print style"): line work and small
// motifs only, no big filled shapes or glows; keep the opacities low; the
// middle of the screen stays clear.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Mask, Path, Pattern, Rect, Stop } from 'react-native-svg';
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

// ─── Hero art (original drawings) ─────────────────────────────────────────
// Drawn in a 400×900 space, then scaled into the bottom-left corner (see
// WAVE_TRANSFORM). A breaking wave in the ukiyo-e manner: the back of the
// wave rises from the left, the crest hooks over to the right, and its
// hollow face falls back to the sea. Claw-like foam hangs from the lip,
// spray rises above it, a low swell runs out to the right, and a small
// Fuji sits beneath, as in the classic composition. Line work in indigo.
const WAVE_BODY =
  'M0 900 C10 820 30 760 80 730 C120 705 175 705 205 725 ' +
  'C225 738 228 760 212 768 C198 775 186 762 195 752 ' +
  'C175 760 150 790 140 830 C132 860 135 885 140 900 Z';
const WAVE_LINES = [
  // echoes of the back of the wave
  'M26 900 C34 835 55 785 96 755 C128 733 168 730 192 744',
  'M56 900 C62 850 80 808 112 782 C136 764 162 760 180 766',
  'M88 900 C92 865 104 836 126 815',
  // the lip curling in
  'M205 740 C214 748 214 758 205 761',
  // a low swell running out to the right, and its crest
  'M140 900 C190 860 245 850 292 868 C318 878 338 890 350 900',
  'M205 872 C230 862 258 862 284 872',
];
// Claw-like foam hanging from the lip, curling down and forward.
const FOAM: [number, number, number][] = [
  [104, 716, 0.9], [124, 708, 1.0], [146, 704, 1.1], [168, 704, 1.1],
  [189, 710, 1.0], [206, 722, 0.9], [216, 740, 0.8],
];
const claw = (x: number, y: number, k: number) =>
  `M${x} ${y} c${4 * k} ${-6 * k} ${12 * k} ${-5 * k} ${14 * k} ${1 * k} ` +
  `c${1.5 * k} ${5 * k} ${-3 * k} ${8 * k} ${-6.5 * k} ${5.5 * k}`;
const SPRAY: [number, number, number][] = [
  [130, 690, 1.6], [150, 682, 1.2], [172, 680, 1.8], [194, 686, 1.2],
  [214, 698, 1.5], [228, 714, 1.1], [160, 664, 1.1], [186, 664, 1.4], [206, 672, 1.0],
];
const FUJI = 'M258 872 L286 842 L314 872';
const FUJI_SNOW = 'M277 852 L281 856 L286 851 L291 856 L295 852';
// Scale the wave down into the corner, below the sign-in links.
const WAVE_TRANSFORM = 'translate(0 495) scale(0.45)';

// Sakura petal: a rounded petal with the notch at its tip that makes it
// read as cherry blossom rather than a dot.
const PETAL =
  'M0 9 C-6 6 -8 -2 -5 -7 C-3 -9.5 -1 -9 0 -6.5 C1 -9 3 -9.5 5 -7 C8 -2 6 6 0 9 Z';
const PETALS: [number, number, number, number][] = [
  // x, y, rotation°, scale
  [334, 52, 160, 1.5], [374, 104, 125, 1.15], [304, 140, 200, 1.0],
  [360, 196, 150, 1.3], [30, 160, 210, 1.0], [388, 262, 175, 0.9],
];

function Petals() {
  return (
    <G>
      {PETALS.map(([x, y, rot, k], i) => (
        <Path key={i} d={PETAL} fill={T.color.shu} fillOpacity={0.26}
          transform={`translate(${x} ${y}) rotate(${rot}) scale(${k})`} />
      ))}
    </G>
  );
}

function Wave() {
  const ink = T.color.cerulean;
  return (
    <G transform={WAVE_TRANSFORM}>
      <Path d={FUJI} fill="none" stroke={ink} strokeOpacity={0.3} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d={FUJI_SNOW} fill="none" stroke={ink} strokeOpacity={0.3} strokeWidth={1.4} strokeLinejoin="round" />
      <Path d={WAVE_BODY} fill={ink} fillOpacity={0.05} stroke={ink} strokeOpacity={0.32}
        strokeWidth={1.8} strokeLinejoin="round" />
      {WAVE_LINES.map((d, i) => (
        <Path key={i} d={d} fill="none" stroke={ink} strokeOpacity={0.24} strokeWidth={1.5} strokeLinecap="round" />
      ))}
      {FOAM.map(([x, y, k], i) => (
        <Path key={i} d={claw(x, y, k)} fill="none" stroke={ink} strokeOpacity={0.36} strokeWidth={1.7} strokeLinecap="round" />
      ))}
      {SPRAY.map(([x, y, r], i) => (
        <Circle key={i} cx={x} cy={y} r={r} fill={ink} fillOpacity={0.3} />
      ))}
    </G>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────
export const Backdrop = React.memo(function Backdrop({
  tone = 'cream',
  variant = 'plain',
}: { tone?: BackdropTone; variant?: 'plain' | 'hero' | 'petals' | 'wave' }) {
  const { canvas, ink, pattern } = TONES[tone];
  // Ids are per tone so screens of different palettes that are mounted at
  // the same time (web keeps the previous screen in the page) can't pick up
  // each other's pattern.
  const pid = `seigaiha-${tone}`;
  const mid = `seigaiha-fade-${tone}`;
  const gid = `seigaiha-grad-${tone}`;
  // The artwork is drawn for the cream palette (student-facing screens).
  const petals = tone === 'cream' && (variant === 'hero' || variant === 'petals');
  const wave = tone === 'cream' && (variant === 'hero' || variant === 'wave');

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

        {petals && <Petals />}
        {wave && <Wave />}
      </Svg>
    </View>
  );
});
