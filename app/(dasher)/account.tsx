// app/(dasher)/account.tsx  (URL: /account)
// DormDash — Dasher profile (inverted Route identity). NEW SCREEN.
//
// What a dasher needs from a profile:
//   1. LIFETIME PROOF — total earnings, total deliveries, rating.
//     Read from dashers/{uid}; written ONLY by Cloud Functions, so these
//     numbers are tamper-proof — a dasher can screenshot them as a work
//     record.
//   2. RECENT WORK — a rolling 30-day history. Orders older than 30 days
//     (by acceptedAt) simply fall out of the query window. Nothing is
//     deleted — students and admin retain full history; the dasher's view
//     stays a clean month.
//   3. ACCOUNT — identity, member since, sign out.
//
// Data notes: single where('dasherId','==',uid) query, everything else
// filtered client-side — avoids composite-index requirements entirely.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';
import { logoutUser } from '../../services/auth';
import { Order } from '../../types';
import { formatJMD } from '../../constants';
import { D } from '../../constants/themeDark';
import { AccountActions } from '../../components/AccountActions';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface DasherStats {
  rating: number;
  totalDeliveries: number;
  totalEarnings: number;
}

const formatDate = (ts: number) => {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export default function DasherProfile() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [stats, setStats] = useState<DasherStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // Lifetime stats — live from the dashers doc (server-written only)
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'dashers', user.uid), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setStats({
          rating: Number(d.rating) || 0,
          totalDeliveries: Number(d.totalDeliveries) || 0,
          totalEarnings: Number(d.totalEarnings) || 0,
        });
      }
    });
    return unsub;
  }, [user]);

  // Rolling 30-day history — client-side window on acceptedAt
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'orders'), where('dasherId', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const cutoff = Date.now() - THIRTY_DAYS_MS;
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Order))
        .filter(o =>
          (o.status === 'delivered' || o.status === 'cancelled')
          && (o.acceptedAt ?? o.createdAt) >= cutoff
        )
        .sort((a, b) => (b.acceptedAt ?? b.createdAt) - (a.acceptedAt ?? a.createdAt));
      setRecentOrders(docs);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const handleLogout = () => {
    Alert.alert('Sign out', 'You will go offline and be signed out.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => { setLoggingOut(true); await logoutUser(); },
      },
    ]);
  };

  const getInitials = () => {
    if (!user?.name) return 'D';
    return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const monthEarnings = recentOrders
    .filter(o => o.status === 'delivered')
    .reduce((s, o) => s + (Number(o.deliveryFee) || 0), 0);

  return (
    <View style={styles.root}>
      <FlatList
        data={recentOrders}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + D.space.md }]}>
              <Text style={styles.title}>Profile</Text>
            </View>

            {/* Identity */}
            <View style={styles.identity}>
              <View style={styles.avatarWrap}>
                <View style={styles.avatarRing} />
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials()}</Text>
                </View>
              </View>
              <Text style={styles.name}>{user?.name ?? 'Dasher'}</Text>
              <View style={styles.roleBadge}>
                <View style={styles.roleDot} />
                <Text style={styles.roleText}>Dasher</Text>
              </View>
            </View>

            {/* Lifetime stats — the work record */}
            <Text style={styles.sectionLabel}>Lifetime</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <View style={styles.statPlate}>
                  <Text style={styles.statPlateText}>
                    {stats ? formatJMD(stats.totalEarnings) : '—'}
                  </Text>
                </View>
                <Text style={styles.statLabel}>Total earned</Text>
              </View>
              <View style={[styles.statCard, styles.statDivided]}>
                <Text style={styles.statBig}>{stats?.totalDeliveries ?? '—'}</Text>
                <Text style={styles.statLabel}>Deliveries</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statBig}>
                  {stats && stats.rating > 0 ? `★ ${stats.rating.toFixed(1)}` : 'New'}
                </Text>
                <Text style={styles.statLabel}>Rating</Text>
              </View>
            </View>

            {/* This month summary */}
            <View style={styles.monthCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.monthLabel}>Last 30 days</Text>
                <Text style={styles.monthSub}>
                  {recentOrders.filter(o => o.status === 'delivered').length} deliveries
                </Text>
              </View>
              <View style={styles.monthPlate}>
                <Text style={styles.monthValue}>{formatJMD(monthEarnings)}</Text>
              </View>
            </View>

            {/* History header */}
            <View style={styles.historyHead}>
              <Text style={styles.sectionLabel}>Recent orders</Text>
              <Text style={styles.historyNote}>Showing the last 30 days</Text>
            </View>

            {loading && (
              <View style={styles.loading}>
                <ActivityIndicator color={D.color.cerulean} />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No orders this month</Text>
              <Text style={styles.emptySub}>Deliveries you complete will show here for 30 days.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const delivered = item.status === 'delivered';
          return (
            <View style={styles.orderRow}>
              <View style={[styles.orderIcon, !delivered && styles.orderIconCancelled]}>
                <Text style={[styles.orderIconText, !delivered && { color: D.color.danger }]}>
                  {delivered ? '✓' : '×'}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.orderStore} numberOfLines={1}>{item.storeName}</Text>
                <Text style={styles.orderMeta}>
                  {formatDate(item.acceptedAt ?? item.createdAt)} · {item.items.length} items · to {item.deliveryAddress.label}
                </Text>
              </View>
              {delivered ? (
                <View style={styles.orderPayPlate}>
                  <Text style={styles.orderPayText}>+{formatJMD(item.deliveryFee)}</Text>
                </View>
              ) : (
                <Text style={styles.orderCancelled}>Cancelled</Text>
              )}
            </View>
          );
        }}
        ListFooterComponent={
          <>
            {/* Account */}
            <Text style={[styles.sectionLabel, { marginTop: D.space.lg }]}>Account</Text>
            <View style={styles.accountCard}>
              <View style={styles.accountRow}>
                <Text style={styles.accountLabel}>Email</Text>
                <Text style={styles.accountValue}>{user?.email ?? '—'}</Text>
              </View>
              <View style={styles.accountDivider} />
              <View style={styles.accountRow}>
                <Text style={styles.accountLabel}>Phone</Text>
                <Text style={styles.accountValue}>{user?.phone ?? '—'}</Text>
              </View>
              <View style={styles.accountDivider} />
              <View style={styles.accountRow}>
                <Text style={styles.accountLabel}>University</Text>
                <Text style={styles.accountValue}>{user?.university ?? '—'}</Text>
              </View>
            </View>

            {/* Deactivate / delete — required by Google Play for apps with accounts */}
            <AccountActions dark />

            <Pressable
              onPress={handleLogout}
              disabled={loggingOut}
              style={({ pressed }) => [
                styles.signOut,
                pressed && { transform: [{ scale: 0.98 }] },
                loggingOut && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.signOutText}>
                {loggingOut ? 'Signing out…' : 'Sign out'}
              </Text>
            </Pressable>
          </>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: D.color.bg },

  canvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: -1 },
  blobCerulean: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: D.color.cerulean, opacity: 0.07,
    top: -90, right: -100,
  },
  blobTeal: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: D.color.teal, opacity: 0.06,
    top: 300, left: -110,
  },

  header: { paddingHorizontal: D.space.lg, paddingBottom: D.space.md },
  eyebrow: { ...D.type.label, color: D.color.teal, marginBottom: 4 },
  title: { ...D.type.display, fontSize: 34, color: D.color.cream },

  // Identity
  identity: { alignItems: 'center', marginBottom: D.space.lg },
  avatarWrap: { position: 'relative', marginBottom: D.space.sm },
  avatarRing: {
    position: 'absolute',
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2, borderColor: D.color.teal,
    top: -6, left: -6, opacity: 0.4,
  },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: D.color.tealTint,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: D.color.teal,
  },
  avatarText: { fontSize: 34, fontWeight: '900', color: D.color.teal, letterSpacing: -1 },
  name: { ...D.type.title, fontSize: 22, color: D.color.cream, marginTop: D.space.sm },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: D.space.sm,
    backgroundColor: D.color.tealTint,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: D.radius.pill,
  },
  roleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: D.color.teal },
  roleText: { fontSize: 11, fontWeight: '800', color: D.color.teal, letterSpacing: 0.8 },

  sectionLabel: {
    ...D.type.label, color: D.color.teal,
    paddingHorizontal: D.space.lg,
    paddingBottom: D.space.sm,
  },

  // Stats
  // One summary strip with dividers instead of three separate boxes.
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: D.space.lg,
    marginBottom: D.space.md,
    backgroundColor: D.color.card,
    borderRadius: D.radius.md,
    borderWidth: 1, borderColor: D.color.line,
    paddingVertical: D.space.md,
  },
  statCard: {
    flex: 1,
    paddingHorizontal: D.space.sm,
    alignItems: 'center',
    gap: 8,
  },
  statDivided: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: D.color.line },
  statPlate: {
    backgroundColor: D.color.tealTint,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1.5, borderColor: D.color.teal,
  },
  statPlateText: { fontSize: 13, fontWeight: '900', color: D.color.teal, letterSpacing: -0.3 },
  statBig: { fontSize: 20, fontWeight: '900', color: D.color.cerulean, letterSpacing: -0.4 },
  statLabel: { ...D.type.label, fontSize: 9, color: D.color.creamFaint },

  // Month card
  monthCard: {
    flexDirection: 'row', alignItems: 'center', gap: D.space.md,
    backgroundColor: D.color.card,
    marginHorizontal: D.space.lg,
    marginBottom: D.space.lg,
    borderRadius: D.radius.lg,
    padding: D.space.md,
    borderWidth: 1.5, borderColor: 'rgba(47, 196, 174, 0.35)',
  },
  monthLabel: { ...D.type.body, fontSize: 15, fontWeight: '800', color: D.color.cream },
  monthSub: { ...D.type.body, fontSize: 12, color: D.color.creamSoft, marginTop: 2 },
  monthPlate: {
    backgroundColor: D.color.tealTint,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: D.radius.md,
    borderWidth: 1.5, borderColor: D.color.teal,
  },
  monthValue: { fontSize: 18, fontWeight: '900', color: D.color.teal, letterSpacing: -0.4 },

  historyHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    paddingRight: D.space.lg,
  },
  historyNote: { fontSize: 10, color: D.color.creamFaint, fontWeight: '600' },

  loading: { paddingVertical: D.space.lg, alignItems: 'center' },

  // Order rows
  orderRow: {
    flexDirection: 'row', alignItems: 'center', gap: D.space.md,
    backgroundColor: D.color.card,
    marginHorizontal: D.space.lg,
    marginBottom: D.space.sm,
    borderRadius: D.radius.lg,
    padding: D.space.md,
    borderWidth: 1, borderColor: D.color.line,
  },
  orderIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: D.color.tealTint,
    justifyContent: 'center', alignItems: 'center',
  },
  orderIconCancelled: { backgroundColor: D.color.dangerTint },
  orderIconText: { fontSize: 17, fontWeight: '900', color: D.color.teal },
  orderStore: { ...D.type.body, fontSize: 14, fontWeight: '800', color: D.color.cream },
  orderMeta: { fontSize: 11, color: D.color.creamFaint, fontWeight: '600' },
  orderPayPlate: {
    backgroundColor: D.color.tealTint,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1, borderColor: D.color.teal,
  },
  orderPayText: { fontSize: 13, fontWeight: '900', color: D.color.teal },
  orderCancelled: { fontSize: 11, fontWeight: '800', color: D.color.danger },

  // Account
  accountCard: {
    backgroundColor: D.color.card,
    marginHorizontal: D.space.lg,
    borderRadius: D.radius.lg,
    borderWidth: 1, borderColor: D.color.line,
    overflow: 'hidden',
  },
  accountRow: {
    paddingHorizontal: D.space.md, paddingVertical: D.space.md, gap: 3,
  },
  accountLabel: { ...D.type.label, fontSize: 10, color: D.color.creamFaint },
  accountValue: { ...D.type.body, fontSize: 14, fontWeight: '700', color: D.color.cream },
  accountDivider: { height: 1, backgroundColor: D.color.line, marginHorizontal: D.space.md },

  signOut: {
    marginHorizontal: D.space.lg,
    marginTop: D.space.xl,
    backgroundColor: D.color.dangerTint,
    borderRadius: D.radius.pill,
    height: 52,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(227, 107, 107, 0.3)',
  },
  signOutText: { color: D.color.danger, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  empty: { alignItems: 'center', paddingVertical: D.space.lg, gap: 6, paddingHorizontal: D.space.xl },
  emptyTitle: { ...D.type.title, fontSize: 17, color: D.color.cream },
  emptySub: { ...D.type.body, fontSize: 12, color: D.color.creamSoft, textAlign: 'center' },
});
