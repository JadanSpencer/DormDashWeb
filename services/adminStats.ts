// services/adminStats.ts
// Admin dashboard numbers, counted by Firestore with aggregation queries
// (count / sum / average): each costs one read per 1,000 matching docs
// instead of downloading every user and order. Admin-only by
// firestore.rules (students and dashers can't aggregate others' data).

import {
  collection, query, where, getAggregateFromServer, count, sum, average, Query,
} from 'firebase/firestore';
import { db } from './firebase';
import { IN_DELIVERY_STATUSES } from '../constants';

export async function loadAdminStats() {
  const users = collection(db, 'users');
  const orders = collection(db, 'orders');
  const countOf = (q: Query) => getAggregateFromServer(q, { n: count() }).then(s => s.data().n);
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const [
    totalUsers, totalStudents, totalDashers,
    totalOrders, pendingOrders, activeOrders, cancelledOrders,
    ordersToday, ordersThisWeek, delivered,
  ] = await Promise.all([
    countOf(users),
    countOf(query(users, where('role', '==', 'student'))),
    countOf(query(users, where('role', '==', 'dasher'))),
    countOf(orders),
    countOf(query(orders, where('status', '==', 'pending'))),
    countOf(query(orders, where('status', 'in', IN_DELIVERY_STATUSES))),
    countOf(query(orders, where('status', '==', 'cancelled'))),
    countOf(query(orders, where('createdAt', '>=', dayStart))),
    countOf(query(orders, where('createdAt', '>=', weekAgo))),
    getAggregateFromServer(query(orders, where('status', '==', 'delivered')), {
      n: count(),
      // DormDash's 30% of each fee (platformFeeJmd, set by verifyNewOrder).
      revenue: sum('platformFeeJmd'),
      gmv: sum('totalAmount'),
      // deliveryMins is written by the server on delivery (onOrderStatusChanged).
      avgMins: average('deliveryMins'),
    }).then(s => s.data()),
  ]);

  return {
    totalUsers, totalStudents, totalDashers,
    totalOrders, pendingOrders, activeOrders, cancelledOrders,
    ordersToday, ordersThisWeek,
    deliveredOrders: delivered.n,
    revenue: delivered.revenue ?? 0,
    gmv: delivered.gmv ?? 0,
    avgDeliveryMins: delivered.avgMins == null ? 0 : Math.round(delivered.avgMins),
  };
}
