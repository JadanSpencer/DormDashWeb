// app/index.tsx
// The launch route. The intro animation itself now lives in
// components/BrandIntro.tsx and is drawn over the whole app by
// app/_layout.tsx on every load, whatever page the app opens on.
//
// This screen only decides where to send you, as soon as sign-in is known.
// It happens underneath the intro, so when the intro fades the right screen
// is already showing.
//
// RouteGuard in _layout.tsx still leaves the index route alone and lets this
// screen do the routing.

import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { T } from '../constants/theme';

export default function Index() {
  const { user, loading } = useAuth();
  const routed = useRef(false);

  useEffect(() => {
    if (loading || routed.current) return;
    // Wait one tick so the navigator has finished mounting.
    const t = setTimeout(() => {
      if (routed.current) return;
      routed.current = true;
      if (!user) {
        router.replace('/(auth)/login');
      } else if (user.role === 'dasher') {
        router.replace('/(dasher)/dash');
      } else if (user.role === 'admin') {
        router.replace('/(admin)/(tabs)/dashboard');
      } else {
        router.replace('/(student)/(tabs)/home');
      }
    }, 50);
    return () => clearTimeout(t);
  }, [loading, user]);

  return <View style={{ flex: 1, backgroundColor: T.color.cream }} />;
}
