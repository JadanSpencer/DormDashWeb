// app/(student)/order/[id].tsx
// DormDash — Live order tracking (Route identity).
//
// FUNCTIONALITY UNCHANGED. Same real-time onSnapshot listener on the order
// doc, same loading / not-found handling, same home navigation. Map renders
// only while the order is en route AND deliveryAddress.hasGpsFix is true —
// a campus-fallback pin would lie.
//
// Visual layer:
//   • Cream canvas, ink type, cerulean action, teal support.
//   • Status hero: pulsing live dot, status in title type, dasher chip.
//   • Vertical timeline rail — the route itself: stops light up teal as
//     the order progresses, current stop pulses cerulean.
//   • Delivered → quiet celebration state (teal, check, thank-you).
//   • Cancelled → honest, not alarming.
//   • Items with hollowed price plates. Total hollowed large.
//   • Jcommerce watermark at the bottom of the scroll.

import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Pressable, ActivityIndicator,
  Animated, Easing
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { Order, OrderStatus } from '../../../types';
import { formatJMD } from '../../../constants';
import { T, useReducedMotion } from '../../../constants/theme';
import { Watermark } from '../../../components/Watermark';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; description: string }> = {
  pending:    { label: 'Finding a dasher', color: T.color.warning,  description: 'Waiting for a dasher to accept your order' },
  accepted:   { label: 'Dasher assigned',  color: T.color.cerulean, description: 'Your dasher is heading to the store' },
  picking_up: { label: 'Picking up',       color: T.color.cerulean, description: 'Your dasher is at the store collecting your order' },
  on_the_way: { label: 'On the way',       color: T.color.teal,     description: 'Your dasher is heading to you!' },
  delivered:  { label: 'Delivered',        color: T.color.teal,     description: 'Enjoy your order!' },
  cancelled:  { label: 'Cancelled',        color: T.color.danger,   description: 'This order was cancelled' },
};

const STATUS_ORDER: OrderStatus[] = ['pending', 'accepted', 'picking_up', 'on_the_way', 'delivered'];

const goHome = () => router.replace('/(student)/(tabs)/home');

