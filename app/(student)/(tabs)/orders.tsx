// app/(student)/(tabs)/orders.tsx
// DormDash — Orders (Route identity).
// Functionality unchanged: active order listener, past orders listener, cancel
// with race-safe try/catch. Timeline redesigned as horizontal rail. All-cream
// palette, no more yellow. Extra bottom padding for the floating tab bar.

import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  Alert, Animated, Easing, LayoutAnimation, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { cancelOrder, canStudentCancel } from '../../../services/orders';
import { useStudentActiveOrders, useStudentOrderHistory } from '../../../hooks/useOrders';
import { useAuth } from '../../../hooks/useAuth';
import { Order, OrderStatus } from '../../../types';
import { STATUS_STEPS, PAY_WINDOW_MIN } from '../../../constants';
import { usePriceUnit } from '../../../hooks/usePriceUnit';
import { T, useReducedMotion } from '../../../constants/theme';
import { Backdrop } from '../../../components/Backdrop';
import { TideHeader } from '../../../components/Tide';
import { SkeletonGroup, OrderCardSkeleton, Bone } from '../../../components/Skeleton';
import { Seal } from '../../../components/Seal';
import { Money } from '../../../components/Money';
import { Icon } from '../../../components/TabIcon';


const STATUS_CONFIG: Record<OrderStatus, { label: string; description: string; color: string }> = {
  pending:    { label: 'Pending',    description: 'Waiting for a dasher to accept', color: T.color.warning },
  accepted:   { label: 'Accepted',   description: 'A dasher is heading to the store', color: T.color.cerulean },
  picking_up: { label: 'Picking up', description: 'Dasher is at the store',           color: T.color.cerulean },
  on_the_way: { label: 'On the way', description: 'Your order is on its way!',        color: T.color.teal },
  delivered:  { label: 'Delivered',  description: 'Enjoy your order!',                 color: T.color.teal },
  cancelled:  { label: 'Cancelled',  description: 'This order was cancelled',         color: T.color.danger },
};


const formatDate = (ts: number) => {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ─── STATUS RAIL ─────────────────────────────────────────────────────
// Horizontal timeline. Completed dots teal, active dot cerulean with a
// soft pulse ring. Cancelled orders hide the rail entirely.
const StatusRail: React.FC<{ status: OrderStatus; reduced: boolean }> = ({ status, reduced }) => {
  const currentIndex = STATUS_STEPS.indexOf(status);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced]);

  if (status === 'cancelled') return null;

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <View style={rail.container}>
      {STATUS_STEPS.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isActive = i === currentIndex;
        return (
          <View key={step} style={rail.step}>
            {i > 0 && (
              <View style={[rail.line, i <= currentIndex && rail.lineDone]} />
            )}
            <View style={rail.dotWrap}>
              {isActive && !reduced && (
                <Animated.View
                  style={[
                    rail.pulse,
                    { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                  ]}
                />
              )}
              <View style={[
                rail.dot,
                isCompleted && rail.dotDone,
                isActive && rail.dotActive,
              ]} />
            </View>
            <Text style={[
              rail.label,
              isCompleted && rail.labelDone,
              isActive && rail.labelActive,
            ]} numberOfLines={1}>
              {STATUS_CONFIG[step].label}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

const rail = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: T.space.md,
  },
  step: { flex: 1, alignItems: 'center', position: 'relative' },
  line: {
    position: 'absolute',
    top: 12, left: 0, width: '50%', height: 2,
    backgroundColor: T.color.line,
    zIndex: 0,
  },
  lineDone: { backgroundColor: T.color.teal },
  dotWrap: {
    width: 24, height: 24,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 1,
  },
  pulse: {
    position: 'absolute',
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: T.color.cerulean,
  },
  dot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: T.color.card,
    borderWidth: 2, borderColor: T.color.lineStrong,
  },
  dotDone: { backgroundColor: T.color.teal, borderColor: T.color.teal },
  dotActive: {
    backgroundColor: T.color.cerulean,
    borderColor: T.color.cerulean,
    width: 16, height: 16, borderRadius: 8,
  },
  label: {
    fontSize: 9, fontWeight: '700',
    color: T.color.inkFaint,
    marginTop: 8, textAlign: 'center',
    letterSpacing: 0.3,
  },
  labelDone: { color: T.color.inkSoft },
  labelActive: { color: T.color.cerulean, fontWeight: '800' },
});

