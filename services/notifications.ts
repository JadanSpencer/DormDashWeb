// services/notifications.ts
// DormDash push notifications.
//
// Changes from the previous version:
//   • Dropped the deprecated `shouldShowAlert` key.
//   • System banners are SUPPRESSED while the app is open — we render our own
//     cerulean in-app banner instead (components/NotificationBanner.tsx).
//   • Android notification channel created explicitly with the DormDash
//     cerulean as its accent/light colour.
//   • clearPushToken(uid): call on sign-out. Without this, the device token
//     stays attached to the previous account, and the next person to sign in
//     on that phone receives the previous user's notifications.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export const CERULEAN = '#A91F1D';

// While the app is in the foreground we handle presentation ourselves.
// shouldShowBanner:false stops the OS banner from covering our UI; the
// notification still lands in the tray and still fires our listeners.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: false,
    shouldShowList: true,
  }),
});

// Android requires a channel before anything is delivered. The channel owns
// the accent colour, the light, and the importance level.
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Order updates',
    description: 'Order status, new deliveries, and account alerts',
    importance: Notifications.AndroidImportance.MAX,
    lightColor: CERULEAN,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
}

// The token this phone last saved, so sign-out only detaches THIS phone.
let myToken: string | null = null;

export async function registerForPushNotifications(uid: string): Promise<string | null> {
  try {

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#A91F1D',
      });
    }

    await ensureAndroidChannel();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permission not granted');
      return null;
    }

    const token = (await Notifications.getExpoPushTokenAsync({
      projectId: '18c72c59-4aeb-40ed-80d8-56715d0c010b',
    })).data;

    myToken = token;
    await updateDoc(doc(db, 'users', uid), {
      pushToken: token,
      pushTokenUpdatedAt: Date.now(),
    });

    return token;
  } catch (err: any) {
    // Fail quietly — a missing push token must never block sign-in.
    console.log('Push registration failed:', err?.message);
    return null;
  }
}

// Call this BEFORE signing out. Detaches this device from the account so the
// next person to use the phone doesn't inherit their notifications.
export async function clearPushToken(uid: string): Promise<void> {
  try {
    if (!myToken) return;
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    // Only detach if the account still points at this phone.
    if (snap.data()?.pushToken === myToken) {
      await updateDoc(ref, { pushToken: null, pushTokenUpdatedAt: Date.now() });
    }
  } catch {
    // Non-fatal: sign-out proceeds regardless.
  }
}

export async function sendLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
}

export function setupNotificationListeners(
  onNotification?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) {
  const notificationListener = Notifications.addNotificationReceivedListener(
    (notification) => { onNotification?.(notification); }
  );

  const responseListener = Notifications.addNotificationResponseReceivedListener(
    (response) => { onNotificationResponse?.(response); }
  );

  return () => {
    notificationListener.remove();
    responseListener.remove();
  };
}

// ─── Web-only helpers (see services/notifications.web.ts) ─────────────────
// Native registers for push on sign-in, so these are inert here. They exist
// so shared components can import the same names on every platform.
export async function webPushPermission(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  return 'unsupported';
}
export async function enableWebPush(_uid: string): Promise<boolean> {
  return false;
}
export function requestPushPermissionFromGesture(): void {}
