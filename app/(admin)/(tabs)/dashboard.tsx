// app/(admin)/(tabs)/dashboard.tsx
// DormDash — Admin dashboard (mid-tone "slate" Route identity).
// FUNCTIONALITY PRESERVED: same three live listeners (users, orders, stores),
// same stats math (revenue = delivered fees, GMV, avg delivery mins,
// completion rate). Currency now formatJMD. One improvement: the quick
// actions actually navigate now (they were dead TouchableOpacities).

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { useAuth } from '../../../hooks/useAuth';
import { logoutUser } from '../../../services/auth';
import { formatJMD } from '../../../constants';
import { S } from '../../../constants/themeMid';

export default function AdminDashboard() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState({
    totalUsers: 0, totalStudents: 0, totalDashers: 0,
    totalOrders: 0, pendingOrders: 0, activeOrders: 0,
    deliveredOrders: 0, cancelledOrders: 0,
    revenue: 0, gmv: 0, avgDeliveryMins: 0,
    ordersToday: 0, ordersThisWeek: 0,
    totalStores: 0, activeStores: 0,
  });

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const users = snap.docs.map(d => d.data());
      setStats(prev => ({
        ...prev,
        totalUsers: users.length,
        totalStudents: users.filter(u => u.role === 'student').length,
        totalDashers: users.filter(u => u.role === 'dasher').length,
      }));
    });

    const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
      const orders = snap.docs.map(d => d.data());
      const delivered = orders.filter(o => o.status === 'delivered');
      const now = Date.now();
      const dayStart = new Date().setHours(0, 0, 0, 0);
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

      const revenue = delivered.reduce((sum, o) => sum + (Number(o.deliveryFee) || 0), 0);
      const gmv = delivered.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

      const withTimes = delivered.filter(o => o.deliveredAt && o.createdAt);
      const avgDeliveryMins = withTimes.length > 0
        ? Math.round(withTimes.reduce((sum, o) => sum + (o.deliveredAt - o.createdAt), 0) / withTimes.length / 60000)
        : 0;

      setStats(prev => ({
        ...prev,
        totalOrders: orders.length,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        activeOrders: orders.filter(o => ['accepted', 'picking_up', 'on_the_way'].includes(o.status)).length,
        deliveredOrders: delivered.length,
        cancelledOrders: orders.filter(o => o.status === 'cancelled').length,
        revenue, gmv, avgDeliveryMins,
        ordersToday: orders.filter(o => o.createdAt >= dayStart).length,
        ordersThisWeek: orders.filter(o => o.createdAt >= weekAgo).length,
      }));
    });

    const unsubStores = onSnapshot(collection(db, 'stores'), (snap) => {
      const stores = snap.docs.map(d => d.data());
      setStats(prev => ({
        ...prev,
        totalStores: stores.length,
        activeStores: stores.filter(s => s.isOpen).length,
      }));
    });

    return () => { unsubUsers(); unsubOrders(); unsubStores(); };
  }, []);

  const handleLogout = async () => { await logoutUser(); };

  const finishedOrders = stats.deliveredOrders + stats.cancelledOrders;
  const completionRate = finishedOrders > 0
    ? Math.round((stats.deliveredOrders / finishedOrders) * 100)
    : 0;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + S.space.md, paddingBottom: 120 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Control room</Text>
            <Text style={styles.name}>{user?.name?.split(' ')[0] || 'Admin'}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutText}>Exit</Text>
          </TouchableOpacity>
        </View>

        {/* Live bar */}
        <View style={styles.liveBar}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live · real-time updates</Text>
        </View>

        {/* Hero cards */}
        <View style={styles.heroGrid}>
          <View style={styles.heroCard}>
            <Text style={styles.cardNumber}>01</Text>
            <Text style={styles.heroValue}>{stats.totalOrders}</Text>
            <Text style={styles.cardLabel}>total orders</Text>
            <View style={styles.heroTrend}>
              <Text style={styles.heroTrendText}>{stats.ordersToday} today · {stats.ordersThisWeek} this week</Text>
            </View>
          </View>
          <View style={styles.heroCard}>
            <Text style={styles.cardNumber}>02</Text>
            <View style={styles.moneyPlate}>
              <Text style={styles.moneyText}>{formatJMD(stats.revenue)}</Text>
            </View>
            <Text style={styles.cardLabel}>delivery revenue</Text>
            <View style={styles.heroTrend}>
              <Text style={styles.heroTrendText}>{formatJMD(stats.gmv)} GMV</Text>
            </View>
          </View>
        </View>

        {/* Metrics grid */}
        <Text style={styles.sectionTitle}>metrics</Text>
        <View style={styles.grid}>
          <View style={styles.statCard}>
            <Text style={styles.cardNumber}>03</Text>
            <Text style={styles.statValue}>{stats.totalUsers}</Text>
            <Text style={styles.cardLabel}>total users</Text>
            <Text style={styles.statDetail}>{stats.totalStudents} students · {stats.totalDashers} dashers</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.cardNumber}>04</Text>
            <Text style={styles.statValue}>{stats.activeOrders}</Text>
            <Text style={styles.cardLabel}>active now</Text>
            <Text style={styles.statDetail}>{stats.pendingOrders} pending</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.cardNumber}>05</Text>
            <Text style={styles.statValue}>{stats.totalStores}</Text>
            <Text style={styles.cardLabel}>stores</Text>
            <Text style={styles.statDetail}>{stats.activeStores} open now</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.cardNumber}>06</Text>
            <Text style={styles.statValue}>{completionRate}%</Text>
            <Text style={styles.cardLabel}>completion</Text>
            <Text style={styles.statDetail}>{stats.cancelledOrders} cancelled</Text>
          </View>
        </View>

        {/* Platform health */}
        <Text style={styles.sectionTitle}>platform health</Text>
        <View style={styles.healthCard}>
          <View style={styles.healthHead}>
            <Text style={styles.cardLabel}>order fulfilment</Text>
            <Text style={styles.cardNumber}>07</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${completionRate}%` }]} />
          </View>
          <View style={styles.healthStats}>
            <View>
              <Text style={styles.healthLabel}>completed</Text>
              <Text style={styles.healthValue}>{stats.deliveredOrders}</Text>
            </View>
            <View>
              <Text style={styles.healthLabel}>pending</Text>
              <Text style={styles.healthValue}>{stats.pendingOrders}</Text>
            </View>
            <View>
              <Text style={styles.healthLabel}>avg time</Text>
              <Text style={styles.healthValue}>{stats.avgDeliveryMins > 0 ? `${stats.avgDeliveryMins}m` : '—'}</Text>
            </View>
          </View>
        </View>

        {/* Quick actions — now actually navigate */}
        <Text style={styles.sectionTitle}>quick actions</Text>
        <Pressable
          style={({ pressed }) => [styles.actionRow, pressed && { transform: [{ scale: 0.99 }] }]}
          onPress={() => router.push('/(admin)/(tabs)/stores' as any)}
        >
          <View style={styles.actionNumber}><Text style={styles.actionNumberText}>08</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Manage stores</Text>
            <Text style={styles.actionDesc}>Add, edit, or remove stores</Text>
          </View>
          <Text style={styles.actionArrow}>→</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionRow, pressed && { transform: [{ scale: 0.99 }] }]}
          onPress={() => router.push('/(admin)/(tabs)/users' as any)}
        >
          <View style={styles.actionNumber}><Text style={styles.actionNumberText}>09</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Manage users</Text>
            <Text style={styles.actionDesc}>Student and dasher accounts</Text>
          </View>
          <Text style={styles.actionArrow}>→</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: S.color.bg },
  scroll: { paddingHorizontal: S.space.lg },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: S.space.md },
  eyebrow: { ...S.type.label, color: S.color.tealBright, marginBottom: 4 },
  name: { ...S.type.display, color: S.color.cream },
  logoutBtn: {
    paddingHorizontal: S.space.md, paddingVertical: 8,
    borderRadius: S.radius.pill,
    borderWidth: 1, borderColor: S.color.lineOnBgStrong,
  },
  logoutText: { color: S.color.creamSoft, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },

  liveBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: S.space.md,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: S.color.tealBright },
  liveText: { color: S.color.creamFaint, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },

  // Cards
  heroGrid: { flexDirection: 'row', gap: S.space.sm, marginBottom: S.space.md },
  heroCard: {
    flex: 1, backgroundColor: S.color.card, borderRadius: S.radius.lg,
    padding: S.space.md, gap: 6, ...S.shadow.card,
  },
  cardNumber: { ...S.type.number, color: S.color.teal },
  heroValue: { fontSize: 30, fontWeight: '900', color: S.color.ink, letterSpacing: -0.8 },
  cardLabel: { ...S.type.label, color: S.color.inkSoft },
  heroTrend: {
    backgroundColor: S.color.cardMuted, borderRadius: S.radius.sm,
    paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start',
  },
  heroTrendText: { fontSize: 10, fontWeight: '700', color: S.color.inkSoft },

  moneyPlate: {
    alignSelf: 'flex-start',
    backgroundColor: S.color.ceruleanTint,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: S.radius.sm,
    borderWidth: 1.5, borderColor: S.color.cerulean,
  },
  moneyText: { fontSize: 20, fontWeight: '900', color: S.color.cerulean, letterSpacing: -0.5 },

  sectionTitle: { ...S.type.label, color: S.color.creamSoft, marginTop: S.space.md, marginBottom: S.space.sm },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.space.sm },
  statCard: {
    width: '48%', flexGrow: 1,
    backgroundColor: S.color.card, borderRadius: S.radius.lg,
    padding: S.space.md, gap: 4, ...S.shadow.card,
  },
  statValue: { fontSize: 24, fontWeight: '900', color: S.color.ink, letterSpacing: -0.6 },
  statDetail: { fontSize: 10, fontWeight: '600', color: S.color.inkFaint },

  healthCard: {
    backgroundColor: S.color.card, borderRadius: S.radius.lg,
    padding: S.space.md, gap: S.space.sm, ...S.shadow.card,
  },
  healthHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressBar: { height: 8, borderRadius: 4, backgroundColor: S.color.cardMuted, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: S.color.teal },
  healthStats: { flexDirection: 'row', justifyContent: 'space-between' },
  healthLabel: { ...S.type.label, fontSize: 9, color: S.color.inkFaint },
  healthValue: { fontSize: 16, fontWeight: '900', color: S.color.ink, marginTop: 2 },

  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: S.space.md,
    backgroundColor: S.color.card, borderRadius: S.radius.lg,
    padding: S.space.md, marginBottom: S.space.sm, ...S.shadow.card,
  },
  actionNumber: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: S.color.tealTint,
    justifyContent: 'center', alignItems: 'center',
  },
  actionNumberText: { ...S.type.number, color: S.color.teal },
  actionTitle: { fontSize: 15, fontWeight: '800', color: S.color.ink },
  actionDesc: { fontSize: 11, fontWeight: '600', color: S.color.inkFaint, marginTop: 2 },
  actionArrow: { fontSize: 18, fontWeight: '800', color: S.color.cerulean },
});
