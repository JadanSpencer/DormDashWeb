// Security rules tests. Run from this folder: npm install && npm test
// (needs Java for the Firestore emulator).
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs,
  getAggregateFromServer, count, sum, average, orderBy, limit,
} from 'firebase/firestore';

let env;
const db = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dormdash',
    firestore: { rules: readFileSync('../firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env.cleanup(); });

const baseOrder = {
  studentId: 'stu', studentName: 'Stu', storeId: 'store1', storeName: 'Grill',
  items: [{ quantity: 1, menuItem: { id: 'm1' } }], status: 'pending',
  totalAmount: 500, deliveryFee: 100,
  deliveryAddress: { latitude: 0, longitude: 0, label: 'Block C 204', hasGpsFix: false },
  createdAt: Date.now(),
};

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    const user = (uid, role, extra = {}) => setDoc(doc(a, 'users', uid), {
      uid, role, name: uid, email: `${uid}@x.com`, phone: '876', university: 'U', isActive: true, createdAt: 1, ...extra,
    });
    await user('stu', 'student');
    await user('stu2', 'student');
    await user('dash', 'dasher');
    await user('dash2', 'dasher');
    await user('boss', 'admin');
    await user('banned', 'student', { isActive: false });
    await setDoc(doc(a, 'dashers', 'dash'), { uid: 'dash', isOnline: false, rating: 5, totalDeliveries: 0, totalEarnings: 0 });
    // Created by an older app version that still uploaded GPS.
    await setDoc(doc(a, 'dashers', 'dash2'), { uid: 'dash2', isOnline: false, rating: 5, totalDeliveries: 0, totalEarnings: 0, currentLocation: { latitude: 1, longitude: 1 } });
    await setDoc(doc(a, 'stores', 'store1'), { name: 'Grill', description: 'Jerk and more', deliveryFee: 150, rating: 4.5, isOpen: true });
    await setDoc(doc(a, 'orders', 'pend'), { ...baseOrder, verifiedAt: Date.now() });
    await setDoc(doc(a, 'orders', 'unverified'), { ...baseOrder });
    await setDoc(doc(a, 'orders', 'mine'), { ...baseOrder, status: 'accepted', dasherId: 'dash', dasherName: 'D', verifiedAt: 1 });
    await setDoc(doc(a, 'orders', 'cancelled'), { ...baseOrder, status: 'cancelled', cancelReason: 'duplicate_order' });
  });
});

// ── Users ─────────────────────────────────────────────────────────────────
test('signup as student works', async () => {
  await assertSucceeds(setDoc(doc(db('new'), 'users', 'new'), {
    uid: 'new', email: 'n@x.com', name: 'New', role: 'student', phone: '876', university: 'U', createdAt: 1, isActive: true, termsAcceptedAt: 1, termsVersion: 'v',
  }));
});
test('cannot sign up as admin', async () => {
  await assertFails(setDoc(doc(db('new'), 'users', 'new'), {
    uid: 'new', email: 'n@x.com', name: 'New', role: 'admin', phone: '876', university: 'U', createdAt: 1, isActive: true, termsAcceptedAt: 1, termsVersion: 'v',
  }));
});
test('sign-up without accepting terms is refused', async () => {
  await assertFails(setDoc(doc(db('new'), 'users', 'new'), {
    uid: 'new', email: 'n@x.com', name: 'New', role: 'student', phone: '876', university: 'U', createdAt: 1, isActive: true,
  }));
});
test('cannot make yourself admin later', async () => {
  await assertFails(updateDoc(doc(db('stu'), 'users', 'stu'), { role: 'admin' }));
});
test('cannot reactivate yourself', async () => {
  await assertFails(updateDoc(doc(db('banned'), 'users', 'banned'), { isActive: true }));
});
test('can edit own profile and push token', async () => {
  await assertSucceeds(updateDoc(doc(db('stu'), 'users', 'stu'), { phone: '8761234567', major: 'CS' }));
  await assertSucceeds(updateDoc(doc(db('stu'), 'users', 'stu'), { pushToken: 'web:abc', pushTokenUpdatedAt: 1 }));
});
test('cannot read another user (phone numbers)', async () => {
  await assertFails(getDoc(doc(db('stu'), 'users', 'stu2')));
  await assertFails(getDoc(doc(db('dash'), 'users', 'stu')));
  await assertFails(getDoc(doc(anon(), 'users', 'stu')));
});
test('admin can read users and switch accounts off', async () => {
  await assertSucceeds(getDocs(collection(db('boss'), 'users')));
  await assertSucceeds(updateDoc(doc(db('boss'), 'users', 'stu'), { isActive: false }));
  await assertFails(updateDoc(doc(db('boss'), 'users', 'stu'), { role: 'admin' }));
});
test('student cannot list users', async () => {
  await assertFails(getDocs(collection(db('stu'), 'users')));
});

