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
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export const CERULEAN = '#0E8FB5';

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

export async function registerForPushNotifications(uid: string): Promise<string | null> {
  try {
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
    await updateDoc(doc(db, 'users', uid), {
      pushToken: null,
      pushTokenUpdatedAt: Date.now(),
    });
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
