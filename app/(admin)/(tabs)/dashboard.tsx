// app/(admin)/(tabs)/dashboard.tsx
// Live stats: total users, orders, revenue, active dashers.
// Clean admin dashboard matching the numbered aesthetic.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { useAuth } from '../../../hooks/useAuth';
import { logoutUser } from '../../../services/auth';
import { SPACING, formatJMD } from '../../../constants';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalStudents: 0,
    totalDashers: 0,
    totalOrders: 0,
    pendingOrders: 0,
    activeOrders: 0,
    deliveredOrders: 0,
    cancelledOrders: 0,
    revenue: 0,
    gmv: 0,
    avgDeliveryMins: 0,
    ordersToday: 0,
    ordersThisWeek: 0,
    totalStores: 0,
    activeStores: 0,
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
    
      // Real money: fees earned on completed deliveries
      const revenue = delivered.reduce((sum, o) => sum + (Number(o.deliveryFee) || 0), 0);
      // GMV: total order value flowing through the platform (investors love this)
      const gmv = delivered.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    
      // Real average delivery time, from placed to delivered
      const withTimes = delivered.filter(o => o.deliveredAt && o.createdAt);
      const avgDeliveryMins = withTimes.length > 0
        ? Math.round(
            withTimes.reduce((sum, o) => sum + (o.deliveredAt - o.createdAt), 0) /
            withTimes.length / 60000
          )
        : 0;
    
      setStats(prev => ({
        ...prev,
        totalOrders: orders.length,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        activeOrders: orders.filter(o =>
          ['accepted', 'picking_up', 'on_the_way'].includes(o.status)).length,
        deliveredOrders: delivered.length,
        cancelledOrders: orders.filter(o => o.status === 'cancelled').length,
        revenue,
        gmv,
        avgDeliveryMins,
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
    <SafeAreaView style={styles.safe}>
      <ScrollView 
        contentContainerStyle={styles.scroll} 
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.nameText}>{user?.name?.split(' ')[0] || 'Admin'}</Text>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Exit</Text>
          </TouchableOpacity>
        </View>

        {/* Live Status */}
        <View style={styles.liveBar}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live · Real-time updates</Text>
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>active</Text>
          </View>
        </View>

        {/* Hero Stats */}
        <View style={styles.heroGrid}>
  <View style={[styles.heroCard, { backgroundColor: '#1A1A1A' }]}>
    <Text style={styles.heroNumber}>01</Text>
    <Text style={styles.heroValue}>{stats.totalOrders}</Text>
    <Text style={styles.heroLabel}>total orders</Text>
    <View style={styles.heroTrend}>
      <Text style={styles.heroTrendText}>{stats.ordersToday} today</Text>
    </View>
  </View>
  <View style={[styles.heroCard, { backgroundColor: '#1A1A1A' }]}>
    <Text style={styles.heroNumber}>02</Text>
    <Text style={styles.heroValue}>{formatJMD(stats.revenue)}</Text>
    <Text style={styles.heroLabel}>delivery revenue</Text>
    <View style={styles.heroTrend}>
      <Text style={styles.heroTrendText}>{formatJMD(stats.gmv)} GMV</Text>
    </View>
  </View>
</View>

        {/* Stats Grid */}
        <Text style={styles.sectionTitle}>metrics</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.statNumber}>03</Text>
            </View>
            <Text style={styles.statValue}>{stats.totalUsers}</Text>
            <Text style={styles.statLabel}>total users</Text>
            <View style={styles.statDetail}>
              <Text style={styles.statDetailText}>{stats.totalStudents} students</Text>
              <Text style={styles.statDetailDot}>·</Text>
              <Text style={styles.statDetailText}>{stats.totalDashers} dashers</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.statNumber}>04</Text>
            </View>
            <Text style={styles.statValue}>{stats.totalOrders}</Text>
            <Text style={styles.statLabel}>total orders</Text>
            <View style={styles.statDetail}>
              <Text style={styles.statDetailText}>{stats.pendingOrders} pending</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.statNumber}>05</Text>
            </View>
            <Text style={styles.statValue}>{stats.totalStores}</Text>
            <Text style={styles.statLabel}>total stores</Text>
            <View style={styles.statDetail}>
              <Text style={styles.statDetailText}>{stats.activeStores} open now</Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.statNumber}>06</Text>
            </View>
            <Text style={styles.statValue}>{completionRate}%</Text>
            <Text style={styles.statLabel}>completion rate</Text>
            <View style={styles.statDetail}>
              <Text style={styles.statDetailText}>delivery rate</Text>
            </View>
          </View>
        </View>

        {/* Platform Health */}
        <Text style={styles.sectionTitle}>platform health</Text>
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>order fulfillment</Text>
            <Text style={styles.progressNumber}>07</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${completionRate}%` }]} />
          </View>
          <View style={styles.progressStats}>
            <View>
              <Text style={styles.progressStatLabel}>completed</Text>
              <Text style={styles.progressStatValue}>{stats.deliveredOrders}</Text>
            </View>
            <View>
              <Text style={styles.progressStatLabel}>pending</Text>
              <Text style={styles.progressStatValue}>{stats.pendingOrders}</Text>
            </View>
            <View>
              <Text style={styles.progressStatLabel}>avg time</Text>
              <Text style={styles.progressStatValue}>
                {stats.avgDeliveryMins > 0 ? `${stats.avgDeliveryMins}m` : '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>quick actions</Text>
        
        <TouchableOpacity style={styles.actionRow}>
          <View style={styles.actionNumber}>
            <Text style={styles.actionNumberText}>08</Text>
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Manage Stores</Text>
            <Text style={styles.actionDescription}>Add, edit, or remove stores</Text>
          </View>
          <Text style={styles.actionArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionRow}>
          <View style={styles.actionNumber}>
            <Text style={styles.actionNumberText}>09</Text>
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Manage Users</Text>
            <Text style={styles.actionDescription}>View student and dasher accounts</Text>
          </View>
          <Text style={styles.actionArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionRow}>
          <View style={styles.actionNumber}>
            <Text style={styles.actionNumberText}>10</Text>
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Order Management</Text>
            <Text style={styles.actionDescription}>Track and manage all deliveries</Text>
          </View>
          <Text style={styles.actionArrow}>→</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },

  scroll: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
    paddingTop: SPACING.md,
  },
  welcomeText: {
    fontSize: 13,
    color: '#666666',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  nameText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  logoutText: {
    color: '#FF4444',
    fontSize: 13,
    fontWeight: '500',
  },

  // Live Bar
  liveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 10,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00FF88',
  },
  liveText: {
    fontSize: 12,
    color: '#888888',
    fontWeight: '500',
    flex: 1,
  },
  liveBadge: {
    backgroundColor: '#00FF8822',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveBadgeText: {
    fontSize: 10,
    color: '#00FF88',
    fontWeight: '600',
    textTransform: 'uppercase',
  },

  // Hero Stats
  heroGrid: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: SPACING.xl,
  },
  heroCard: {
    flex: 1,
    borderRadius: 12,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  heroNumber: {
    fontSize: 11,
    fontWeight: '500',
    color: '#3B82F6',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  heroValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroLabel: {
    fontSize: 11,
    color: '#666666',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  heroTrend: {
    backgroundColor: '#00FF8822',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  heroTrendText: {
    fontSize: 10,
    color: '#00FF88',
    fontWeight: '600',
  },

  // Section Title
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666666',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: SPACING.xl,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  statHeader: {
    marginBottom: 12,
  },
  statNumber: {
    fontSize: 10,
    fontWeight: '500',
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    color: '#666666',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statDetail: {
    flexDirection: 'row',
    gap: 6,
  },
  statDetailText: {
    fontSize: 10,
    color: '#888888',
  },
  statDetailDot: {
    fontSize: 10,
    color: '#444444',
  },

  // Progress Card
  progressCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: SPACING.xl,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  progressLabel: {
    fontSize: 11,
    color: '#888888',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressNumber: {
    fontSize: 10,
    fontWeight: '500',
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#2A2A2A',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#3B82F6',
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  progressStatLabel: {
    fontSize: 10,
    color: '#666666',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  progressStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Action Rows
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 14,
  },
  actionNumber: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionNumberText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 11,
    color: '#666666',
  },
  actionArrow: {
    fontSize: 16,
    color: '#444444',
    fontWeight: '400',
  },
});