// ── Dashers ───────────────────────────────────────────────────────────────
test('dasher goes online without GPS; cannot fake earnings or upload location', async () => {
  await assertSucceeds(updateDoc(doc(db('dash'), 'dashers', 'dash'), { isOnline: true, lastSeenAt: 1 }));
  await assertFails(updateDoc(doc(db('dash'), 'dashers', 'dash'), { totalEarnings: 99999 }));
  await assertFails(updateDoc(doc(db('dash'), 'dashers', 'dash'), { currentLocation: { latitude: 1, longitude: 1 } }));
});
test('dasher with an old stored position can still go online, and clear it', async () => {
  await assertSucceeds(updateDoc(doc(db('dash2'), 'dashers', 'dash2'), { isOnline: true, lastSeenAt: 1 }));
  await assertSucceeds(updateDoc(doc(db('dash2'), 'dashers', 'dash2'), { isOnline: false, currentLocation: null, lastSeenAt: 2 }));
});
test('dasher docs are private to that dasher and admins', async () => {
  await assertFails(getDocs(query(collection(db('stu'), 'dashers'), where('isOnline', '==', true))));
  await assertFails(getDoc(doc(db('stu'), 'dashers', 'dash')));
  await assertFails(getDoc(doc(db('dash2'), 'dashers', 'dash')));
  await assertSucceeds(getDoc(doc(db('dash'), 'dashers', 'dash')));
  await assertSucceeds(getDoc(doc(db('boss'), 'dashers', 'dash')));
  await assertSucceeds(getDocs(collection(db('boss'), 'dashers')));
});
test('online dasher count is public to signed-in users, written by the server only', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'publicStats', 'app'), { onlineDashers: 3 });
  });
  await assertSucceeds(getDoc(doc(db('stu'), 'publicStats', 'app')));
  await assertFails(getDoc(doc(anon(), 'publicStats', 'app')));
  await assertFails(setDoc(doc(db('boss'), 'publicStats', 'app'), { onlineDashers: 99 }));
});