// ─── ACTIVE ORDER CARD ──────────────────────────────────────────────
// With more than one order in progress, each card is a drawer: closed, it
// is one row (store, status, amount, and "Payment needed" when it is), and
// tapping it opens the full card. One drawer is open at a time.
type Drawer = { open: boolean; onToggle: () => void };

const ActiveOrderCard: React.FC<{ order: Order; onCancel: () => void; reduced: boolean; drawer?: Drawer }> = ({ order, onCancel, reduced, drawer }) => {
  const { fmt } = usePriceUnit();
  const cfg = STATUS_CONFIG[order.status];
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced]);

  const liveScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });
  const liveOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });
  const code = order.id.slice(-6).toUpperCase();
  const needsPay = order.paymentMethod === 'card' && order.paymentStatus === 'awaiting_payment';

  const liveDot = (
    <View style={active.liveWrap}>
      {!reduced && (
        <Animated.View
          style={[active.livePulse, { transform: [{ scale: liveScale }], opacity: liveOpacity }]}
        />
      )}
      <View style={active.liveDot} />
    </View>
  );

  if (drawer && !drawer.open) {
    return (
      <Pressable
        onPress={drawer.onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: false }}
        accessibilityLabel={`${order.storeName}, ${cfg.label}${needsPay ? ', payment needed' : ''}. Show details`}
        style={({ pressed }) => [active.card, active.drawerClosed, pressed && { transform: [{ scale: 0.99 }] }]}
      >
        <View style={active.drawerRow}>
          {liveDot}
          <View style={{ flex: 1 }}>
            <Text style={active.drawerStore} numberOfLines={1}>{order.storeName}</Text>
            <Text style={[active.drawerMeta, { color: cfg.color }]} numberOfLines={1}>
              {cfg.label}<Text style={active.drawerCode}>{`  #${code}`}</Text>
            </Text>
          </View>
          <Money style={active.drawerAmount}>{fmt(order.totalAmount)}</Money>
          <Icon name="chevron-down" size={18} color={T.color.inkSoft} />
        </View>
        {needsPay && (
          <View style={[active.payNeeded, active.drawerPay]}>
            <Text style={active.payNeededText}>{`Payment needed within ${PAY_WINDOW_MIN} minutes`}</Text>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => router.push(`/(student)/order/${order.id}` as any)}
      style={({ pressed }) => [
        active.card,
        pressed && { transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={active.head}>
        <View style={active.live}>
          {liveDot}
          <Text style={active.liveText}>Live</Text>
        </View>
        <View style={active.headRight}>
          <Text style={active.id}>#{code}</Text>
          {drawer && (
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); drawer.onToggle(); }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityState={{ expanded: true }}
              accessibilityLabel="Collapse"
              style={active.collapse}
            >
              <View style={{ transform: [{ rotate: '180deg' }] }}>
                <Icon name="chevron-down" size={18} color={T.color.inkSoft} />
              </View>
            </Pressable>
          )}
        </View>
      </View>

      <View style={active.storeRow}>
        <Text style={[active.store, { flex: 1 }]}>{order.storeName}</Text>
        {order.status === 'on_the_way' && <Seal char="走" size={54} stamp />}
      </View>

      {needsPay && (
        <View style={active.payNeeded}>
          <Text style={active.payNeededText}>{`Payment needed. Tap to pay within ${PAY_WINDOW_MIN} minutes.`}</Text>
        </View>
      )}

      {/* Hollowed amount */}
      <View style={active.amountPlate}>
        <Money style={active.amountText}>{fmt(order.totalAmount)}</Money>
      </View>

      <Text style={active.items} numberOfLines={2}>
        {order.items.map(i => i.menuItem.name).join(' · ')}
      </Text>

      <View style={active.addressRow}>
        <Text style={active.addressLabel}>Delivery to</Text>
        <Text style={active.address} numberOfLines={1}>{order.deliveryAddress.label}</Text>
      </View>

      {order.dasherName && (
        <View style={active.dasher}>
          <View style={active.dasherAvatar}>
            <Text style={active.dasherInitial}>{order.dasherName[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={active.dasherLabel}>Your dasher</Text>
            <Text style={active.dasherName}>{order.dasherName}</Text>
          </View>
          <View style={[active.statusPill, { backgroundColor: cfg.color + '18' }]}>
            <Text style={[active.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
      )}

      <View style={active.descBox}>
        <Text style={active.desc}>{cfg.description}</Text>
      </View>

      <StatusRail status={order.status} reduced={reduced} />

      {canStudentCancel(order) && (
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); onCancel(); }}
          style={({ pressed }) => [
            active.cancelBtn,
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          <Text style={active.cancelText}>Cancel order</Text>
        </Pressable>
      )}
    </Pressable>
  );
};

const active = StyleSheet.create({
  payNeeded: {
    alignSelf: 'flex-start', marginTop: 2, marginBottom: T.space.sm, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: T.radius.md, backgroundColor: T.color.ceruleanTint,
  },
  payNeededText: { fontSize: 12, fontWeight: '800', color: T.color.ceruleanDeep },
  card: {
    backgroundColor: T.color.card,
    marginHorizontal: T.space.lg,
    marginBottom: T.space.lg,
    borderRadius: T.radius.xl,
    padding: T.space.lg,
    borderWidth: 2,
    borderColor: T.color.teal,
    ...T.plate.teal,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: T.space.md },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: T.space.sm },
  collapse: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.color.creamDeep,
  },

  // Closed drawer (more than one order in progress)
  drawerClosed: { paddingVertical: T.space.md, marginBottom: T.space.md },
  drawerRow: { flexDirection: 'row', alignItems: 'center', gap: T.space.sm },
  drawerStore: { ...T.type.title, fontSize: 18, color: T.color.ink },
  drawerMeta: { ...T.type.body, fontSize: 13, fontWeight: '800', marginTop: 1 },
  drawerCode: { color: T.color.inkFaint, fontWeight: '700', fontVariant: ['tabular-nums'] },
  drawerAmount: { fontSize: 17, fontWeight: '900', color: T.color.cerulean, letterSpacing: -0.3 },
  drawerPay: { marginTop: T.space.sm, marginBottom: 0 },
  live: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: T.color.tealTint,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: T.radius.pill,
  },
  liveWrap: { width: 8, height: 8, justifyContent: 'center', alignItems: 'center' },
  livePulse: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: T.color.teal },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.color.teal },
  liveText: { fontSize: 12, fontWeight: '900', color: T.color.teal, letterSpacing: 0.2 },
  id: { fontSize: 12, color: T.color.inkFaint, fontVariant: ['tabular-nums'], fontWeight: '700' },

  storeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: T.space.sm },
  store: { ...T.type.title, fontSize: 22, color: T.color.ink, marginBottom: T.space.sm },

  amountPlate: {
    alignSelf: 'flex-start',
    marginBottom: T.space.md,
  },
  amountText: {
    fontSize: 24, fontWeight: '900', color: T.color.cerulean, letterSpacing: -0.6,
  },

  items: { ...T.type.body, fontSize: 13, color: T.color.inkSoft, marginBottom: T.space.md, lineHeight: 18 },

  addressRow: {
    backgroundColor: T.color.creamDeep,
    borderRadius: T.radius.md,
    padding: T.space.md,
    marginBottom: T.space.md,
    gap: 2,
  },
  addressLabel: { ...T.type.label, color: T.color.inkFaint, fontSize: 10 },
  address: { ...T.type.body, fontSize: 14, fontWeight: '700', color: T.color.ink },

  dasher: {
    flexDirection: 'row', alignItems: 'center', gap: T.space.sm,
    backgroundColor: T.color.tealTint,
    borderRadius: T.radius.md,
    padding: T.space.sm,
    marginBottom: T.space.md,
  },
  dasherAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: T.color.teal,
    justifyContent: 'center', alignItems: 'center',
  },
  dasherInitial: { color: T.color.card, fontSize: 15, fontWeight: '900' },
  dasherLabel: { ...T.type.label, color: T.color.inkFaint, fontSize: 9 },
  dasherName: { ...T.type.body, fontSize: 14, fontWeight: '800', color: T.color.ink },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: T.radius.pill },
  statusPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  descBox: {
    backgroundColor: T.color.ceruleanTint,
    borderRadius: T.radius.md,
    padding: T.space.sm,
  },
  desc: { ...T.type.body, fontSize: 13, color: T.color.ink, fontWeight: '600', lineHeight: 18 },

  cancelBtn: {
    backgroundColor: T.color.dangerTint,
    borderRadius: T.radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: T.space.sm,
    borderWidth: 1, borderColor: 'rgba(201, 79, 79, 0.3)',
  },
  cancelText: { color: T.color.danger, fontWeight: '800', fontSize: 14, letterSpacing: 0.3 },
});

