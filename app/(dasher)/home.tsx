// app/(dasher)/home.tsx
// Dasher dashboard with professional liquid glassmorphism design.
// Clean, university-friendly aesthetics with navy/gold palette.

import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Switch, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  collection, query, where, onSnapshot,
  updateDoc, doc, orderBy,
} from 'firebase/firestore';
import * as Location from 'expo-location';
import { db } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';
import { logoutUser } from '../../services/auth';
import { Order, OrderStatus } from '../../types';
import { COLORS, SPACING, RADIUS, LOCATION_UPDATE_INTERVAL_MS, formatJMD } from '../../constants';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  accepted:   'picking_up',
  picking_up: 'on_the_way',
  on_the_way: 'delivered',
};

const NEXT_STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  accepted:   "Mark as Picked Up",
  picking_up: "Mark as On The Way",
  on_the_way: "Mark as Delivered",
};

export default function DasherHome() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [isOnline, setIsOnline] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const startLocationTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location Required', 'DormDash needs your location to connect you with orders.');
      return false;
    }

    const update = async () => {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setLocation(coords);

      if (user) {
        // lastSeenAt is the heartbeat — the Cloud Function treats dashers
        // silent for 10+ minutes as offline (dead phone with toggle stuck on).
        await updateDoc(doc(db, 'dashers', user.uid), {
          currentLocation: coords,
          isOnline: true,
          lastSeenAt: Date.now(),
        });
      }
    };

    await update();
    locationInterval.current = setInterval(update, LOCATION_UPDATE_INTERVAL_MS);
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
        currentLocation: null,
        lastSeenAt: Date.now(),
      });
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

  useEffect(() => () => { stopLocationTracking(); }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setPendingOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
      setLoading(false);
    });
    return unsub;
  }, []);

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

  const handleAccept = async (order: Order) => {
    if (!user) return;
    if (activeOrder) {
      Alert.alert('Active Order', 'Finish your current delivery before accepting a new one.');
      return;
    }
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        dasherId: user.uid,
        dasherName: user.name,
        status: 'accepted',
        acceptedAt: Date.now(),
      });
    } catch (e) {
      // Rules denied it — another dasher claimed it first
      Alert.alert('Too Slow!', 'Another dasher just took this order.');
    }
  };

  const handleStatusUpdate = async () => {
    if (!activeOrder) return;
    const next = NEXT_STATUS[activeOrder.status];
    if (!next) return;

    const update: any = { status: next };
    if (next === 'delivered') {
      update.deliveredAt = Date.now();
    }
    try {
      await updateDoc(doc(db, 'orders', activeOrder.id), update);
    } catch (e) {
      Alert.alert('Update Failed', 'Could not update the order status. Check your connection and try again.');
    }
  };

  const handleLogout = async () => {
    stopLocationTracking();
    await logoutUser();
  };

  // Get status display text
  const getStatusDisplay = (status: OrderStatus) => {
    const statusMap: Record<OrderStatus, string> = {
      pending: 'Pending',
      accepted: 'Accepted',
      picking_up: 'Picking Up',
      on_the_way: 'On The Way',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
    };
    return statusMap[status] || status;
  };

  // Get status color
  const getStatusColor = (status: OrderStatus) => {
    const colorMap: Record<OrderStatus, string> = {
      pending: '#8892A4',
      accepted: '#3B82F6',
      picking_up: '#F5C842',
      on_the_way: '#0EA5E9',
      delivered: '#00D9A3',
      cancelled: '#FF4757',
    };
    return colorMap[status] || '#8892A4';
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Subtle wave background */}
      <View style={styles.waveDecoration} pointerEvents="none">
        <View style={styles.waveCircle1} />
        <View style={styles.waveCircle2} />
        <View style={styles.waveBlur1} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.dasherBadge}>DASHER</Text>
          <Text style={styles.title}>Welcome back, {user?.name?.split(' ')[0] || 'Dasher'}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.onlineToggle}>
            <Text style={[styles.onlineLabel, isOnline && styles.onlineLabelActive]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
            <Switch
              value={isOnline}
              onValueChange={handleToggleOnline}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#F5C84260' }}
              thumbColor={isOnline ? '#F5C842' : '#8892A4'}
            />
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={isOnline && !activeOrder ? pendingOrders : []}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Active Order Card */}
            {activeOrder && (
              <View style={styles.activeCard}>
                <View style={styles.activeHeader}>
                  <Text style={styles.activeTitle}>Active Delivery</Text>
                  <View style={[styles.activeBadge, { backgroundColor: getStatusColor(activeOrder.status) + '18' }]}>
                    <Text style={[styles.activeBadgeText, { color: getStatusColor(activeOrder.status) }]}>
                      {getStatusDisplay(activeOrder.status)}
                    </Text>
                  </View>
                </View>

                <View style={styles.activeStoreContainer}>
                  <Text style={styles.activeStore}>{activeOrder.storeName}</Text>
                </View>

                <View style={styles.activeDetails}>
                  <Text style={styles.activeStudent}>{activeOrder.studentName}</Text>
                  <Text style={styles.activeAddress}>{activeOrder.deliveryAddress.label}</Text>
                </View>

                <View style={styles.activeMeta}>
                  <Text style={styles.activeItems}>{activeOrder.items.length} items</Text>
                  <Text style={styles.activeAmount}>{formatJMD(activeOrder.totalAmount)}</Text>
                </View>

                {/* Map — only when we have a real GPS fix, otherwise the pin lies */}
                {activeOrder.deliveryAddress.hasGpsFix ? (
                  <View style={styles.mapContainer}>
                    <MapView
                      style={styles.activeMap}
                      provider={PROVIDER_GOOGLE}
                      initialRegion={{
                        latitude: activeOrder.deliveryAddress.latitude,
                        longitude: activeOrder.deliveryAddress.longitude,
                        latitudeDelta: 0.015,
                        longitudeDelta: 0.015,
                      }}
                    >
                      <Marker
                        coordinate={activeOrder.deliveryAddress}
                        title="Drop-off"
                        pinColor="#F5C842"
                      />
                      {location && (
                        <Marker
                          coordinate={location}
                          title="Your Location"
                          pinColor="#3B82F6"
                        />
                      )}
                    </MapView>
                  </View>
                ) : (
                  <View style={styles.noGpsBox}>
                    <Text style={styles.noGpsText}>📍 No GPS pin — deliver to:</Text>
                    <Text style={styles.noGpsAddress}>{activeOrder.deliveryAddress.label}</Text>
                  </View>
                )}

                {/* Status update button */}
                {NEXT_STATUS[activeOrder.status] && (
                  <TouchableOpacity style={styles.statusBtn} onPress={handleStatusUpdate}>
                    <Text style={styles.statusBtnText}>
                      {NEXT_STATUS_LABEL[activeOrder.status]}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Offline State */}
            {!isOnline && (
              <View style={styles.offlineState}>
                <View style={styles.offlineIconContainer}>
                  <View style={styles.offlineIcon} />
                </View>
                <Text style={styles.offlineTitle}>You're Offline</Text>
                <Text style={styles.offlineSub}>Toggle online above to start receiving orders</Text>
              </View>
            )}

            {/* Pending Orders Header */}
            {isOnline && !activeOrder && (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>
                  {loading ? 'Loading orders...' : `Available Orders · ${pendingOrders.length}`}
                </Text>
                <View style={styles.sectionLine} />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          isOnline && !activeOrder && !loading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <View style={styles.emptyIcon} />
              </View>
              <Text style={styles.emptyTitle}>No Orders Available</Text>
              <Text style={styles.emptySub}>New orders will appear here instantly</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.orderCard} onPress={() => handleAccept(item)} activeOpacity={0.85}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderStore}>{item.storeName}</Text>
              <Text style={styles.orderAmount}>${formatJMD(item.totalAmount)}</Text>
            </View>

            <View style={styles.orderDetails}>
              <View style={styles.orderDetailRow}>
                <View style={styles.orderDetailDot} />
                <Text style={styles.orderStudent}>{item.studentName}</Text>
              </View>
              <View style={styles.orderDetailRow}>
                <View style={[styles.orderDetailDot, { backgroundColor: '#F5C842' }]} />
                <Text style={styles.orderAddress} numberOfLines={1}>{item.deliveryAddress.label}</Text>
              </View>
            </View>

            <View style={styles.orderFooter}>
              <Text style={styles.orderItems}>{item.items.length} items</Text>
              <Text style={styles.orderTime}>
                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            <View style={styles.acceptBtn}>
              <Text style={styles.acceptBtnText}>Accept Order</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A1128',
  },

  // Wave decoration - liquid background
  waveDecoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: -1,
  },
  waveCircle1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: '#1E5FD4',
    top: -120,
    right: -80,
    opacity: 0.06,
  },
  waveCircle2: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 240,
    backgroundColor: '#F5C842',
    bottom: 100,
    left: -100,
    opacity: 0.05,
  },
  waveBlur1: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 320,
    backgroundColor: '#0EA5E9',
    top: 300,
    right: -150,
    opacity: 0.04,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: 'rgba(18, 28, 50, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 200, 66, 0.1)',
  },
  dasherBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F5C842',
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  onlineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: 40,
  },
  onlineLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8892A4',
  },
  onlineLabelActive: {
    color: '#F5C842',
  },
  logoutBtn: {
    backgroundColor: 'rgba(255, 71, 87, 0.12)',
    borderRadius: 40,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 71, 87, 0.2)',
  },
  logoutText: {
    color: '#FF8A92',
    fontSize: 13,
    fontWeight: '600',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F5C842',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(245, 200, 66, 0.2)',
  },

  // Active order card - glassmorphism
  activeCard: {
    backgroundColor: 'rgba(18, 28, 50, 0.85)',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: 32,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(245, 200, 66, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 25,
    elevation: 10,
    gap: SPACING.md,
  },
  activeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  activeBadge: {
    borderRadius: 40,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  activeStoreContainer: {
    paddingVertical: SPACING.xs,
  },
  activeStore: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F5C842',
    letterSpacing: -0.5,
  },
  activeDetails: {
    gap: 4,
  },
  activeStudent: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  activeAddress: {
    fontSize: 13,
    color: '#8892A4',
    lineHeight: 18,
  },
  activeMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.xs,
  },
  activeItems: {
    fontSize: 13,
    color: '#8892A4',
  },
  activeAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F5C842',
  },
  mapContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  noGpsBox: {
    backgroundColor: 'rgba(245, 200, 66, 0.08)',
    borderRadius: 16,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(245, 200, 66, 0.25)',
    gap: 4,
  },
  noGpsText: {
    fontSize: 12,
    color: '#8892A4',
    fontWeight: '600',
  },
  noGpsAddress: {
    fontSize: 15,
    color: '#F5C842',
    fontWeight: '700',
  },
  activeMap: {
    height: 200,
    width: '100%',
  },
  statusBtn: {
    backgroundColor: '#F5C842',
    borderRadius: 40,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.xs,
    shadowColor: '#F5C842',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  statusBtnText: {
    color: '#0A1128',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Offline state
  offlineState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: SPACING.md,
  },
  offlineIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  offlineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4A5568',
    opacity: 0.5,
  },
  offlineTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  offlineSub: {
    fontSize: 14,
    color: '#8892A4',
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: SPACING.md,
  },
  emptyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(245, 200, 66, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  emptyIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5C842',
    opacity: 0.4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  emptySub: {
    fontSize: 14,
    color: '#8892A4',
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },

  // Pending order cards
  orderCard: {
    backgroundColor: 'rgba(18, 28, 50, 0.75)',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: 24,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    gap: SPACING.sm,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderStore: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  orderAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F5C842',
  },
  orderDetails: {
    gap: 6,
    paddingVertical: 4,
  },
  orderDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderDetailDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#8892A4',
  },
  orderStudent: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  orderAddress: {
    fontSize: 12,
    color: '#8892A4',
    flex: 1,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  orderItems: {
    fontSize: 11,
    color: '#8892A4',
  },
  orderTime: {
    fontSize: 11,
    color: '#4A5568',
  },
  acceptBtn: {
    backgroundColor: 'rgba(245, 200, 66, 0.12)',
    borderRadius: 40,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(245, 200, 66, 0.3)',
  },
  acceptBtnText: {
    color: '#F5C842',
    fontSize: 14,
    fontWeight: '700',
  },
});