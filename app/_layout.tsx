// app/_layout.tsx
// Root shell: auth provider, splash gating, notification wiring, route guard.
//
// THE FIX THAT MATTERS HERE:
// RouteGuard used to redirect the moment auth resolved — including while the
// launch animation on app/index.tsx was still playing. Firebase often resolves
// in a few hundred milliseconds, so the splash was yanked away almost
// immediately: the "glitches by too fast" problem.
// Now the guard ignores the index route entirely (segments.length === 0) and
// lets app/index.tsx finish its sequence and do its own routing. The guard
// still protects every other route exactly as before.

import React, { useEffect, useRef } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { T } from '../constants/theme';
import { registerForPushNotifications, setupNotificationListeners } from '../services/notifications';
import { NotificationBanner, BannerHandle } from '../components/NotificationBanner';

// Hold the native splash until React is mounted and auth has resolved, so
// there is never a blank frame between the OS splash and our own.
SplashScreen.preventAutoHideAsync().catch(() => {});

function RouteGuard() {
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
    const onSplash = segments.length === 0;
    if (onSplash) return;

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
      router.replace('/(dasher)/home');
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
        const { title, body, data } = notification.request.content;
        bannerRef.current?.show({
          title: title ?? 'DormDash',
          body: body ?? '',
          onPress: () => { if (data?.screen) router.push(data.screen as any); },
        });
      },
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.screen) router.push(data.screen as any);
      }
    );
    return cleanup;
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: T.color.cream }}>
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
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RouteGuard />
    </AuthProvider>
  );
}
