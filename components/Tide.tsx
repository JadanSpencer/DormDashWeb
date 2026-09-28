// components/Tide.tsx
// "Tide Print" building blocks for student screens (constants/theme.ts):
//
//   <TideBand>   the deep cerulean sea at the top of a screen, with seigaiha
//                waves etched into it, fading into the page (whose own wave
//                pattern, components/Backdrop, carries on down the screen).
//                Put the screen's heading inside.
//   <StoreMark>  a store's own tile: a sea colour picked from its id, the
//                wave pattern, and its initial in the heading face. `muted`
//                is "low tide" for a closed store.
//   pressPlate() makes a Pressable sink onto its print plate when pressed.
//
// Pattern ids are per instance (useId), so several bands or marks on one
// page never share a pattern.

import React, { useId, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, LinearGradient, Mask, Pattern, Rect, Stop } from 'react-native-svg';
import { T, FONT } from '../constants/theme';

// ─── Seigaiha pattern (same geometry as components/Backdrop) ──────────────
function Waves({ r, canvas, ink, opacity }: { r: number; canvas: string; ink: string; opacity: number }) {
  const fans: [number, number][] = [
    [r, -r / 2], [-r, -r / 2], [3 * r, -r / 2],
    [0, 0], [2 * r, 0],
    [r, r / 2], [-r, r / 2], [3 * r, r / 2],
    [0, r], [2 * r, r],
    [r, 1.5 * r],
  ];
  const rings = [r, r * 0.75, r * 0.5, r * 0.25];
  return (
    <>
      {fans.map(([cx, cy], i) => (
        <G key={i}>
          <Circle cx={cx} cy={cy} r={r} fill={canvas} />
          {rings.map(k => (
            <Circle key={k} cx={cx} cy={cy} r={k} fill="none" stroke={ink} strokeOpacity={opacity} strokeWidth={1} />
          ))}
        </G>
      ))}
    </>
  );
}

function WaveFill({ r, canvas, ink, opacity }: { r: number; canvas: string; ink: string; opacity: number }) {
  const id = `tide-waves-${useId().replace(/:/g, '')}`;
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={2 * r} height={r}>
          <Waves r={r} canvas={canvas} ink={ink} opacity={opacity} />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

// ─── The sea band ─────────────────────────────────────────────────────────
// The last FADE px of the band dissolve into the page, so the sea and the
// page's pattern run into each other with no edge. The band's waves are
// the same size and start from the same point as the page's (Backdrop), so
// in the fade the two line up and it reads as one set of waves changing
// colour, not two patterns crossing. The fade follows an ease curve (no
// visible start or end line). Content stays in the top of the fade, where
// the sea is still ~90% solid, so cream text keeps its contrast.
const FADE = 110;
// Smoothstep samples: opacity at points through the fade.
const FADE_STOPS: [number, number][] = [[0, 1], [0.2, 0.9], [0.4, 0.66], [0.6, 0.34], [0.8, 0.1], [1, 0]];

/**
 * The sea band that opens a student screen. Content goes inside (cream
 * text: T.color.card; secondary: T.color.seaSoft).
 */
export function TideBand({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const [h, setH] = useState(0);
  const uid = useId().replace(/:/g, '');
  const stop = h > FADE ? (h - FADE) / h : 0.7;
  const at = (i: number) => String(stop + (1 - stop) * FADE_STOPS[i][0]);
  const op = (i: number) => String(FADE_STOPS[i][1]);
  return (
    <View
      style={[styles.band, h === 0 && styles.bandUnmeasured, style]}
      onLayout={e => {
        const next = Math.round(e.nativeEvent.layout.height);
        if (next !== h) setH(next);
      }}
    >
      {h > 0 && (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height={h}>
          <Defs>
            <Pattern id={`sea-${uid}`} patternUnits="userSpaceOnUse" width={2 * BAND_R} height={BAND_R}>
              <Waves r={BAND_R} canvas={T.color.sea} ink={T.color.ceruleanBright} opacity={0.28} />
            </Pattern>
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
        </Svg>
      )}
      {children}
    </View>
  );
}

// Same wave size as the page pattern (components/Backdrop), so the two
// read as one sea where they meet.
const BAND_R = 18;

/**
 * A standard student screen header on the sea band: optional back button,
 * a small line above the title, the title in the heading face, and any
 * extra content (e.g. a status or a toggle) below it.
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
// Each store keeps the same sea colour everywhere (picked from its id).
const MARK_SEAS: { bg: string; ink: string }[] = [
  { bg: T.color.sea,          ink: T.color.ceruleanBright },
  { bg: T.color.teal,         ink: T.color.seaFoam },
  { bg: T.color.cerulean,     ink: T.color.seaSoft },
  { bg: T.color.tealDeep,     ink: T.color.tealBright },
  { bg: T.color.ceruleanDeep, ink: T.color.ceruleanBright },
];

// "Low tide": a closed store's mark, drained of colour.
const LOW_TIDE = { bg: '#7D9298', ink: '#C3D0D3' };

export function markSea(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MARK_SEAS[h % MARK_SEAS.length];
}

export function StoreMark({
  id, name, size = 52, radius = T.radius.md, muted = false, style,
}: { id: string; name: string; size?: number; radius?: number; muted?: boolean; style?: StyleProp<ViewStyle> }) {
  const sea = muted ? LOW_TIDE : markSea(id);
  return (
    <View
      style={[{ width: size, height: size, borderRadius: radius, backgroundColor: sea.bg }, styles.mark, style]}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    >
      <WaveFill r={Math.max(8, size / 5)} canvas={sea.bg} ink={sea.ink} opacity={0.35} />
      <Text style={[styles.markInitial, { fontSize: size * 0.5, lineHeight: size * 0.62 }]}>
        {name.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * The same store art filling its parent (e.g. a featured card's head):
 * waves across the whole area and a large initial cropped at the corner.
 */
export function StoreArt({ id, name, initialSize = 120, muted = false }: { id: string; name: string; initialSize?: number; muted?: boolean }) {
  const sea = muted ? LOW_TIDE : markSea(id);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: sea.bg, overflow: 'hidden' }]}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    >
      <WaveFill r={22} canvas={sea.bg} ink={sea.ink} opacity={0.32} />
      <Text style={[styles.artInitial, { fontSize: initialSize, lineHeight: initialSize * 1.15, bottom: -initialSize * 0.3 }]}>
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
  markInitial: { fontFamily: FONT.heading, color: T.color.card, textAlign: 'center' },
  head: { paddingHorizontal: T.space.lg },
  headTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: T.space.md },
  headBack: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: T.color.card,
    alignItems: 'center', justifyContent: 'center', ...T.plate.sea, shadowOffset: { width: 0, height: 3 },
  },
  headBackText: { fontSize: 20, fontWeight: '700', color: T.color.sea },
  headKicker: { ...T.type.body, fontSize: 14, fontWeight: '700', color: T.color.seaFoam, marginBottom: 2 },
  headTitle: { ...T.type.display, fontSize: 34, lineHeight: 42, color: T.color.card },
  artInitial: { position: 'absolute', left: 14, fontFamily: FONT.heading, color: T.color.card },
});