// ── Orders ────────────────────────────────────────────────────────────────
test('student places own pending order', async () => {
  await assertSucceeds(addDoc(collection(db('stu'), 'orders'), baseOrder));
});
test('cannot place order for someone else, or pre-accepted', async () => {
  await assertFails(addDoc(collection(db('stu2'), 'orders'), baseOrder));
  await assertFails(addDoc(collection(db('stu'), 'orders'), { ...baseOrder, status: 'accepted' }));
  await assertFails(addDoc(collection(db('stu'), 'orders'), { ...baseOrder, dasherId: 'dash' }));
});
test('deactivated student and dashers cannot order', async () => {
  await assertFails(addDoc(collection(db('banned'), 'orders'), { ...baseOrder, studentId: 'banned' }));
  await assertFails(addDoc(collection(db('dash'), 'orders'), { ...baseOrder, studentId: 'dash' }));
});
test('students only see their own orders', async () => {
  await assertSucceeds(getDoc(doc(db('stu'), 'orders', 'pend')));
  await assertFails(getDoc(doc(db('stu2'), 'orders', 'pend')));
  await assertSucceeds(getDocs(query(collection(db('stu'), 'orders'), where('studentId', '==', 'stu'))));
  await assertFails(getDocs(collection(db('stu2'), 'orders')));
});
test('dasher sees open orders but not cancelled ones', async () => {
  await assertSucceeds(getDocs(query(collection(db('dash'), 'orders'), where('status', '==', 'pending'))));
  await assertFails(getDoc(doc(db('dash2'), 'orders', 'cancelled')));
});
test('student cancels pending, not after acceptance', async () => {
  await assertSucceeds(updateDoc(doc(db('stu'), 'orders', 'pend'), { status: 'cancelled', cancelledAt: 1 }));
  await assertFails(updateDoc(doc(db('stu'), 'orders', 'mine'), { status: 'cancelled', cancelledAt: 1 }));
});
test('student cancels an accepted order only while it is unpaid', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    const accepted = { ...baseOrder, status: 'accepted', dasherId: 'dash', dasherName: 'D', verifiedAt: 1, paymentMethod: 'card' };
    await setDoc(doc(a, 'orders', 'unpaid'), { ...accepted, paymentStatus: 'awaiting_payment', payDeadline: Date.now() + 600000 });
    await setDoc(doc(a, 'orders', 'paid'), { ...accepted, paymentStatus: 'paid' });
  });
  await assertFails(updateDoc(doc(db('stu'), 'orders', 'paid'), { status: 'cancelled', cancelledAt: 1 }));
  // Can't be used to touch payment fields on the way out.
  await assertFails(updateDoc(doc(db('stu'), 'orders', 'unpaid'), { status: 'cancelled', cancelledAt: 1, paymentStatus: 'paid' }));
  // Another student can't cancel it.
  await assertFails(updateDoc(doc(db('stu2'), 'orders', 'unpaid'), { status: 'cancelled', cancelledAt: 1 }));
  await assertSucceeds(updateDoc(doc(db('stu'), 'orders', 'unpaid'), { status: 'cancelled', cancelledAt: 1 }));
});
test('student cannot change price or mark delivered', async () => {
  await assertFails(updateDoc(doc(db('stu'), 'orders', 'pend'), { totalAmount: 1 }));
  await assertFails(updateDoc(doc(db('stu'), 'orders', 'pend'), { status: 'delivered' }));
});
test('dasher accepts verified order for themselves only', async () => {
  await assertFails(updateDoc(doc(db('dash'), 'orders', 'unverified'), { status: 'accepted', dasherId: 'dash', dasherName: 'D', acceptedAt: 1 }));
  await assertFails(updateDoc(doc(db('dash'), 'orders', 'pend'), { status: 'accepted', dasherId: 'dash2', dasherName: 'D', acceptedAt: 1 }));
  await assertFails(updateDoc(doc(db('dash'), 'orders', 'pend'), { status: 'accepted', dasherId: 'dash', dasherName: 'D', acceptedAt: 1, deliveryFee: 9999 }));
  await assertSucceeds(updateDoc(doc(db('dash'), 'orders', 'pend'), { status: 'accepted', dasherId: 'dash', dasherName: 'D', acceptedAt: 1 }));
});
test('second dasher cannot steal an accepted order', async () => {
  await assertFails(updateDoc(doc(db('dash2'), 'orders', 'mine'), { status: 'accepted', dasherId: 'dash2', dasherName: 'X', acceptedAt: 1 }));
  await assertFails(updateDoc(doc(db('dash2'), 'orders', 'mine'), { status: 'picking_up' }));
});
test('assigned dasher advances one step at a time', async () => {
  await assertFails(updateDoc(doc(db('dash'), 'orders', 'mine'), { status: 'delivered', deliveredAt: 1 }));
  await assertSucceeds(updateDoc(doc(db('dash'), 'orders', 'mine'), { status: 'picking_up' }));
  await assertSucceeds(updateDoc(doc(db('dash'), 'orders', 'mine'), { status: 'on_the_way' }));
  await assertSucceeds(updateDoc(doc(db('dash'), 'orders', 'mine'), { status: 'delivered', deliveredAt: 2 }));
  await assertFails(updateDoc(doc(db('dash'), 'orders', 'mine'), { status: 'pending' }));
});
test('nobody deletes orders from the app', async () => {
  await assertFails(deleteDoc(doc(db('boss'), 'orders', 'pend')));
  await assertFails(deleteDoc(doc(db('stu'), 'orders', 'pend')));
});
test('admin reads all orders and can cancel a stuck one', async () => {
  await assertSucceeds(getDocs(collection(db('boss'), 'orders')));
  await assertSucceeds(updateDoc(doc(db('boss'), 'orders', 'mine'), { status: 'cancelled', cancelledAt: 1, cancelReason: 'admin' }));
});

