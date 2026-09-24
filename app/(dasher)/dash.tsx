// app/(dasher)/dash.tsx  (URL: /dash)
// DormDash — Dasher work surface (inverted Route identity).
//
// FUNCTIONALITY UNCHANGED: location tracking with lastSeenAt heartbeat,
// online toggle, pending-orders listener, active-order listener, race-safe
// accept (try/catch on rules denial), status walk with deliveredAt,
// map gated by hasGpsFix.
//
// Designed around what a working dasher needs at a glance:
//   1. AM I ONLINE — the toggle is the hero, impossible to miss.
//   2. WHAT AM I EARNING TODAY — Today strip: earnings + deliveries,
//     computed live from this dasher's delivered orders.
//   3. WHAT'S MY CURRENT JOB — active order card: store → customer,
//     address big, payout visible, one giant status button.
//   4. WHAT'S AVAILABLE — queue sorted oldest-first, each card leads
//     with the PAYOUT (delivery fee) — that's what a dasher scans for —
//     then store, drop-off, item count, age.

import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  Switch, Alert, ActivityIndicator, Animated, Easing, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  collection, query, where, onSnapshot,
  updateDoc, doc, orderBy, runTransaction, getDoc,
} from 'firebase/firestore';
import * as Location from 'expo-location';
import { db } from '../../services/firebase';
import { serverNow, syncServerClock } from '../../services/serverClock';
import { useAuth } from '../../hooks/useAuth';
import { useWakeLock } from '../../hooks/useWakeLock';
import { Order, OrderStatus } from '../../types';
import { formatJMD, LOCATION_UPDATE_INTERVAL_MS, HEARTBEAT_INTERVAL_MS } from '../../constants';
import { D } from '../../constants/themeDark';
import MapView, { Marker, PROVIDER_GOOGLE } from '../../components/MapView';

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  accepted:   'picking_up',
  picking_up: 'on_the_way',
  on_the_way: 'delivered',
};

const NEXT_STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  accepted:   'Mark as picked up',
  picking_up: 'Mark as on the way',
  on_the_way: 'Mark as delivered',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending', accepted: 'Accepted', picking_up: 'Picking up',
  on_the_way: 'On the way', delivered: 'Delivered', cancelled: 'Cancelled',
};

// Uses the server's verifiedAt when present: createdAt comes from the
// student's phone clock, which can be minutes (or hours) off.
const minsAgo = (ts: number) => {
  const m = Math.floor((serverNow() - Number(ts)) / 60000);
  if (!Number.isFinite(m) || m < 1) return 'just now';
  if (m >= 60) return `${Math.floor(m / 60)} hr ago`;
  if (m === 1) return '1 min ago';
  return `${m} mins ago`;
};