export default function OrderTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  // Live pulse on the status dot
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'orders', id), snap => {
      if (snap.exists()) {
        setOrder({ id: snap.id, ...snap.data() } as Order);
      }
      setLoading(false);
    });
    return unsub;
  }, [id]);

  if (loading) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator color={T.color.cerulean} size="large" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centerFill}>
        <View style={styles.notFoundTile}><Text style={styles.notFoundMark}>?</Text></View>
        <Text style={styles.notFoundTitle}>Order not found</Text>
        <Pressable
          onPress={goHome}
          style={({ pressed }) => [styles.homeBtn, pressed && { transform: [{ scale: 0.97 }] }]}
        >
          <Text style={styles.homeBtnText}>Go home</Text>
        </Pressable>
      </View>
    );
  }

  const config = STATUS_CONFIG[order.status];
  const currentStepIndex = STATUS_ORDER.indexOf(order.status);
  const isDelivered = order.status === 'delivered';
  const isCancelled = order.status === 'cancelled';
  const showMap =
    (order.status === 'on_the_way' || order.status === 'picking_up' || order.status === 'accepted')
    && order.deliveryAddress.hasGpsFix;

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={styles.root}>
      <View style={styles.canvas} pointerEvents="none">
        <View style={styles.blobTeal} />
        <View style={styles.blobCerulean} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + T.space.md }]}>
          <TouchableOpacity onPress={goHome} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Order #{order.id.slice(-6).toUpperCase()}</Text>
            <Text style={styles.title}>
              {isDelivered ? 'Delivered' : isCancelled ? 'Cancelled' : 'Tracking'}
            </Text>
          </View>
        </View>

        {/* ── STATUS HERO ─────────────────────────────────────────── */}
        {isDelivered ? (
          <View style={[styles.hero, styles.heroDelivered]}>
            <View style={styles.deliveredMark}>
              <Text style={styles.deliveredCheck}>✓</Text>
            </View>
            <Text style={styles.deliveredTitle}>Order delivered</Text>
            <Text style={styles.deliveredSub}>
              Enjoy your food from {order.storeName}!
            </Text>
          </View>
        ) : isCancelled ? (
          <View style={[styles.hero, styles.heroCancelled]}>
            <View style={styles.cancelledMark}>
              <Text style={styles.cancelledX}>×</Text>
            </View>
            <Text style={styles.cancelledTitle}>Order cancelled</Text>
            <Text style={styles.cancelledSub}>
              No charge — feel free to order again anytime.
            </Text>
          </View>
        ) : (
          <View style={styles.hero}>
            <View style={styles.statusRow}>
              <View style={styles.pulseWrap}>
                {!reduced && (
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      { backgroundColor: config.color, transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                    ]}
                  />
                )}
                <View style={[styles.statusDot, { backgroundColor: config.color }]} />
              </View>
              <Text style={[styles.statusLabel, { color: config.color }]}>{config.label}</Text>
            </View>
            <Text style={styles.statusDesc}>{config.description}</Text>

            {order.dasherName && (
              <View style={styles.dasherChip}>
                <View style={styles.dasherAvatar}>
                  <Text style={styles.dasherInitial}>{order.dasherName[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dasherLabel}>Your dasher</Text>
                  <Text style={styles.dasherName}>{order.dasherName}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── LIVE MAP — only en route with a real GPS fix ────────── */}
        {showMap && (
          <View style={styles.mapCard}>
            <MapView
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              initialRegion={{
                latitude: order.deliveryAddress.latitude,
                longitude: order.deliveryAddress.longitude,
                latitudeDelta: 0.012,
                longitudeDelta: 0.012,
              }}
            >
              <Marker
                coordinate={order.deliveryAddress}
                title="Delivery location"
              />
            </MapView>
          </View>
        )}

        {/* ── TIMELINE — the route, vertical ──────────────────────── */}
        {!isCancelled && (
          <>
            <Text style={styles.sectionLabel}>Progress</Text>
            <View style={styles.card}>
              {STATUS_ORDER.map((status, idx) => {
                const s = STATUS_CONFIG[status];
                const isCompleted = idx < currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <View key={status} style={styles.step}>
                    <View style={styles.stepLeft}>
                      <View style={[
                        styles.stepDot,
                        isCompleted && styles.stepDotDone,
                        isCurrent && styles.stepDotCurrent,
                      ]}>
                        {isCompleted && <Text style={styles.stepCheck}>✓</Text>}
                      </View>
                      {idx < STATUS_ORDER.length - 1 && (
                        <View style={[styles.stepLine, isCompleted && styles.stepLineDone]} />
                      )}
                    </View>
                    <View style={styles.stepBody}>
                      <Text style={[
                        styles.stepLabel,
                        isCompleted && styles.stepLabelDone,
                        isCurrent && { color: s.color, fontWeight: '900' },
                      ]}>
                        {s.label}
                      </Text>
                      {isCurrent && (
                        <Text style={styles.stepDesc}>{s.description}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── DELIVERY DETAILS ─────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Delivery</Text>
        <View style={styles.card}>
          <Text style={styles.detailLabel}>Location</Text>
          <Text style={styles.detailValue}>{order.deliveryAddress.label}</Text>
          {order.studentNote ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.detailLabel}>Your note</Text>
              <Text style={styles.detailValue}>{order.studentNote}</Text>
            </>
          ) : null}
        </View>

        {/* ── ITEMS ────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>From {order.storeName}</Text>
        <View style={styles.card}>
          {order.items.map((item, i) => (
            <View key={i} style={styles.lineItem}>
              <View style={styles.qtyBadge}>
                <Text style={styles.qtyBadgeText}>{item.quantity}</Text>
              </View>
              <Text style={styles.itemName} numberOfLines={1}>{item.menuItem.name}</Text>
              <View style={styles.itemPricePlate}>
                <Text style={styles.itemPriceText}>
                  {formatJMD(item.menuItem.price * item.quantity)}
                </Text>
              </View>
            </View>
          ))}

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery</Text>
            <Text style={[styles.summaryValue, order.deliveryFee === 0 && { color: T.color.teal, fontWeight: '900' }]}>
              {order.deliveryFee === 0 ? 'Free' : formatJMD(order.deliveryFee)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <View style={styles.totalPlate}>
              <Text style={styles.totalText}>{formatJMD(order.totalAmount)}</Text>
            </View>
          </View>
        </View>

        {/* ── ACTION ───────────────────────────────────────────────── */}
        {(isDelivered || isCancelled) && (
          <Pressable
            onPress={goHome}
            style={({ pressed }) => [styles.cta, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <Text style={styles.ctaText}>Back to home</Text>
          </Pressable>
        )}

        <Watermark variant="inline" tint="teal" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.cream },
  centerFill: {
    flex: 1, backgroundColor: T.color.cream,
    justifyContent: 'center', alignItems: 'center', gap: T.space.md,
    paddingHorizontal: T.space.xl,
  },

  canvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: -1 },
  blobTeal: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: T.color.teal, opacity: 0.06,
    top: -80, right: -80,
  },
  blobCerulean: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: T.color.cerulean, opacity: 0.05,
    top: 320, left: -110,
  },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: T.space.md,
    paddingHorizontal: T.space.lg, paddingBottom: T.space.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: T.color.card,
    justifyContent: 'center', alignItems: 'center',
    ...T.shadow.card,
  },
  backText: { fontSize: 20, fontWeight: '700', color: T.color.ink },
  eyebrow: { ...T.type.label, color: T.color.teal, fontSize: 10 },
  title: { ...T.type.title, fontSize: 24, color: T.color.ink },

  // Hero
  hero: {
    backgroundColor: T.color.card,
    marginHorizontal: T.space.lg,
    marginBottom: T.space.sm,
    borderRadius: T.radius.xl,
    padding: T.space.lg,
    borderWidth: 1, borderColor: T.color.line,
    ...T.shadow.card, shadowOpacity: 0.06,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: T.space.sm, marginBottom: T.space.sm },
  pulseWrap: { width: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
  pulseRing: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusLabel: { ...T.type.title, fontSize: 22 },
  statusDesc: { ...T.type.body, fontSize: 14, color: T.color.inkSoft, lineHeight: 20 },

  dasherChip: {
    flexDirection: 'row', alignItems: 'center', gap: T.space.sm,
    backgroundColor: T.color.tealTint,
    borderRadius: T.radius.md,
    padding: T.space.sm,
    marginTop: T.space.md,
  },
  dasherAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: T.color.teal,
    justifyContent: 'center', alignItems: 'center',
  },
  dasherInitial: { color: T.color.card, fontSize: 16, fontWeight: '900' },
  dasherLabel: { ...T.type.label, color: T.color.inkFaint, fontSize: 9 },
  dasherName: { ...T.type.body, fontSize: 15, fontWeight: '800', color: T.color.ink },

  // Delivered celebration
  heroDelivered: { alignItems: 'center', backgroundColor: T.color.tealTint, borderColor: 'rgba(15, 168, 147, 0.3)' },
  deliveredMark: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: T.color.teal,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: T.space.md,
    shadowColor: T.color.teal,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
  },
  deliveredCheck: { color: T.color.card, fontSize: 36, fontWeight: '900' },
  deliveredTitle: { ...T.type.title, fontSize: 24, color: T.color.ink, marginBottom: 4 },
  deliveredSub: { ...T.type.body, fontSize: 14, color: T.color.inkSoft, textAlign: 'center' },

  // Cancelled
  heroCancelled: { alignItems: 'center' },
  cancelledMark: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: T.color.dangerTint,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: T.space.md,
    borderWidth: 1, borderColor: 'rgba(201, 79, 79, 0.3)',
  },
  cancelledX: { color: T.color.danger, fontSize: 32, fontWeight: '900' },
  cancelledTitle: { ...T.type.title, fontSize: 22, color: T.color.ink, marginBottom: 4 },
  cancelledSub: { ...T.type.body, fontSize: 13, color: T.color.inkSoft, textAlign: 'center' },

  // Map
  mapCard: {
    marginHorizontal: T.space.lg,
    marginTop: T.space.sm,
    borderRadius: T.radius.lg,
    overflow: 'hidden',
    borderWidth: 1, borderColor: T.color.line,
    ...T.shadow.card, shadowOpacity: 0.05,
  },
  map: { height: 190, width: '100%' },

  // Sections
  sectionLabel: {
    ...T.type.label, color: T.color.inkSoft,
    paddingHorizontal: T.space.lg,
    paddingTop: T.space.lg, paddingBottom: T.space.sm,
  },
  card: {
    backgroundColor: T.color.card,
    marginHorizontal: T.space.lg,
    borderRadius: T.radius.lg,
    padding: T.space.md,
    borderWidth: 1, borderColor: T.color.line,
    gap: T.space.xs,
  },

  // Timeline
  step: { flexDirection: 'row', gap: T.space.md },
  stepLeft: { alignItems: 'center', width: 26 },
  stepDot: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: T.color.cream,
    borderWidth: 2, borderColor: T.color.lineStrong,
    justifyContent: 'center', alignItems: 'center',
  },
  stepDotDone: { backgroundColor: T.color.teal, borderColor: T.color.teal },
  stepDotCurrent: { borderColor: T.color.cerulean, backgroundColor: T.color.ceruleanTint },
  stepCheck: { color: T.color.card, fontSize: 11, fontWeight: '900' },
  stepLine: { width: 2, flex: 1, minHeight: 18, backgroundColor: T.color.line, marginVertical: 2 },
  stepLineDone: { backgroundColor: T.color.teal },
  stepBody: { flex: 1, paddingBottom: T.space.md },
  stepLabel: { ...T.type.body, fontSize: 14, fontWeight: '700', color: T.color.inkFaint, paddingTop: 2 },
  stepLabelDone: { color: T.color.inkSoft },
  stepDesc: { ...T.type.body, fontSize: 12, color: T.color.inkSoft, marginTop: 2 },

  // Details
  detailLabel: { ...T.type.label, color: T.color.inkFaint, fontSize: 10 },
  detailValue: { ...T.type.body, fontSize: 14, fontWeight: '700', color: T.color.ink, marginBottom: 4 },
  divider: { height: 1, backgroundColor: T.color.line, marginVertical: T.space.sm },

  // Items
  lineItem: { flexDirection: 'row', alignItems: 'center', gap: T.space.sm, paddingVertical: 4 },
  qtyBadge: {
    minWidth: 28, height: 28, borderRadius: 8,
    backgroundColor: T.color.ceruleanTint,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 1, borderColor: 'rgba(14, 143, 181, 0.2)',
  },
  qtyBadgeText: { color: T.color.cerulean, fontSize: 12, fontWeight: '900' },
  itemName: { flex: 1, ...T.type.body, fontSize: 14, color: T.color.ink, fontWeight: '600' },
  itemPricePlate: {},
  itemPriceText: { fontSize: 14, fontWeight: '800', color: T.color.ink, letterSpacing: -0.2 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  summaryLabel: { ...T.type.body, fontSize: 14, color: T.color.inkSoft },
  summaryValue: { ...T.type.body, fontSize: 14, fontWeight: '800', color: T.color.ink },
  totalLabel: { ...T.type.body, fontSize: 16, fontWeight: '800', color: T.color.ink },
  totalPlate: {},
  totalText: { fontSize: 22, fontWeight: '900', color: T.color.cerulean, letterSpacing: -0.5 },

  // CTA
  cta: {
    marginHorizontal: T.space.lg,
    marginTop: T.space.lg,
    backgroundColor: T.color.cerulean,
    borderRadius: T.radius.pill,
    height: 54,
    justifyContent: 'center', alignItems: 'center',
    ...T.shadow.button,
  },
  ctaText: { color: T.color.card, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  // Not found
  notFoundTile: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: T.color.ceruleanTint,
    justifyContent: 'center', alignItems: 'center',
  },
  notFoundMark: { fontSize: 32, fontWeight: '900', color: T.color.cerulean },
  notFoundTitle: { ...T.type.title, fontSize: 20, color: T.color.ink },
  homeBtn: {
    backgroundColor: T.color.cerulean,
    borderRadius: T.radius.pill,
    paddingHorizontal: T.space.xl, paddingVertical: 12,
    ...T.shadow.button,
  },
  homeBtnText: { color: T.color.card, fontSize: 14, fontWeight: '800' },
});
