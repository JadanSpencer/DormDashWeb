import { onDocumentWritten, onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { formatJMD } from '../../constants';


admin.initializeApp();

const db = admin.firestore();

// ─── HELPER: SEND PUSH NOTIFICATION ────────────────────────────────────────
async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  const message = {
    to: token,
    sound: 'default',
    title,
    body,
    data: data ?? {},
  };

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(message),
  });
}

// ─── HELPER: GET USER PUSH TOKEN ───────────────────────────────────────────
async function getUserToken(uid: string): Promise<string | null> {
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) return null;
  return userDoc.data()?.pushToken ?? null;
}

// ─── HELPER: GET ONLINE DASHER TOKENS ──────────────────────────────────────
// Only dashers currently on shift (isOnline) with a fresh heartbeat.
async function getOnlineDasherTokens(): Promise<string[]> {
  const TEN_MIN = 10 * 60 * 1000;

  const onlineSnap = await db.collection('dashers')
    .where('isOnline', '==', true)
    .get();

  if (onlineSnap.empty) return [];

  const tokenPromises = onlineSnap.docs.map(async (dasherDoc) => {
    const dasherData = dasherDoc.data();

    // Stale flag: phone likely died with the toggle on
    if (dasherData.lastSeenAt && Date.now() - dasherData.lastSeenAt > TEN_MIN) {
      return null;
    }

    // Tokens live on the user doc; also respect admin deactivation
    const userSnap = await db.collection('users').doc(dasherDoc.id).get();
    const userData = userSnap.data();
    if (userData && userData.isActive && userData.pushToken) {
      return userData.pushToken as string;
    }
    return null;
  });

  return (await Promise.all(tokenPromises)).filter(
    (t): t is string => t !== null
  );
}

// ─── TRIGGER: ORDER STATUS CHANGED ─────────────────────────────────────────
export const onOrderStatusChanged = onDocumentWritten(
  'orders/{orderId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const orderId = event.params.orderId;

    if (!after) return;

    const statusChanged = !before || before.status !== after.status;
    const isNewOrder = !before && after.status === 'pending';

    // ── NEW ORDER PLACED ──────────────────────────────────────────────
    if (isNewOrder) {
      const dasherTokens = await getOnlineDasherTokens();

      if (dasherTokens.length === 0) {
        logger.info(`Order ${orderId}: no dashers online — no notifications sent.`);
        return;
      }

      const notifications = dasherTokens.map(token =>
        sendPushNotification(
          token,
          '🛵 New Order Available!',
          `Order from ${after.storeName} — $${formatJMD(Number(after.totalAmount))}`,
          { screen: '/(dasher)/home', orderId }
        )
      );
      await Promise.all(notifications);
      logger.info(`Notified ${dasherTokens.length} online dashers of new order`);
      return;
    }

    if (!statusChanged) return;

    const studentId: string = after.studentId;
    const dasherId: string | undefined = after.dasherId;

    // ── ORDER ACCEPTED ────────────────────────────────────────────────
    if (after.status === 'accepted') {
      const token = await getUserToken(studentId);
      if (token) {
        await sendPushNotification(
          token,
          '✅ Dasher Assigned!',
          `${after.dasherName} accepted your order and is heading to ${after.storeName}`,
          { screen: `/(student)/order/${orderId}` }
        );
      }
    }

    // ── PICKING UP ────────────────────────────────────────────────────
    if (after.status === 'picking_up') {
      const token = await getUserToken(studentId);
      if (token) {
        await sendPushNotification(
          token,
          '🏪 Picking Up Your Order',
          `${after.dasherName} is at ${after.storeName} collecting your items`,
          { screen: `/(student)/order/${orderId}` }
        );
      }
    }

    // ── ON THE WAY ────────────────────────────────────────────────────
    if (after.status === 'on_the_way') {
      const token = await getUserToken(studentId);
      if (token) {
        await sendPushNotification(
          token,
          '⚡ Order On The Way!',
          `${after.dasherName} is heading to you. Get ready!`,
          { screen: `/(student)/order/${orderId}` }
        );
      }
    }

    // ── DELIVERED ─────────────────────────────────────────────────────────
    if (after.status === 'delivered') {
      // Never re-process a status the order was already in
    if (before && before.status === after.status) return;
      // Credit the dasher — server-side only, clients cannot touch these fields.
      // Launch policy: dasher keeps 100% of the delivery fee.
      if (dasherId) {
        const deliveryFee = Number(after.deliveryFee) || 0;
        await db.collection('dashers').doc(dasherId).update({
          totalDeliveries: admin.firestore.FieldValue.increment(1),
          totalEarnings: admin.firestore.FieldValue.increment(deliveryFee),
        });
        logger.info(`Credited dasher ${dasherId}: +1 delivery, +$${deliveryFee}`);
      }

      const token = await getUserToken(studentId);
      if (token) {
        await sendPushNotification(
          token,
          '🎉 Order Delivered!',
          `Your order from ${after.storeName} has been delivered. Enjoy!`,
          { screen: `/(student)/order/${orderId}` }
        );
      }
    }

    // ── CANCELLED ─────────────────────────────────────────────────────
    if (after.status === 'cancelled') {
      const studentToken = await getUserToken(studentId);
      if (studentToken) {
        await sendPushNotification(
          studentToken,
          '❌ Order Cancelled',
          `Your order from ${after.storeName} has been cancelled.`,
          { screen: '/(student)/(tabs)/home' }
        );
      }

      if (dasherId) {
        const dasherToken = await getUserToken(dasherId);
        if (dasherToken) {
          await sendPushNotification(
            dasherToken,
            '❌ Order Cancelled',
            `The order from ${after.storeName} was cancelled by the student.`,
            { screen: '/(dasher)/home' }
          );
        }
      }
    }
  }
);

// ─── TRIGGER: NEW USER REGISTERED ──────────────────────────────────────────
export const onNewUserRegistered = onDocumentCreated(
  'users/{userId}',
  async (event) => {
    const user = event.data?.data();
    if (!user) return;

    const adminSnapshot = await db.collection('users')
      .where('role', '==', 'admin')
      .get();

    const notifications: Promise<void>[] = [];
    adminSnapshot.forEach(doc => {
      const token = doc.data().pushToken;
      if (token) {
        notifications.push(
          sendPushNotification(
            token,
            '👤 New User Joined',
            `${user.name} registered as a ${user.role}`,
            { screen: '/(admin)/(tabs)/users' }
          )
        );
      }
    });

    await Promise.all(notifications);
  }
);