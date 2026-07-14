// app/(student)/(tabs)/orders.tsx
// Student orders screen with active order tracking and history.
// Professional design with cerulean/yellow palette.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  collection, query, where, onSnapshot,
  updateDoc, doc,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { useAuth } from '../../../hooks/useAuth';
import { Order, OrderStatus } from '../../../types';
import { COLORS, SPACING, RADIUS, formatJMD } from '../../../constants';

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; description: string }> = {
  pending:    { label: 'Pending',    color: '#FFD166', description: 'Waiting for a dasher to accept' },
  accepted:   { label: 'Accepted',   color: '#FFC107', description: 'A dasher is heading to the store' },
  picking_up: { label: 'Picking Up', color: '#FFE066', description: 'Dasher is at the store' },
  on_the_way: { label: 'On the Way', color: '#FFD166', description: 'Your order is on its way!' },
  delivered:  { label: 'Delivered',  color: '#00D9A3', description: 'Enjoy your order!' },
  cancelled:  { label: 'Cancelled',  color: '#FF4757', description: 'This order was cancelled' },
};

const STATUS_STEPS: OrderStatus[] = ['pending', 'accepted', 'picking_up', 'on_the_way', 'delivered'];

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDate = (ts: number) => {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// Format currency for compact display (1.2K, 3.4M, etc.)
const formatCurrency = (amount: number): string => {
  if (amount >= 1000000) {
    return `J$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `J$${(amount / 1000).toFixed(1)}K`;
  }
  return `${formatJMD(amount)}`;
};

// Status Timeline Component
function StatusTimeline({ status }: { status: OrderStatus }) {
  const currentIndex = STATUS_STEPS.indexOf(status);
  if (status === 'cancelled') return null;

  return (
    <View style={timelineStyles.container}>
      {STATUS_STEPS.map((step, i) => {
        const cfg = STATUS_CONFIG[step];
        const isCompleted = i <= currentIndex;
        const isActive = i === currentIndex;

        return (
          <View key={step} style={timelineStyles.step}>
            {i > 0 && (
              <View
                style={[
                  timelineStyles.line,
                  { backgroundColor: i <= currentIndex ? '#FFD166' : '#E2E8F0' },
                ]}
              />
            )}
            <View
              style={[
                timelineStyles.node,
                isCompleted && timelineStyles.nodeCompleted,
                isActive && timelineStyles.nodeActive,
              ]}
            >
              {isActive && (
                <View style={timelineStyles.nodePulse} />
              )}
            </View>
            <Text
              style={[
                timelineStyles.label,
                isCompleted && timelineStyles.labelCompleted,
                isActive && timelineStyles.labelActive,
              ]}
            >
              {cfg.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const timelineStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: SPACING.md,
    marginTop: SPACING.xs,
  },
  step: { flex: 1, alignItems: 'center', position: 'relative' },
  line: {
    position: 'absolute',
    top: 10,
    left: 0,
    width: '50%',
    height: 2,
    zIndex: 0,
  },
  node: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    zIndex: 1,
  },
  nodeCompleted: {
    borderColor: '#00D9A3',
    backgroundColor: '#00D9A3',
  },
  nodeActive: {
    borderColor: '#FFD166',
    backgroundColor: '#FFD166',
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  nodePulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    alignSelf: 'center',
    marginTop: 6,
  },
  label: {
    fontSize: 9,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
    color: '#94A3B8',
  },
  labelCompleted: {
    color: '#64748B',
  },
  labelActive: {
    color: '#FFD166',
    fontWeight: '600',
  },
});

// Active Order Card
function ActiveOrderCard({ order, onCancel }: { order: Order; onCancel: () => void }) {
  const cfg = STATUS_CONFIG[order.status];

  return (
    <View style={activeStyles.card}>
      <View style={activeStyles.header}>
        <View style={activeStyles.liveBadge}>
          <View style={activeStyles.liveDot} />
          <Text style={activeStyles.liveText}>LIVE</Text>
        </View>
        <Text style={activeStyles.orderId}>#{order.id.slice(-6).toUpperCase()}</Text>
      </View>

      <Text style={activeStyles.storeName}>{order.storeName}</Text>
      <Text style={activeStyles.amount}>{formatJMD(order.totalAmount)}</Text>

      <Text style={activeStyles.items} numberOfLines={2}>
        {order.items.map(i => i.menuItem.name).join(' · ')}
      </Text>

      <View style={activeStyles.addressContainer}>
        <Text style={activeStyles.addressLabel}>Delivery to:</Text>
        <Text style={activeStyles.addressText}>{order.deliveryAddress.label}</Text>
      </View>

      {order.dasherName && (
        <View style={activeStyles.dasherContainer}>
          <View style={activeStyles.dasherAvatar}>
            <Text style={activeStyles.dasherInitial}>{order.dasherName[0]}</Text>
          </View>
          <View style={activeStyles.dasherInfo}>
            <Text style={activeStyles.dasherLabel}>Your Dasher</Text>
            <Text style={activeStyles.dasherName}>{order.dasherName}</Text>
          </View>
          <View style={[activeStyles.statusPill, { backgroundColor: cfg.color + '20' }]}>
            <Text style={[activeStyles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
      )}

      <View style={activeStyles.descriptionBox}>
        <Text style={activeStyles.description}>{cfg.description}</Text>
      </View>

      <StatusTimeline status={order.status} />

      {order.status === 'pending' && (
        <TouchableOpacity style={activeStyles.cancelButton} onPress={onCancel}>
          <Text style={activeStyles.cancelText}>Cancel Order</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const activeStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderRadius: 24,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(0, 180, 216, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 217, 163, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00D9A3',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#00D9A3',
    letterSpacing: 1,
  },
  orderId: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: 'monospace',
  },
  storeName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#023E8A',
    marginBottom: 4,
  },
  amount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#00B4D8',
    marginBottom: SPACING.sm,
  },
  items: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: SPACING.md,
  },
  addressContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  addressLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 2,
  },
  addressText: {
    fontSize: 13,
    color: '#023E8A',
  },
  dasherContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    gap: 12,
  },
  dasherAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 180, 216, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dasherInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: '#00B4D8',
  },
  dasherInfo: {
    flex: 1,
  },
  dasherLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  dasherName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#023E8A',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  descriptionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  description: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 71, 87, 0.12)',
    borderRadius: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 71, 87, 0.3)',
  },
  cancelText: {
    color: '#FF8A92',
    fontSize: 14,
    fontWeight: '600',
  },
});

// History Order Card
function HistoryOrderCard({ order }: { order: Order }) {
  const cfg = STATUS_CONFIG[order.status];
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={historyStyles.card}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.85}
    >
      <View style={historyStyles.row}>
        <View style={historyStyles.left}>
          <Text style={historyStyles.store}>{order.storeName}</Text>
          <Text style={historyStyles.date}>
            {formatDate(order.createdAt)} · {formatTime(order.createdAt)}
          </Text>
        </View>
        <View style={historyStyles.right}>
          <Text style={historyStyles.amount}>{formatJMD(order.totalAmount)}</Text>
          <View style={[historyStyles.badge, { backgroundColor: cfg.color + '15' }]}>
            <Text style={[historyStyles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
      </View>

      {expanded && (
        <View style={historyStyles.expanded}>
          <View style={historyStyles.divider} />
          <Text style={historyStyles.sectionTitle}>Items</Text>
          {order.items.map((item, i) => (
            <View key={i} style={historyStyles.itemRow}>
              <Text style={historyStyles.itemName}>
                {item.quantity}× {item.menuItem.name}
              </Text>
              <Text style={historyStyles.itemPrice}>
                {formatJMD(item.menuItem.price * item.quantity)}
              </Text>
            </View>
          ))}
          <View style={historyStyles.divider} />
          <View style={historyStyles.detailRow}>
            <Text style={historyStyles.detailLabel}>Delivery Address</Text>
            <Text style={historyStyles.detailText}>{order.deliveryAddress.label}</Text>
          </View>
          {order.dasherName && (
            <View style={historyStyles.detailRow}>
              <Text style={historyStyles.detailLabel}>Delivered By</Text>
              <Text style={historyStyles.detailText}>{order.dasherName}</Text>
            </View>
          )}
          {order.deliveredAt && (
            <View style={historyStyles.detailRow}>
              <Text style={historyStyles.detailLabel}>Delivered At</Text>
              <Text style={historyStyles.detailText}>{formatTime(order.deliveredAt)}</Text>
            </View>
          )}
        </View>
      )}

      <Text style={historyStyles.chevron}>{expanded ? '▲' : '▼'}</Text>
    </TouchableOpacity>
  );
}

const historyStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    borderRadius: 20,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 180, 216, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  left: {
    flex: 1,
  },
  right: {
    alignItems: 'flex-end',
  },
  store: {
    fontSize: 15,
    fontWeight: '700',
    color: '#023E8A',
    marginBottom: 4,
  },
  date: {
    fontSize: 11,
    color: '#94A3B8',
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#00B4D8',
    marginBottom: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  expanded: {
    marginTop: SPACING.md,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  itemName: {
    fontSize: 12,
    color: '#64748B',
    flex: 1,
  },
  itemPrice: {
    fontSize: 12,
    color: '#023E8A',
    fontWeight: '600',
  },
  detailRow: {
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 2,
  },
  detailText: {
    fontSize: 12,
    color: '#023E8A',
  },
  chevron: {
    textAlign: 'center',
    color: '#CBD5E1',
    fontSize: 10,
    marginTop: SPACING.sm,
  },
});

// Main Screen
export default function StudentOrders() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [pastOrders, setPastOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'orders'),
      where('studentId', '==', user.uid),
      where('status', 'in', ['pending', 'accepted', 'picking_up', 'on_the_way'])
    );
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setActiveOrder(docs.length > 0 ? docs[0] : null);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'orders'),
      where('studentId', '==', user.uid),
      where('status', 'in', ['delivered', 'cancelled'])
    );
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setPastOrders(docs.sort((a, b) => b.createdAt - a.createdAt));
      setLoading(false);
    });
  }, [user]);

  const handleCancel = () => {
    if (!activeOrder) return;
    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this order?',
      [
        { text: 'Keep Order', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'orders', activeOrder.id), {
                status: 'cancelled',
                cancelledAt: Date.now(),
              });
            } catch (e) {
              //Rules denied it - a dasher accepted in the same instant
              Alert.alert(
                'Too Late to Cancel',
                'A dasher just accepted your order and is on the way. Sit tight!'
              );
            }
          },
        },
      ]
    );
  };

  const deliveredCount = pastOrders.filter(o => o.status === 'delivered').length;
  const totalSpent = pastOrders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.waveDecoration} pointerEvents="none">
        <View style={styles.waveCircle1} />
        <View style={styles.waveCircle2} />
        <View style={styles.waveCircle3} />
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#00B4D8" />
        </View>
      ) : (
        <FlatList
          data={pastOrders}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{deliveredCount}</Text>
                  <Text style={styles.statLabel}>Delivered</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{formatCurrency(totalSpent)}</Text>
                  <Text style={styles.statLabel}>Total Spent</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{activeOrder ? 1 : 0}</Text>
                  <Text style={styles.statLabel}>Active</Text>
                </View>
              </View>

              {activeOrder ? (
                <ActiveOrderCard order={activeOrder} onCancel={handleCancel} />
              ) : (
                <View style={styles.noActiveCard}>
                  <View style={styles.noActiveIcon} />
                  <Text style={styles.noActiveTitle}>No Active Order</Text>
                  <Text style={styles.noActiveSub}>Browse stores to place a new order</Text>
                </View>
              )}

              {pastOrders.length > 0 && (
                <Text style={styles.historyLabel}>Past Orders</Text>
              )}
            </>
          }
          ListEmptyComponent={
            !activeOrder ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon} />
                <Text style={styles.emptyTitle}>No orders yet</Text>
                <Text style={styles.emptySub}>Your order history will appear here</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => <HistoryOrderCard order={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F0F9FF', // Soft cerulean tint
  },
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
    backgroundColor: '#00B4D8',
    top: -80,
    right: -60,
    opacity: 0.08,
  },
  waveCircle2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#FFD166',
    bottom: 50,
    left: -80,
    opacity: 0.06,
  },
  waveCircle3: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#0096C7',
    top: '30%',
    right: -50,
    opacity: 0.05,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#023E8A',
    letterSpacing: -0.5,
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    gap: 12,
    marginBottom: SPACING.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 180, 216, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#00B4D8',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  noActiveCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderRadius: 20,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 180, 216, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  noActiveIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 180, 216, 0.1)',
    marginBottom: SPACING.md,
  },
  noActiveTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#023E8A',
    marginBottom: 4,
  },
  noActiveSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  historyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 180, 216, 0.08)',
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#023E8A',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    color: '#94A3B8',
  },
});