// ── Stores ────────────────────────────────────────────────────────────────
test('stores readable when signed in, writable only by admin', async () => {
  await assertSucceeds(getDoc(doc(db('stu'), 'stores', 'store1')));
  await assertFails(getDoc(doc(anon(), 'stores', 'store1')));
  await assertFails(updateDoc(doc(db('stu'), 'stores', 'store1'), { isOpen: false }));
  await assertFails(setDoc(doc(db('dash'), 'stores', 'store1', 'menuItems', 'm1'), { price: 1 }));
  await assertSucceeds(updateDoc(doc(db('boss'), 'stores', 'store1'), { isOpen: false }));
  await assertSucceeds(setDoc(doc(db('boss'), 'stores', 'store1', 'menuItems', 'm1'), { price: 100, name: 'Patty' }));
  await assertFails(setDoc(doc(db('boss'), 'stores', 'store1', 'menuItems', 'm2'), { price: -5, name: 'Bad' }));
});
test('unknown collections are closed', async () => {
  await assertFails(setDoc(doc(db('boss'), 'secrets', 'x'), { a: 1 }));
  await assertFails(getDoc(doc(db('stu'), 'notifications', 'x')));
});

// ── Payments ──────────────────────────────────────────────────────────────
test('order can carry a payment method, but only card or tokens', async () => {
  await assertSucceeds(addDoc(collection(db('stu'), 'orders'), { ...baseOrder, paymentMethod: 'tokens' }));
  await assertSucceeds(addDoc(collection(db('stu'), 'orders'), { ...baseOrder, paymentMethod: 'card' }));
  await assertFails(addDoc(collection(db('stu'), 'orders'), { ...baseOrder, paymentMethod: 'free' }));
  await assertFails(addDoc(collection(db('stu'), 'orders'), { ...baseOrder, paymentMethod: 'card', paymentStatus: 'paid' }));
});
test('dasher cannot start an unpaid card order', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'orders', 'unpaid'), { ...baseOrder, status: 'accepted', dasherId: 'dash', paymentMethod: 'card', paymentStatus: 'awaiting_payment' });
    await setDoc(doc(ctx.firestore(), 'orders', 'paidcard'), { ...baseOrder, status: 'accepted', dasherId: 'dash', paymentMethod: 'card', paymentStatus: 'paid' });
  });
  await assertFails(updateDoc(doc(db('dash'), 'orders', 'unpaid'), { status: 'picking_up' }));
  await assertSucceeds(updateDoc(doc(db('dash'), 'orders', 'paidcard'), { status: 'picking_up' }));
});
test('nobody can write balances or payments from the app', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'wallets', 'stu'), { balanceJmd: 500, reservedJmd: 0 });
    await setDoc(doc(ctx.firestore(), 'payments', 'p1'), { uid: 'stu', status: 'pending' });
  });
  await assertSucceeds(getDoc(doc(db('stu'), 'wallets', 'stu')));
  await assertFails(getDoc(doc(db('stu2'), 'wallets', 'stu')));
  await assertFails(setDoc(doc(db('stu'), 'wallets', 'stu'), { balanceJmd: 999999 }));
  await assertFails(setDoc(doc(db('boss'), 'wallets', 'stu'), { balanceJmd: 999999 }));
  await assertSucceeds(getDoc(doc(db('stu'), 'payments', 'p1')));
  await assertFails(updateDoc(doc(db('stu'), 'payments', 'p1'), { status: 'paid' }));
  await assertFails(updateDoc(doc(db('boss'), 'stores', 'store1'), { floatJmd: 100000 }));
});
test('store floats are admin-read-only and never on the public store doc', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'storeFloats', 'store1'), { storeId: 'store1', floatJmd: 5000 });
  });
  await assertFails(getDoc(doc(db('stu'), 'storeFloats', 'store1')));
  await assertFails(getDoc(doc(db('dash'), 'storeFloats', 'store1')));
  await assertSucceeds(getDoc(doc(db('boss'), 'storeFloats', 'store1')));
  await assertFails(setDoc(doc(db('boss'), 'storeFloats', 'store1'), { floatJmd: 999999 }));
  await assertFails(setDoc(doc(db('boss'), 'stores', 'store2'), {
    name: 'New', description: 'New store', deliveryFee: 100, rating: 5, isOpen: true, floatJmd: 5000,
  }));
  await assertSucceeds(setDoc(doc(db('boss'), 'stores', 'store2'), {
    name: 'New', description: 'New store', deliveryFee: 100, rating: 5, isOpen: true,
  }));
});