export default function DasherHome() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [isOnline, setIsOnline] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // PWA: keep the screen on only during an active delivery (map and status
  // buttons in use). Being online no longer needs the app open.
  useWakeLock(isOnline && !!activeOrder);

  // Online glow
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isOnline) { glow.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isOnline]);

  // ── Location + heartbeat ────────────────────────────────────────────
  // The dasher's GPS position stays ON THIS PHONE (the "You" pin on the map).
  // It is not uploaded: nothing on the server used it, and a live location
  // of every online dasher readable by any student was a safety risk.
  // The server only needs a heartbeat (isOnline + lastSeenAt) to know who
  // can take orders. Heartbeat and GPS are independent, so a GPS failure
  // indoors can't knock a dasher offline.
  const startLocationTracking = async () => {
    if (!user) return false;
    try {
      await updateDoc(doc(db, 'dashers', user.uid), {
        isOnline: true,
        lastSeenAt: serverNow(),
      });
    } catch {
      Alert.alert('Could not go online', 'Check your connection and try again.');
      return false;
    }

    let granted = false;
    try {
      granted = (await Location.requestForegroundPermissionsAsync()).status === 'granted';
    } catch { /* map just won't show your pin */ }

    const refreshPosition = async () => {
      if (!granted) return;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch { /* keep the last known pin */ }
    };

    let ticks = 0;
    const perHeartbeat = Math.max(1, Math.round(HEARTBEAT_INTERVAL_MS / LOCATION_UPDATE_INTERVAL_MS));
    refreshPosition();
    locationInterval.current = setInterval(() => {
      refreshPosition();
      ticks += 1;
      if (ticks % perHeartbeat === 0) {
        updateDoc(doc(db, 'dashers', user.uid), { isOnline: true, lastSeenAt: serverNow() })
          .catch(() => { /* next heartbeat retries */ });
      }
    }, LOCATION_UPDATE_INTERVAL_MS);
    return true;
  };

  const stopLocationTracking = () => {
    if (locationInterval.current) {
      clearInterval(locationInterval.current);
      locationInterval.current = null;
    }
    if (user) {
      updateDoc(doc(db, 'dashers', user.uid), {
        isOnline: false,
        currentLocation: null, // clears positions stored by older versions
        lastSeenAt: serverNow(),
      }).catch(() => {});
    }
  };

  const handleToggleOnline = async (value: boolean) => {
    if (value) {
      const success = await startLocationTracking();
      if (success) setIsOnline(true);
    } else {
      stopLocationTracking();
      setIsOnline(false);
    }
  };

  // Online is a switch that stays on until the dasher turns it off (or signs
  // out, see services/auth.ts). Reopening the app picks up where it was;
  // closing it does NOT take the dasher offline, and new-order alerts keep
  // arriving as notifications.
  useEffect(() => {
    syncServerClock();
    if (!user) return;
    let cancelled = false;
    getDoc(doc(db, 'dashers', user.uid)).then(snap => {
      if (!cancelled && snap.data()?.isOnline === true) {
        startLocationTracking().then(ok => { if (ok && !cancelled) setIsOnline(true); });
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
      // Leaving the screen only stops the timers; the switch stays on.
      if (locationInterval.current) {
        clearInterval(locationInterval.current);
        locationInterval.current = null;
      }
    };
  }, [user?.uid]);

  // ── Listeners (unchanged) ──────────────────────────────────────────
  // Bumping this re-opens the order listener. A listener that errors, or
  // that the phone froze while DormDash was in the background, used to stop
  // updating silently: cancelled orders stayed on screen, "X mins ago" kept
  // climbing, and accepting them failed.
  const [listenKey, setListenKey] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') setListenKey(k => k + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc')
    );
    let retry: ReturnType<typeof setTimeout> | undefined;
    const unsub = onSnapshot(q, snap => {
      // Only orders the server has checked (verifyNewOrder sets verifiedAt).
      // Unchecked ones may be about to be rejected: duplicates, rate limits.
      setPendingOrders(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Order))
          .filter(o => !!o.verifiedAt)
      );
      setLoading(false);
    }, err => {
      console.log('Pending orders listener failed, retrying:', err?.message);
      retry = setTimeout(() => setListenKey(k => k + 1), 3000);
    });
    return () => { unsub(); if (retry) clearTimeout(retry); };
  }, [listenKey]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'orders'),
      where('dasherId', '==', user.uid),
      where('status', 'in', ['accepted', 'picking_up', 'on_the_way'])
    );
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) {
        setActiveOrder({ id: snap.docs[0].id, ...snap.docs[0].data() } as Order);
      } else {
        setActiveOrder(null);
      }
    });
    return unsub;
  }, [user]);

  // My orders — one listener feeding the Today strip.
  // Single where clause avoids composite-index requirements; filter client-side.
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'orders'), where('dasherId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      setMyOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
    });
    return unsub;
  }, [user]);

  // ── Accept / status (unchanged handlers) ───────────────────────────
  const handleAccept = async (order: Order) => {
    if (!user) return;
    if (activeOrder) {
      Alert.alert('Active Order', 'Finish your current delivery before accepting a new one.');
      return;
    }
    const ref = doc(db, 'orders', order.id);
    const drop = () => setPendingOrders(list => list.filter(o => o.id !== order.id));
    try {
      // Read and claim in one step, so the message says what really happened
      // instead of always blaming "another dasher".
      const outcome = await runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        const cur = snap.data();
        if (!snap.exists() || !cur) return 'gone';
        if (cur.status === 'cancelled') return 'cancelled';
        if (cur.status !== 'pending' || cur.dasherId) return 'taken';
        tx.update(ref, {
          dasherId: user.uid,
          dasherName: user.name,
          status: 'accepted',
          acceptedAt: serverNow(),
        });
        return 'ok';
      });
      if (outcome === 'ok') return;
      drop();
      if (outcome === 'taken') Alert.alert('Too slow!', 'Another dasher just took this order.');
      else Alert.alert('Order no longer available', 'The customer cancelled this order, or it was a duplicate. It has been removed from your list.');
    } catch (e: any) {
      drop();
      setListenKey(k => k + 1); // refresh the list from the server
      Alert.alert('Order no longer available', 'This order was cancelled or already taken. Your list has been refreshed.');
    }
  };

  const handleStatusUpdate = async () => {
    if (!activeOrder) return;
    const next = NEXT_STATUS[activeOrder.status];
    if (!next) return;

    const update: any = { status: next };
    if (next === 'delivered') update.deliveredAt = serverNow();
    try {
      await updateDoc(doc(db, 'orders', activeOrder.id), update);
    } catch (e) {
      Alert.alert('Update Failed', 'Could not update the order status. Check your connection and try again.');
    }
  };

  // ── Today strip math ───────────────────────────────────────────────
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const todayDelivered = myOrders.filter(
    o => o.status === 'delivered' && (o.deliveredAt ?? 0) >= dayStart
  );
  const todayEarnings = todayDelivered.reduce((s, o) => s + (Number(o.deliveryFee) || 0), 0);

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  return (
    <View style={styles.root}>
      <FlatList
        data={isOnline && !activeOrder ? pendingOrders : []}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* ── HEADER + ONLINE HERO ─────────────────────────────── */}
            <View style={[styles.header, { paddingTop: insets.top + D.space.md }]}>
              <Text style={styles.greeting}>
                {user?.name?.split(' ')[0] ?? 'Dasher'}
              </Text>
            </View>

            <View style={[styles.onlineCard, isOnline && styles.onlineCardActive]}>
              <View style={{ flex: 1 }}>
                <View style={styles.onlineTitleRow}>
                  {/* Live indicator: a small pulsing dot only while online */}
                  <Animated.View style={[styles.onlineDot, isOnline ? { opacity: glowOpacity } : styles.onlineDotOff]} />
                  <Text style={[styles.onlineTitle, isOnline && { color: D.color.teal }]}>
                    {isOnline ? "You're online" : "You're offline"}
                  </Text>
                </View>
                <Text style={styles.onlineSub}>
                  {isOnline
                    ? Platform.OS === 'web'
                      ? 'Receiving orders. You stay online until you switch this off, and new orders arrive as notifications.'
                      : 'Receiving orders. You stay online until you switch this off.'
                    : 'Toggle on to start receiving orders'}
                </Text>
              </View>
              <Switch
                value={isOnline}
                onValueChange={handleToggleOnline}
                trackColor={{ false: D.color.line, true: 'rgba(47, 196, 174, 0.4)' }}
                thumbColor={isOnline ? D.color.teal : D.color.creamFaint}
              />
            </View>

            {/* ── TODAY STRIP ──────────────────────────────────────── */}
            <View style={styles.todayStrip}>
              <View style={styles.todayCard}>
                <Text style={styles.todayLabel}>Today's earnings</Text>
                <View style={styles.todayPlate}>
                  <Text style={styles.todayValue}>{formatJMD(todayEarnings)}</Text>
                </View>
              </View>
              <View style={styles.todayCard}>
                <Text style={styles.todayLabel}>Deliveries</Text>
                <Text style={styles.todayCount}>{todayDelivered.length}</Text>
              </View>
            </View>

            {/* ── ACTIVE ORDER ─────────────────────────────────────── */}
            {activeOrder && (
              <View style={styles.activeCard}>
                <View style={styles.activeHead}>
                  <View style={styles.activeBadge}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activeBadgeText}>ACTIVE DELIVERY</Text>
                  </View>
                  <Text style={styles.activeStatus}>{STATUS_LABEL[activeOrder.status]}</Text>
                </View>

                <Text style={styles.activeStore}>{activeOrder.storeName}</Text>

                <View style={styles.routeRow}>
                  <View style={styles.routeStop}>
                    <View style={[styles.routeDot, { backgroundColor: D.color.cerulean }]} />
                    <Text style={styles.routeText}>Pick up · {activeOrder.storeName}</Text>
                  </View>
                  <View style={styles.routeLine} />
                  <View style={styles.routeStop}>
                    <View style={[styles.routeDot, { backgroundColor: D.color.teal }]} />
                    <Text style={styles.routeText} numberOfLines={1}>
                      Drop off · {activeOrder.deliveryAddress.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.activeMeta}>
                  <View>
                    <Text style={styles.metaLabel}>Customer</Text>
                    <Text style={styles.metaValue}>{activeOrder.studentName}</Text>
                  </View>
                  <View>
                    <Text style={styles.metaLabel}>Items</Text>
                    <Text style={styles.metaValue}>{activeOrder.items.length}</Text>
                  </View>
                  <View>
                    <Text style={styles.metaLabel}>Your payout</Text>
                    <View style={styles.payoutPlate}>
                      <Text style={styles.payoutText}>{formatJMD(activeOrder.deliveryFee)}</Text>
                    </View>
                  </View>
                </View>

                {activeOrder.studentNote ? (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteLabel}>Note from customer</Text>
                    <Text style={styles.noteText}>{activeOrder.studentNote}</Text>
                  </View>
                ) : null}

                {/* Map — only with a real GPS fix */}
                {activeOrder.deliveryAddress.hasGpsFix ? (
                  <View style={styles.mapWrap}>
                    <MapView
                      style={styles.map}
                      provider={PROVIDER_GOOGLE}
                      initialRegion={{
                        latitude: activeOrder.deliveryAddress.latitude,
                        longitude: activeOrder.deliveryAddress.longitude,
                        latitudeDelta: 0.015,
                        longitudeDelta: 0.015,
                      }}
                    >
                      <Marker coordinate={activeOrder.deliveryAddress} title="Drop-off" />
                      {location && <Marker coordinate={location} title="You" pinColor="#33ADD1" />}
                    </MapView>
                  </View>
                ) : (
                  <View style={styles.noGpsBox}>
                    <Text style={styles.noGpsLabel}>No GPS pin. Deliver to:</Text>
                    <Text style={styles.noGpsAddress}>{activeOrder.deliveryAddress.label}</Text>
                  </View>
                )}

                {NEXT_STATUS[activeOrder.status] && (
                  <Pressable
                    onPress={handleStatusUpdate}
                    style={({ pressed }) => [styles.statusBtn, pressed && { transform: [{ scale: 0.97 }] }]}
                  >
                    <Text style={styles.statusBtnText}>{NEXT_STATUS_LABEL[activeOrder.status]}</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* ── QUEUE HEADER ─────────────────────────────────────── */}
            {isOnline && !activeOrder && (
              <View style={styles.queueHead}>
                <Text style={styles.queueTitle}>
                  {loading ? 'Loading…' : 'Available orders'}
                </Text>
                {!loading && (
                  <View style={styles.queueCount}>
                    <Text style={styles.queueCountText}>{pendingOrders.length}</Text>
                  </View>
                )}
              </View>
            )}

            {!isOnline && !activeOrder && (
              <View style={styles.offline}>
                <View style={styles.offlineTile}><View style={styles.offlineInner} /></View>
                <Text style={styles.offlineTitle}>Ready when you are</Text>
                <Text style={styles.offlineSub}>Go online to see available orders.</Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          isOnline && !activeOrder && !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No orders right now</Text>
              <Text style={styles.emptySub}>New orders show up here instantly, and you'll get a notification.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.orderCard}>
            {/* PAYOUT leads — it's what a dasher scans for */}
            <View style={styles.orderTop}>
              <View style={styles.orderPayout}>
                <Text style={styles.orderPayoutText}>{formatJMD(item.deliveryFee)}</Text>
                <Text style={styles.orderPayoutLabel}>Payout</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderStore} numberOfLines={1}>{item.storeName}</Text>
                <Text style={styles.orderDrop} numberOfLines={1}>→ {item.deliveryAddress.label}</Text>
              </View>
            </View>

            <View style={styles.orderMeta}>
              <Text style={styles.orderMetaText}>{item.items.length} items</Text>
              <View style={styles.orderMetaDot} />
              <Text style={styles.orderMetaText}>Order {formatJMD(item.totalAmount)}</Text>
              <View style={styles.orderMetaDot} />
              <Text style={styles.orderMetaText}>{minsAgo(item.verifiedAt ?? item.createdAt)}</Text>
            </View>

            <Pressable
              onPress={() => handleAccept(item)}
              style={({ pressed }) => [styles.acceptBtn, pressed && { transform: [{ scale: 0.97 }] }]}
            >
              <Text style={styles.acceptText}>Accept order</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.color.bg },

  canvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: -1 },
  blobCerulean: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: D.color.cerulean, opacity: 0.07,
    top: -100, right: -100,
  },
  blobTeal: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: D.color.teal, opacity: 0.06,
    top: 300, left: -110,
  },

  header: { paddingHorizontal: D.space.lg, paddingBottom: D.space.sm },
  eyebrow: { ...D.type.label, color: D.color.teal, marginBottom: 4 },
  greeting: { ...D.type.display, fontSize: 34, color: D.color.cream },

  // Online hero
  onlineCard: {
    flexDirection: 'row', alignItems: 'center', gap: D.space.md,
    backgroundColor: D.color.card,
    marginHorizontal: D.space.lg,
    marginBottom: D.space.md,
    borderRadius: D.radius.xl,
    padding: D.space.lg,
    borderWidth: 1.5, borderColor: D.color.line,
    overflow: 'hidden',
  },
  onlineCardActive: { borderColor: 'rgba(47, 196, 174, 0.45)' },
  onlineTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: D.color.teal },
  onlineDotOff: { backgroundColor: D.color.creamFaint, opacity: 1 },
  onlineTitle: { ...D.type.title, fontSize: 20, color: D.color.cream },
  onlineSub: { ...D.type.body, fontSize: 12, color: D.color.creamSoft, marginTop: 2 },

  // Today strip
  todayStrip: {
    flexDirection: 'row', gap: D.space.sm,
    paddingHorizontal: D.space.lg,
    marginBottom: D.space.md,
  },
  todayCard: {
    flex: 1,
    backgroundColor: D.color.card,
    borderRadius: D.radius.lg,
    padding: D.space.md,
    borderWidth: 1, borderColor: D.color.line,
    gap: 8,
  },
  todayLabel: { ...D.type.label, fontSize: 10, color: D.color.creamFaint },
  todayPlate: {
    alignSelf: 'flex-start',
    backgroundColor: D.color.tealTint,
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: D.radius.sm,
    borderWidth: 1.5, borderColor: D.color.teal,
  },
  todayValue: { fontSize: 20, fontWeight: '900', color: D.color.teal, letterSpacing: -0.4 },
  todayCount: { fontSize: 26, fontWeight: '900', color: D.color.cerulean, letterSpacing: -0.5 },

  // Active order
  activeCard: {
    backgroundColor: D.color.card,
    marginHorizontal: D.space.lg,
    marginBottom: D.space.md,
    borderRadius: D.radius.xl,
    padding: D.space.lg,
    borderWidth: 1.5, borderColor: 'rgba(51, 173, 209, 0.4)',
    gap: D.space.md,
    ...D.shadow.card,
  },
  activeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: D.color.ceruleanTint,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: D.radius.pill,
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: D.color.cerulean },
  activeBadgeText: { fontSize: 10, fontWeight: '900', color: D.color.cerulean, letterSpacing: 0.2 },
  activeStatus: { ...D.type.label, color: D.color.creamSoft },
  activeStore: { ...D.type.title, fontSize: 24, color: D.color.cream },

  routeRow: { gap: 4 },
  routeStop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { width: 2, height: 14, backgroundColor: D.color.lineStrong, marginLeft: 4 },
  routeText: { ...D.type.body, fontSize: 13, color: D.color.creamSoft, flex: 1, fontWeight: '600' },

  activeMeta: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    backgroundColor: D.color.cardHigh,
    borderRadius: D.radius.md,
    padding: D.space.md,
  },
  metaLabel: { ...D.type.label, fontSize: 9, color: D.color.creamFaint, marginBottom: 3 },
  metaValue: { ...D.type.body, fontSize: 14, fontWeight: '800', color: D.color.cream },
  payoutPlate: {
    backgroundColor: D.color.tealTint,
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1.5, borderColor: D.color.teal,
  },
  payoutText: { fontSize: 15, fontWeight: '900', color: D.color.teal, letterSpacing: -0.3 },

  noteBox: {
    backgroundColor: D.color.warningTint,
    borderRadius: D.radius.md,
    padding: D.space.sm,
    gap: 2,
  },
  noteLabel: { ...D.type.label, fontSize: 9, color: D.color.warning },
  noteText: { ...D.type.body, fontSize: 13, color: D.color.cream },

  mapWrap: {
    borderRadius: D.radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: D.color.line,
  },
  map: { height: 180, width: '100%' },
  noGpsBox: {
    backgroundColor: D.color.ceruleanTint,
    borderRadius: D.radius.md,
    padding: D.space.md,
    gap: 4,
    borderWidth: 1, borderColor: 'rgba(51, 173, 209, 0.3)',
  },
  noGpsLabel: { ...D.type.label, fontSize: 10, color: D.color.creamSoft },
  noGpsAddress: { ...D.type.body, fontSize: 15, fontWeight: '800', color: D.color.cerulean },

  statusBtn: {
    backgroundColor: D.color.cerulean,
    borderRadius: D.radius.pill,
    height: 54,
    justifyContent: 'center', alignItems: 'center',
    ...D.shadow.button,
  },
  statusBtnText: { color: D.color.bg, fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },

  // Queue
  queueHead: {
    flexDirection: 'row', alignItems: 'center', gap: D.space.sm,
    paddingHorizontal: D.space.lg,
    paddingTop: D.space.sm, paddingBottom: D.space.sm,
  },
  queueTitle: { ...D.type.title, fontSize: 20, color: D.color.cream },
  queueCount: {
    backgroundColor: D.color.tealTint,
    minWidth: 26, height: 26, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8,
  },
  queueCountText: { color: D.color.teal, fontSize: 13, fontWeight: '900' },

  orderCard: {
    backgroundColor: D.color.card,
    marginHorizontal: D.space.lg,
    marginBottom: D.space.sm,
    borderRadius: D.radius.lg,
    padding: D.space.md,
    borderWidth: 1, borderColor: D.color.line,
    gap: D.space.sm,
  },
  orderTop: { flexDirection: 'row', alignItems: 'center', gap: D.space.md },
  orderPayout: {
    backgroundColor: D.color.tealTint,
    borderRadius: D.radius.md,
    paddingHorizontal: 12, paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1.5, borderColor: D.color.teal,
    minWidth: 84,
  },
  orderPayoutText: { fontSize: 17, fontWeight: '900', color: D.color.teal, letterSpacing: -0.3 },
  orderPayoutLabel: { fontSize: 9, fontWeight: '700', color: D.color.creamFaint, letterSpacing: 0.8 },
  orderStore: { ...D.type.body, fontSize: 16, fontWeight: '800', color: D.color.cream },
  orderDrop: { ...D.type.body, fontSize: 12, color: D.color.creamSoft, marginTop: 2 },

  orderMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderMetaText: { fontSize: 11, color: D.color.creamFaint, fontWeight: '600' },
  orderMetaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: D.color.lineStrong },

  acceptBtn: {
    backgroundColor: D.color.cerulean,
    borderRadius: D.radius.pill,
    height: 46,
    justifyContent: 'center', alignItems: 'center',
  },
  acceptText: { color: D.color.bg, fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },

  // Offline / empty
  offline: { alignItems: 'center', paddingTop: 40, gap: D.space.sm, paddingHorizontal: D.space.xl },
  offlineTile: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: D.color.ceruleanTint,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: D.space.sm,
  },
  offlineInner: { width: 24, height: 24, borderRadius: 8, backgroundColor: D.color.cerulean, opacity: 0.5 },
  offlineTitle: { ...D.type.title, fontSize: 20, color: D.color.cream },
  offlineSub: { ...D.type.body, fontSize: 13, color: D.color.creamSoft, textAlign: 'center' },

  empty: { alignItems: 'center', paddingTop: 30, gap: 6, paddingHorizontal: D.space.xl },
  emptyTitle: { ...D.type.title, fontSize: 18, color: D.color.cream },
  emptySub: { ...D.type.body, fontSize: 13, color: D.color.creamSoft, textAlign: 'center' },
});