// ─── HISTORY CARD ───────────────────────────────────────────────────
const HistoryCard: React.FC<{ order: Order }> = ({ order }) => {
  const { fmt } = usePriceUnit();
  const cfg = STATUS_CONFIG[order.status];
  const isDelivered = order.status === 'delivered';
  return (
    <Pressable
      onPress={() => router.push(`/(student)/order/${order.id}` as any)}
      style={({ pressed }) => [hist.card, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      {isDelivered ? (
        <Seal char="配" size={36} style={{ marginTop: 2 }} />
      ) : (
        <View style={[hist.icon, hist.iconCancelled]}>
          <Text style={[hist.iconText, { color: T.color.danger }]}>×</Text>
        </View>
      )}
      <View style={hist.content}>
        <View style={hist.top}>
          <Text style={hist.store} numberOfLines={1}>{order.storeName}</Text>
          <Money style={hist.amount}>{fmt(order.totalAmount)}</Money>
        </View>
        <View style={hist.meta}>
          <Text style={hist.date}>{formatDate(order.createdAt)}</Text>
          <View style={hist.metaDot} />
          <Text style={hist.time}>{formatTime(order.createdAt)}</Text>
          <View style={hist.metaDot} />
          <View style={[hist.statusChip, { backgroundColor: cfg.color + '18' }]}>
            <Text style={[hist.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        <Text style={hist.items} numberOfLines={1}>
          {order.items.length} {order.items.length === 1 ? 'item' : 'items'} · {order.items.map(i => i.menuItem.name).join(', ')}
        </Text>
      </View>
    </Pressable>
  );
};

const hist = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: T.space.md,
    backgroundColor: T.color.card,
    marginHorizontal: T.space.lg,
    marginBottom: T.space.md,
    borderRadius: T.radius.lg,
    padding: T.space.md,
    borderWidth: 1.5, borderColor: T.color.line,
    ...T.plate.card,
  },
  icon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: T.color.tealTint,
    justifyContent: 'center', alignItems: 'center',
  },
  iconText: { fontSize: 18, fontWeight: '900', color: T.color.teal },
  iconCancelled: { backgroundColor: T.color.dangerTint },
  content: { flex: 1, gap: 4 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  store: { flex: 1, ...T.type.body, fontSize: 14, fontWeight: '800', color: T.color.ink, marginRight: T.space.sm },
  amount: { ...T.type.body, fontSize: 15, fontWeight: '900', color: T.color.cerulean },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  date: { fontSize: 12, color: T.color.inkSoft, fontWeight: '700' },
  time: { fontSize: 12, color: T.color.inkFaint, fontWeight: '600' },
  metaDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: T.color.lineStrong },
  statusChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radius.pill },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  items: { ...T.type.body, fontSize: 12, color: T.color.inkFaint, marginTop: 2 },
});