// ── Admin dashboard aggregations ─────────────────────────────────────────
test('admin dashboard aggregates users and orders; others cannot', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    await setDoc(doc(a, 'orders', 'd1'), { ...baseOrder, status: 'delivered', deliveryFee: 150, totalAmount: 900, deliveryMins: 20 });
    await setDoc(doc(a, 'orders', 'd2'), { ...baseOrder, status: 'delivered', deliveryFee: 250, totalAmount: 1100, deliveryMins: 30 });
  });
  const agg = await assertSucceeds(getAggregateFromServer(
    query(collection(db('boss'), 'orders'), where('status', '==', 'delivered')),
    { n: count(), revenue: sum('deliveryFee'), gmv: sum('totalAmount'), avgMins: average('deliveryMins') },
  ));
  const d = agg.data();
  if (d.n !== 2 || d.revenue !== 400 || d.gmv !== 2000 || d.avgMins !== 25) throw new Error('bad aggregate ' + JSON.stringify(d));
  await assertSucceeds(getAggregateFromServer(query(collection(db('boss'), 'users'), where('role', '==', 'student')), { n: count() }));
  await assertSucceeds(getAggregateFromServer(query(collection(db('boss'), 'orders'), where('createdAt', '>=', 0)), { n: count() }));
  await assertFails(getAggregateFromServer(collection(db('stu'), 'users'), { n: count() }));
  await assertFails(getAggregateFromServer(collection(db('stu'), 'orders'), { n: count() }));
  await assertFails(getAggregateFromServer(collection(db('dash'), 'orders'), { n: count() }));
});

// ── Bounded history queries (Orders tab, dasher Today / 30 days) ─────────
test('student pages own history and totals; not someone else\'s', async () => {
  await assertSucceeds(getDocs(query(collection(db('stu'), 'orders'),
    where('studentId', '==', 'stu'), orderBy('createdAt', 'desc'), limit(14))));
  await assertSucceeds(getAggregateFromServer(query(collection(db('stu'), 'orders'),
    where('studentId', '==', 'stu'), where('status', '==', 'delivered')), { n: count(), spent: sum('totalAmount') }));
  await assertSucceeds(getAggregateFromServer(query(collection(db('stu'), 'orders'),
    where('studentId', '==', 'stu'), where('status', 'in', ['delivered', 'cancelled'])), { n: count() }));
  await assertFails(getDocs(query(collection(db('stu2'), 'orders'),
    where('studentId', '==', 'stu'), orderBy('createdAt', 'desc'), limit(14))));
  await assertFails(getAggregateFromServer(query(collection(db('stu2'), 'orders'),
    where('studentId', '==', 'stu'), where('status', '==', 'delivered')), { n: count() }));
});
test('dasher reads own recent orders by acceptedAt; not another dasher\'s', async () => {
  await assertSucceeds(getDocs(query(collection(db('dash'), 'orders'),
    where('dasherId', '==', 'dash'), where('acceptedAt', '>=', 0), orderBy('acceptedAt', 'desc'))));
  await assertFails(getDocs(query(collection(db('dash2'), 'orders'),
    where('dasherId', '==', 'dash'), where('acceptedAt', '>=', 0), orderBy('acceptedAt', 'desc'))));
});

// ── Dasher order-list watchdog (hooks/useOrders usePendingOrders) ────────
test('dasher can count pending orders on the server; students cannot', async () => {
  const pending = (who) => query(collection(db(who), 'orders'), where('status', '==', 'pending'));
  await assertSucceeds(getAggregateFromServer(pending('dash'), { n: count() }));
  await assertFails(getAggregateFromServer(pending('stu'), { n: count() }));
  await assertFails(getAggregateFromServer(pending('banned'), { n: count() }));
});
