// app/(student)/order/[id].tsx
// Live order tracking — status updates in real time from Firestore.
// Professional liquid glassmorphism design.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { Order, OrderStatus } from '../../../types';
import { COLORS, SPACING, RADIUS, formatJMD } from '../../../constants';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; description: string }> = {
  pending:    { label: 'Finding a Dasher', color: '#F59E0B', description: 'Waiting for a dasher to accept your order' },
  accepted:   { label: 'Dasher Assigned',  color: '#3B82F6', description: 'Your dasher is heading to the store' },
  picking_up: { label: 'Picking Up',       color: '#8B5CF6', description: 'Your dasher is at the store collecting your order' },
  on_the_way: { label: 'On the Way',       color: '#F5C842', description: 'Your dasher is heading to you!' },
  delivered:  { label: 'Delivered',        color: '#00D9A3', description: 'Enjoy your order!' },
  cancelled:  { label: 'Cancelled',        color: '#FF4757', description: 'This order was cancelled' },
};

const STATUS_ORDER: OrderStatus[] = ['pending', 'accepted', 'picking_up', 'on_the_way', 'delivered'];

export default function OrderTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

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
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#F5C842" size="large" />
      </View>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Order not found</Text>
          <TouchableOpacity
            style={styles.errorButton}
            onPress={() => router.replace('/(student)/(tabs)/home')}
          >
            <Text style={styles.errorButtonText}>Go Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const config = STATUS_CONFIG[order.status];
  const currentStepIndex = STATUS_ORDER.indexOf(order.status);
  const isActive = order.status !== 'delivered' && order.status !== 'cancelled';
  const showDeliverySection =
    order.status === 'on_the_way' || order.status === 'picking_up' || order.status === 'accepted';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.waveDecoration} pointerEvents="none">
        <View style={styles.waveCircle1} />
        <View style={styles.waveCircle2} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.replace('/(student)/(tabs)/home')}
            style={styles.backButton}
          >
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Track Order</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Status Hero Card */}
        <View style={[styles.statusCard, { borderColor: config.color + '40' }]}>
          <View style={[styles.statusIndicator, { backgroundColor: config.color + '15' }]}>
            <View style={[styles.statusDot, { backgroundColor: config.color }]} />
          </View>
          <Text style={[styles.statusLabel, { color: config.color }]}>{config.label}</Text>
          <Text style={styles.statusDescription}>{config.description}</Text>

          {order.dasherName && (
            <View style={styles.dasherCard}>
              <View style={styles.dasherAvatar}>
                <Text style={styles.dasherInitial}>{order.dasherName[0]}</Text>
              </View>
              <View>
                <Text style={styles.dasherLabel}>Your Dasher</Text>
                <Text style={styles.dasherName}>{order.dasherName}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Progress Timeline */}
        {order.status !== 'cancelled' && (
          <View style={styles.timelineCard}>
            {STATUS_ORDER.map((status, idx) => {
              const s = STATUS_CONFIG[status];
              const isCompleted = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              return (
                <View key={status} style={styles.timelineStep}>
                  <View style={styles.timelineLeft}>
                    <View style={[
                      styles.timelineDot,
                      isCompleted && styles.timelineDotCompleted,
                      isCurrent && styles.timelineDotCurrent,
                    ]}>
                      {isCompleted && (
                        <Text style={styles.timelineCheck}>✓</Text>
                      )}
                    </View>
                    {idx < STATUS_ORDER.length - 1 && (
                      <View style={[
                        styles.timelineLine,
                        isCompleted && styles.timelineLineCompleted,
                      ]} />
                    )}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={[
                      styles.timelineLabel,
                      (isCompleted || isCurrent) && styles.timelineLabelActive,
                    ]}>
                      {s.label}
                    </Text>
                    {isCurrent && (
                      <Text style={styles.timelineSub}>{s.description}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Delivery Location (only while active) — map only with a real GPS fix,
            otherwise the pin would point at campus center and lie */}
        {showDeliverySection && (
          <View style={styles.mapCard}>
            <Text style={styles.mapTitle}>Delivery Location</Text>
            {order.deliveryAddress.hasGpsFix ? (
              <View style={styles.mapContainer}>
                <MapView
                  style={styles.map}
                  provider={PROVIDER_GOOGLE}
                  initialRegion={{
                    latitude: order.deliveryAddress.latitude,
                    longitude: order.deliveryAddress.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                >
                  <Marker
                    coordinate={{
                      latitude: order.deliveryAddress.latitude,
                      longitude: order.deliveryAddress.longitude,
                    }}
                    title={order.deliveryAddress.label}
                    pinColor="#F5C842"
                  />
                </MapView>
              </View>
            ) : (
              <View style={styles.noGpsBox}>
                <Text style={styles.noGpsText}>📍 Your dasher will deliver to:</Text>
              </View>
            )}
            <Text style={styles.mapAddress}>{order.deliveryAddress.label}</Text>
          </View>
        )}

        {/* Order Details Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Order Summary</Text>
          <Text style={styles.storeName}>{order.storeName}</Text>

          <View style={styles.itemsContainer}>
            {order.items.map((item, idx) => (
              <View key={idx} style={styles.itemRow}>
                <View style={styles.itemLeft}>
                  <Text style={styles.itemQuantity}>{item.quantity}</Text>
                  <Text style={styles.itemName} numberOfLines={1}>{item.menuItem.name}</Text>
                </View>
                <Text style={styles.itemPrice}>
                  {formatJMD(item.menuItem.price * item.quantity)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Delivery Address</Text>
            <Text style={styles.detailValue}>{order.deliveryAddress.label}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Order Total</Text>
            <Text style={styles.totalAmount}>{formatJMD(order.totalAmount)}</Text>
          </View>

          {order.studentNote && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Note to Dasher</Text>
                <Text style={styles.detailValue}>{order.studentNote}</Text>
              </View>
            </>
          )}

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Order ID</Text>
            <Text style={styles.orderId}>{order.id.slice(-8).toUpperCase()}</Text>
          </View>
        </View>

        {/* Action Button */}
        {(order.status === 'delivered' || order.status === 'cancelled') && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.replace('/(student)/(tabs)/home')}
          >
            <Text style={styles.actionButtonText}>Back to Home</Text>
          </TouchableOpacity>
        )}

        {order.status === 'pending' && (
          <View style={styles.waitingCard}>
            <Text style={styles.waitingText}>Looking for a dasher...</Text>
            <ActivityIndicator color="#F5C842" size="small" />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A1128',
  },

  // Wave decoration
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
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#1E5FD4',
    top: -80,
    right: -60,
    opacity: 0.05,
  },
  waveCircle2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#F5C842',
    bottom: 50,
    left: -80,
    opacity: 0.04,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A1128',
  },

  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  errorText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  errorButton: {
    backgroundColor: 'rgba(245, 200, 66, 0.12)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(245, 200, 66, 0.3)',
  },
  errorButtonText: {
    color: '#F5C842',
    fontSize: 14,
    fontWeight: '600',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 200, 66, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    color: '#F5C842',
    fontSize: 20,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },

  // Status Card
  statusCard: {
    backgroundColor: 'rgba(18, 28, 50, 0.85)',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderRadius: 28,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  statusIndicator: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  statusDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  statusLabel: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  statusDescription: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  dasherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 40,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 12,
  },
  dasherAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 200, 66, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dasherInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F5C842',
  },
  dasherLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  dasherName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Timeline
  timelineCard: {
    backgroundColor: 'rgba(18, 28, 50, 0.7)',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderRadius: 24,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  timelineStep: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 28,
  },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDotCompleted: {
    backgroundColor: '#00D9A3',
  },
  timelineDotCurrent: {
    backgroundColor: '#F5C842',
    shadowColor: '#F5C842',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  timelineCheck: {
    color: '#0A1128',
    fontSize: 12,
    fontWeight: '700',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 4,
  },
  timelineLineCompleted: {
    backgroundColor: '#00D9A3',
  },
  timelineContent: {
    flex: 1,
    paddingBottom: SPACING.lg,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 2,
  },
  timelineLabelActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  timelineSub: {
    fontSize: 12,
    color: '#64748B',
  },

  // Map Card
  mapCard: {
    backgroundColor: 'rgba(18, 28, 50, 0.7)',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderRadius: 24,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  mapTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  mapContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  map: {
    height: 200,
    width: '100%',
  },
  noGpsBox: {
    backgroundColor: 'rgba(245, 200, 66, 0.08)',
    borderRadius: 16,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(245, 200, 66, 0.25)',
    alignItems: 'center',
  },
  noGpsText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  mapAddress: {
    fontSize: 13,
    color: '#FFFFFF',
    marginTop: SPACING.sm,
    textAlign: 'center',
  },

  // Details Card
  detailsCard: {
    backgroundColor: 'rgba(18, 28, 50, 0.7)',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderRadius: 24,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: SPACING.sm,
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  storeName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F5C842',
    marginBottom: SPACING.xs,
  },
  itemsContainer: {
    gap: 8,
    marginVertical: SPACING.xs,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  itemQuantity: {
    width: 28,
    color: '#F5C842',
    fontSize: 13,
    fontWeight: '600',
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  detailValue: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: SPACING.md,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F5C842',
  },
  orderId: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: 'monospace',
  },

  // Action Button
  actionButton: {
    backgroundColor: '#F5C842',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderRadius: 40,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F5C842',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  actionButtonText: {
    color: '#0A1128',
    fontSize: 16,
    fontWeight: '700',
  },

  // Waiting Card
  waitingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: 'rgba(245, 200, 66, 0.08)',
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(245, 200, 66, 0.2)',
  },
  waitingText: {
    fontSize: 14,
    color: '#F5C842',
    fontWeight: '500',
  },
});