const PAGE_SIZE = 10;

// ─── MAIN ────────────────────────────────────────────────────────────
export default function StudentOrders() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  // Past orders are shown PAGE_SIZE at a time, and only that many are loaded:
  // "Show more" widens the live query (hooks/useOrders.ts).
  const [visiblePast, setVisiblePast] = useState(PAGE_SIZE);
  const activeOrders = useStudentActiveOrders(user?.uid);
  const { pastOrders, loading, totals } = useStudentOrderHistory(user?.uid, visiblePast);

  // More than one order in progress: drawers, one open at a time.
  const drawers = activeOrders.length > 1;
  const [openId, setOpenId] = useState<string | null>(null);
  const toggleDrawer = (id: string) => {
    if (!reduced && Platform.OS !== 'web') LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenId(cur => (cur === id ? null : id));
  };

  const handleCancel = (activeOrder: Order) => {
    const accepted = activeOrder.status === 'accepted';
    Alert.alert(
      'Cancel Order',
      accepted
        ? `${activeOrder.dasherName ?? 'Your dasher'} will be told not to buy it. You haven't been charged. If a card payment goes through after this, it comes back to you as tokens.`
        : 'Are you sure you want to cancel this order?',
      [
        { text: 'Keep Order', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelOrder(activeOrder.id);
            } catch (e) {
              Alert.alert(
                'Too Late to Cancel',
                accepted
                  ? 'This order has already been paid, so your dasher is on it. Contact DormDash support if you need to cancel.'
                  : 'A dasher just accepted your order. Pay now to confirm it, or cancel it from here.'
              );
            }
          },
        },
      ]
    );
  };

  const olderCount = Math.max(0, (totals?.past ?? pastOrders.length) - visiblePast);

  return (
    <View style={styles.root}>
      <Backdrop tone="cream" />
      {loading ? (
        <View>
          <TideHeader title="Orders" kicker="What's on the way, and what came before" />
          <SkeletonGroup label="Loading your orders…" style={styles.skeleton}>
            <Bone w="100%" h={84} r={T.radius.lg} />
            <OrderCardSkeleton />
          </SkeletonGroup>
        </View>
      ) : (
        <FlatList
          data={pastOrders.slice(0, visiblePast)}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <TideHeader title="Orders" kicker="What's on the way, and what came before" />
              <View style={{ height: T.space.md }} />
              {drawers && (
                <Text style={styles.activeLabel}>{activeOrders.length} orders in progress</Text>
              )}
              {activeOrders.length > 0 ? (
                activeOrders.map(o => (
                  <ActiveOrderCard
                    key={o.id}
                    order={o}
                    onCancel={() => handleCancel(o)}
                    reduced={reduced}
                    drawer={drawers ? { open: openId === o.id, onToggle: () => toggleDrawer(o.id) } : undefined}
                  />
                ))
              ) : (
                <View style={styles.noActiveCard}>
                  <View style={styles.noActiveTile}><View style={styles.noActiveInner} /></View>
                  <Text style={styles.noActiveTitle}>No active order</Text>
                  <Text style={styles.noActiveSub}>Head to Home to place a new one.</Text>
                </View>
              )}

              {pastOrders.length > 0 && (
                <Text style={styles.historyLabel}>Past orders</Text>
              )}
            </>
          }
          ListFooterComponent={
            pastOrders.length > visiblePast ? (
              <Pressable
                onPress={() => setVisiblePast(n => n + PAGE_SIZE)}
                style={({ pressed }) => [styles.moreBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
              >
                <Text style={styles.moreText}>
                  {olderCount > 0
                    ? `Show ${Math.min(PAGE_SIZE, olderCount)} more (${olderCount} older)`
                    : 'Show more'}
                </Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            activeOrders.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No orders yet</Text>
                <Text style={styles.emptySub}>Your order history will appear here.</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => <HistoryCard order={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.cream },

  canvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: -1 },
  blobTeal: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: T.color.teal, opacity: 0.06,
    top: -80, right: -80,
  },
  blobCerulean: {
    position: 'absolute', width: 240, height: 240, borderRadius: 120,
    backgroundColor: T.color.cerulean, opacity: 0.05,
    top: 260, left: -100,
  },

  skeleton: { paddingHorizontal: T.space.lg, paddingTop: T.space.md, gap: T.space.lg },

  // No active
  noActiveCard: {
    backgroundColor: T.color.card,
    marginHorizontal: T.space.lg,
    marginBottom: T.space.lg,
    borderRadius: T.radius.xl,
    padding: T.space.xl,
    alignItems: 'center',
    borderWidth: 1.5, borderColor: T.color.line,
    gap: T.space.sm,
    ...T.plate.card,
  },
  noActiveTile: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: T.color.ceruleanTint,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: T.space.sm,
  },
  noActiveInner: { width: 20, height: 20, borderRadius: 6, backgroundColor: T.color.cerulean, opacity: 0.4 },
  noActiveTitle: { ...T.type.title, fontSize: 18, color: T.color.ink },
  noActiveSub: { ...T.type.body, fontSize: 13, color: T.color.inkSoft, textAlign: 'center' },

  moreBtn: {
    alignSelf: 'center',
    marginTop: T.space.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: T.color.lineStrong,
    backgroundColor: T.color.card,
    ...T.plate.card, shadowOffset: { width: 0, height: 3 },
  },
  moreText: { ...T.type.body, fontSize: 14, fontWeight: '700', color: T.color.ceruleanDeep },
  activeLabel: {
    ...T.type.body, fontSize: 14, fontWeight: '800',
    color: T.color.inkSoft,
    paddingHorizontal: T.space.lg,
    paddingBottom: T.space.sm,
  },
  historyLabel: {
    ...T.type.title, fontSize: 21,
    color: T.color.ink,
    paddingHorizontal: T.space.lg,
    paddingTop: T.space.md,
    paddingBottom: T.space.sm,
  },

  empty: {
    alignItems: 'center', paddingTop: 40,
    paddingHorizontal: T.space.xl, gap: T.space.sm,
  },
  emptyTitle: { ...T.type.title, fontSize: 18, color: T.color.ink },
  emptySub: { ...T.type.body, fontSize: 13, color: T.color.inkSoft, textAlign: 'center' },
});
