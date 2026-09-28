// app/_layout.tsx
// Root shell: auth provider, splash gating, notification wiring, route guard.
//
// THE FIX THAT MATTERS HERE:
// RouteGuard used to redirect the moment auth resolved — including while the
// launch animation on app/index.tsx was still playing. Firebase often resolves
// in a few hundred milliseconds, so the splash was yanked away almost
// immediately: the "glitches by too fast" problem.
// Now the guard ignores the index route entirely (segments.length === 0) and
// lets app/index.tsx do its own routing. The guard still protects every
// other route exactly as before. The intro itself is drawn over everything
// by <IntroLayer> below, on every load.

import React, { useEffect, useRef, useState } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { T, FONT } from '../constants/theme';
import { registerForPushNotifications, setupNotificationListeners } from '../services/notifications';
import { NotificationBanner, BannerHandle } from '../components/NotificationBanner';
import { InstallPrompt } from '../components/InstallPrompt';
import { BrandIntro, shouldSkipIntro } from '../components/BrandIntro';
import { DDAlertHost } from '../components/DDAlertHost';
import { installWebAlert } from '../services/webAlert';
import { syncServerClock } from '../services/serverClock';
import { installLiveSync, resyncLiveData } from '../services/liveSync';
import { Backdrop } from '../components/Backdrop';

// Web/PWA only: make Alert.alert work in the browser (no-op on native).
installWebAlert();
// Web/PWA: measure how wrong this device's clock is (see services/serverClock).
syncServerClock();
// Reconnect Firestore's live data on foreground / back online / push, so
// lists can't silently freeze on phones (see services/liveSync).
installLiveSync();

// Hold the native splash until React is mounted and auth has resolved, so
// there is never a blank frame between the OS splash and our own.
SplashScreen.preventAutoHideAsync().catch(() => {});

function RouteGuard({ introDone }: { introDone: boolean }) {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const bannerRef = useRef<BannerHandle>(null);

  // Hide the native splash as soon as auth is known — app/index.tsx takes over.
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  useEffect(() => {
    if (loading) return;

    // On the launch screen? Leave it alone. index.tsx routes when it's done.
    const onSplash = (segments as string[]).length === 0;
    if (onSplash) return;

    // Privacy Policy and Terms must open for everyone, signed in or not.
    if ((segments[0] as string) === 'legal') return;

    const inAuthGroup    = segments[0] === '(auth)';
    const inStudentGroup = segments[0] === '(student)';
    const inDasherGroup  = segments[0] === '(dasher)';
    const inAdminGroup   = segments[0] === '(admin)';

    if (!user) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    if (user.role === 'student' && !inStudentGroup) {
      router.replace('/(student)/(tabs)/home');
    } else if (user.role === 'dasher' && !inDasherGroup) {
      router.replace('/(dasher)/dash');
    } else if (user.role === 'admin' && !inAdminGroup) {
      router.replace('/(admin)/(tabs)/dashboard');
    }
  }, [user, loading, segments]);

  // Register this device for push once we know who is signed in.
  useEffect(() => {
    if (user) registerForPushNotifications(user.uid);
  }, [user]);

  // Foreground notifications render as our own cerulean banner.
  useEffect(() => {
    const cleanup = setupNotificationListeners(
      (notification) => {
        // A push means the server just changed something for this user.
        resyncLiveData('push');
        const { title, body, data } = notification.request.content;
        bannerRef.current?.show({
          title: title ?? 'DormDash',
          body: body ?? '',
          onPress: () => { if (data?.screen) router.push(data.screen as any); },
        });
      },
      (response) => {
        resyncLiveData('push');
        const data = response.notification.request.content.data;
        if (data?.screen) router.push(data.screen as any);
      }
    );
    return cleanup;
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: T.color.cream }}>
        <Backdrop tone="cream" />
        <ActivityIndicator size="large" color={T.color.cerulean} />
      </View>
    );
  }

  return (
    <>
      <NotificationBanner ref={bannerRef} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: T.color.cream },
        }}
      />
      {/* Wait for the intro to finish so the install card never covers it. */}
      {introDone && <InstallPrompt uid={user?.uid ?? null} role={user?.role} />}
    </>
  );
}

// The Jcommerce & Tech → DormDash intro plays over the app on every load
// (see components/BrandIntro.tsx). On phones it starts once the native
// splash is gone, i.e. when sign-in is known.
function IntroLayer({ onDone }: { onDone: () => void }) {
  const { loading } = useAuth();
  return <BrandIntro canStart={!loading} onDone={onDone} />;
}

export default function RootLayout() {
  const [introDone, setIntroDone] = useState(() => shouldSkipIntro());
  // Heading and seal fonts (assets/fonts, OFL). Wait for them behind the
  // splash so headings never flash in the system font; if loading fails,
  // carry on with system fonts rather than blocking the app.
  const [fontsLoaded, fontError] = useFonts({
    [FONT.heading]: require('../assets/fonts/ShipporiMinchoB1-ExtraBold.latin.ttf'),
    [FONT.seal]: require('../assets/fonts/YujiSyuku-Seal.ttf'),
  });
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: T.color.cream }}><Backdrop tone="cream" /></View>;
  }
  return (
    <AuthProvider>
      <View style={{ flex: 1 }}>
        <RouteGuard introDone={introDone} />
        {!introDone && <IntroLayer onDone={() => setIntroDone(true)} />}
        {/* DormDash pop-up for Alert.alert on the web (services/webAlert.web.ts). */}
        <DDAlertHost />
      </View>
    </AuthProvider>
  );
}
