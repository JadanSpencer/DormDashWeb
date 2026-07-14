import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { View, ActivityIndicator, Alert } from 'react-native';
import { COLORS } from '../constants';
import { registerForPushNotifications, setupNotificationListeners } from '../services/notifications';

function RouteGuard() {
  const { user, loading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inStudentGroup = segments[0] === '(student)';
    const inDasherGroup = segments[0] === '(dasher)';
    const inAdminGroup = segments[0] === '(admin)';

    if (!user) {
      if (!inAuthGroup) router.replace('/(auth)/login');
    } else {
      if (user.role === 'student' && !inStudentGroup) {
        router.replace('/(student)/(tabs)/home');
      } else if (user.role === 'dasher' && !inDasherGroup) {
        router.replace('/(dasher)/home');
      } else if (user.role === 'admin' && !inAdminGroup) {
        router.replace('/(admin)/(tabs)/dashboard');
      }
    }
  }, [user, loading, segments]);

  useEffect(() => {
    if (user) {
      registerForPushNotifications(user.uid);
    }
  }, [user]);

  // Set up notification listeners
  useEffect(() => {
    const cleanup = setupNotificationListeners(
      (notification) => {
        console.log('Notification received:', notification);
      },
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.screen) {
          router.push(data.screen as any);
        }
      }
    );
    return cleanup;
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RouteGuard />
    </AuthProvider>
  );
}