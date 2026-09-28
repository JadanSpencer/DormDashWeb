// components/Skeleton.tsx
// Loading placeholders in the Tide Print style: blank cards on their print
// plates, in the same shape as what's coming, so the page looks ready at
// once and doesn't jump when the data lands. They breathe gently (one
// opacity loop per group, on the native driver) and stay still for people
// who reduce motion. Screen readers hear a single "Loading…".

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { T, useReducedMotion } from '../constants/theme';

const Pulse = createContext<Animated.AnimatedInterpolation<number> | number>(1);

/** Wrap a set of placeholders; they share one animation. */
export function SkeletonGroup({ children, label = 'Loading…', style }: {
  children: React.ReactNode; label?: string; style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced]);
  const opacity = reduced ? 1 : v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] });
  return (
    <View style={style} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      <Pulse.Provider value={opacity}>{children}</Pulse.Provider>
    </View>
  );
}

/** A placeholder bar or block (text line, price, image). */
export function Bone({ w, h = 12, r = 6, style }: {
  w: number | `${number}%`; h?: number; r?: number; style?: StyleProp<ViewStyle>;
}) {
  const opacity = useContext(Pulse);
  return <Animated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: T.color.creamDeep, opacity }, style]} />;
}

/** An empty card on its plate; put Bones inside. */
export function SkeletonCard({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ─── Ready-made shapes ─────────────────────────────────────────────────────
/** A store row (home): mark, name, description, meta. */
export function StoreRowSkeleton() {
  return (
    <SkeletonCard style={styles.row}>
      <Bone w={56} h={56} r={T.radius.md} />
      <View style={styles.lines}>
        <Bone w="60%" h={16} />
        <Bone w="85%" />
        <Bone w="45%" />
      </View>
    </SkeletonCard>
  );
}

/** A menu item (store page): name, description, price, add button. */
export function MenuItemSkeleton() {
  return (
    <SkeletonCard style={styles.row}>
      <View style={styles.lines}>
        <Bone w="55%" h={16} />
        <Bone w="80%" />
        <Bone w={84} h={22} r={T.radius.sm} style={{ marginTop: 6 }} />
      </View>
      <Bone w={78} h={40} r={T.radius.pill} />
    </SkeletonCard>
  );
}

/** An order card (orders, tracking): title, amount, a block of detail. */
export function OrderCardSkeleton() {
  return (
    <SkeletonCard style={styles.order}>
      <Bone w={64} h={22} r={T.radius.pill} />
      <Bone w="60%" h={22} style={{ marginTop: T.space.md }} />
      <Bone w="35%" h={26} style={{ marginTop: T.space.sm }} />
      <Bone w="100%" h={56} r={T.radius.md} style={{ marginTop: T.space.md }} />
    </SkeletonCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.color.card, borderRadius: T.radius.lg,
    borderWidth: 1.5, borderColor: T.color.line, ...T.plate.card,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: T.space.md, padding: T.space.md },
  lines: { flex: 1, gap: 8 },
  order: { padding: T.space.lg, borderRadius: T.radius.xl },
});
