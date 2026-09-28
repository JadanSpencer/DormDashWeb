// components/Tide.tsx
// Building blocks for student screens in the launch-flyer style
// (constants/theme.ts):
//
//   <TideBand>   the header: deep blue sweeping to teal, the flyer's contour
//                loops and big faint D, fading into the page at the bottom
//                (the page's own loops, components/Backdrop, carry on down).
//                Put the screen's heading inside.
//   <TideHeader> a standard header on the band: back button, small line,
//                big italic title.
//   <StoreMark>  a store's own tile: a brand colour picked from its id and
//                its initial in the italic headline face. `muted` is "low
//                tide" for a closed store. <StoreArt> fills a whole area.
//   pressPlate() makes a Pressable sink onto its print plate when pressed.
//
// Gradient ids are per instance (useId), so several bands on one page never
// share one.

import React, { useId, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, G, LinearGradient, Mask, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { T, FONT } from '../constants/theme';
import { FlowLines, FLOW_LOOPS, FLOW_W, FLOW_H } from './Flow';

// ─── The header band ───────────────────────────────────────────────────────
// The last FADE px dissolve into the page on an ease curve, so there's no
// edge line. Content stays in the top of the fade, where the band is still
// ~90% solid, so cream text keeps its contrast.
//
// The contour loops and the big faint italic D are drawn in the same SVG,
// under the same fade, so they melt into the page with the band instead of
// stopping at a hard edge. The D is sized to fit the band (never cropped at
// the top or the right) and its foot dissolves in the fade.
const FADE = 110;
const FADE_STOPS: [number, number][] = [[0, 1], [0.2, 0.9], [0.4, 0.66], [0.6, 0.34], [0.8, 0.1], [1, 0]];

// Fraunces Black Italic: cap height and the italic's lean past its advance,
// as fractions of the font size (for placing the D inside the band).
const D_CAP = 0.72;
const D_LEAN = 0.16;
const D_TOP = 14; // px from the top of the band to the top of the D

export function TideBand({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const [h, setH] = useState(0);
  const [w, setW] = useState(0);
  const uid = useId().replace(/:/g, '');
  const stop = h > FADE ? (h - FADE) / h : 0.7;
  const at = (i: number) => String(stop + (1 - stop) * FADE_STOPS[i][0]);
  const op = (i: number) => String(FADE_STOPS[i][1]);
  // Loops: scaled to cover the band, centred (like preserveAspectRatio slice).
  const loopScale = Math.max(w / FLOW_W, h / FLOW_H) || 1;
  const loopX = (w - FLOW_W * loopScale) / 2;
  const loopY = (h - FLOW_H * loopScale) / 2;
  // The D: as big as fits, its cap inside the band's height and width.
  const dSize = Math.max(0, Math.round(Math.min(380, w * 0.8, (h - D_TOP) / D_CAP)));
  return (
    <View
      style={[styles.band, h === 0 && styles.bandUnmeasured, style]}
      onLayout={e => {
        const next = Math.round(e.nativeEvent.layout.height);
        const nextW = Math.round(e.nativeEvent.layout.width);
        if (next !== h) setH(next);
        if (nextW !== w) setW(nextW);
      }}
    >
      {h > 0 && w > 0 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height={h}>
            <Defs>
              {/* Blue at the top left sweeping to teal, like the flyer. */}
              <LinearGradient id={`sea-${uid}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={T.color.sea} />
                <Stop offset="0.55" stopColor={T.color.sea} />
                <Stop offset="1" stopColor={T.color.seaTeal} />
              </LinearGradient>
              <LinearGradient id={`fade-${uid}`} x1="0" y1="0" x2="0" y2={h} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#fff" stopOpacity="1" />
                <Stop offset={at(0)} stopColor="#fff" stopOpacity={op(0)} />
                <Stop offset={at(1)} stopColor="#fff" stopOpacity={op(1)} />
                <Stop offset={at(2)} stopColor="#fff" stopOpacity={op(2)} />
                <Stop offset={at(3)} stopColor="#fff" stopOpacity={op(3)} />
                <Stop offset={at(4)} stopColor="#fff" stopOpacity={op(4)} />
                <Stop offset={at(5)} stopColor="#fff" stopOpacity={op(5)} />
              </LinearGradient>
              <Mask id={`mask-${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height={h}>
                <Rect x="0" y="0" width="100%" height={h} fill={`url(#fade-${uid})`} />
              </Mask>
            </Defs>
            <Rect x="0" y="0" width="100%" height={h} fill={`url(#sea-${uid})`} mask={`url(#mask-${uid})`} />
            <G mask={`url(#mask-${uid})`}>
              {/* The loops cover the band like the page's (slice), faint. */}
              <G transform={`translate(${loopX} ${loopY}) scale(${loopScale})`}>
                {FLOW_LOOPS.map((d, i) => (
                  <Path key={i} d={d} fill="none" stroke={T.color.card} strokeOpacity={0.09}
                    strokeWidth={2 / loopScale} />
                ))}
              </G>
              <SvgText
                x={w - dSize * D_LEAN}
                y={D_TOP + dSize * D_CAP}
                textAnchor="end"
                fontFamily={FONT.heading}
                fontSize={dSize}
                fill={T.color.card}
                fillOpacity={0.07}
              >
                D
              </SvgText>
            </G>
          </Svg>
        </View>
      )}
      {children}
    </View>
  );
}

/**
 * A standard student screen header on the band: optional back button,
 * a small line above the title, the title in the italic headline face, and
 * any extra content (e.g. a status or a toggle) below it.
 */
export function TideHeader({
  title, kicker, onBack, right, children,
}: {
  title: string;
  kicker?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <TideBand>
      <View style={[styles.head, { paddingTop: insets.top + T.space.md }]}>
        {(onBack || right) ? (
          <View style={styles.headTop}>
            {onBack ? (
              <Pressable
                onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back"
                style={({ pressed }) => [styles.headBack, pressPlate(pressed, 3)]}
              >
                <Text style={styles.headBackText}>←</Text>
              </Pressable>
            ) : <View />}
            {right}
          </View>
        ) : null}
        {kicker ? <Text style={styles.headKicker}>{kicker}</Text> : null}
        <Text style={styles.headTitle} accessibilityRole="header">{title}</Text>
        {children}
      </View>
    </TideBand>
  );
}

// ─── Store mark ────────────────────────────────────────────────────────────
// Each store keeps the same colour everywhere (picked from its id).
const MARK_COLOURS: { bg: string; fg: string }[] = [
  { bg: T.color.sea,          fg: T.color.card },
  { bg: T.color.teal,         fg: T.color.card },
  { bg: T.color.mustard,      fg: T.color.ink },
  { bg: T.color.cerulean,     fg: T.color.card },
  { bg: T.color.tealDeep,     fg: T.color.card },
];

// "Low tide": a closed store's mark, drained of colour.
const LOW_TIDE = { bg: '#7D9298', fg: T.color.card };

export function markSea(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MARK_COLOURS[h % MARK_COLOURS.length];
}

export function StoreMark({
  id, name, size = 52, radius = T.radius.md, muted = false, style,
}: { id: string; name: string; size?: number; radius?: number; muted?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = muted ? LOW_TIDE : markSea(id);
  return (
    <View
      style={[{ width: size, height: size, borderRadius: radius, backgroundColor: c.bg }, styles.mark, style]}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    >
      <FlowLines color={c.fg} opacity={0.14} width={1.5} />
      <Text style={[styles.markInitial, { color: c.fg, fontSize: size * 0.56, lineHeight: size * 0.72 }]}>
        {name.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

/** The same art filling its parent (e.g. a featured card's head). */
export function StoreArt({ id, name, initialSize = 130, muted = false }: { id: string; name: string; initialSize?: number; muted?: boolean }) {
  const c = muted ? LOW_TIDE : markSea(id);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, overflow: 'hidden' }]}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    >
      <FlowLines color={c.fg} opacity={0.12} />
      <Text style={[styles.artInitial, { color: c.fg, fontSize: initialSize, lineHeight: initialSize * 1.15, bottom: -initialSize * 0.32 }]}>
        {name.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

// ─── Pressing onto the plate ───────────────────────────────────────────────
/** Style for a pressed plate surface: it sinks by the plate's depth. */
export function pressPlate(pressed: boolean, depth = 4): ViewStyle | null {
  // Keeps the surface's own plate colour; only the offset shrinks.
  return pressed ? { transform: [{ translateY: depth - 1 }], shadowOffset: { width: 0, height: 1 } } : null;
}

const styles = StyleSheet.create({
  band: { overflow: 'hidden', paddingBottom: FADE - 36 },
  bandUnmeasured: { backgroundColor: T.color.sea },
  mark: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  markInitial: { fontFamily: FONT.heading, textAlign: 'center' },
  head: { paddingHorizontal: T.space.lg },
  headTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: T.space.md },
  headBack: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: T.color.card,
    alignItems: 'center', justifyContent: 'center', ...T.plate.sea, shadowOffset: { width: 0, height: 3 },
  },
  headBackText: { fontSize: 20, fontWeight: '700', color: T.color.sea },
  headKicker: { ...T.type.body, fontSize: 14, fontWeight: '700', color: T.color.seaSoft, marginBottom: 2 },
  headTitle: { ...T.type.display, fontSize: 38, lineHeight: 46, color: T.color.card },
  artInitial: { position: 'absolute', left: 16, fontFamily: FONT.heading },
});
