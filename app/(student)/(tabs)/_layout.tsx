// app/(student)/(tabs)/_layout.tsx
// DormDash — Student tab bar (Route identity).
//
// GONE: the flat cerulean footer with yellow highlight.
// NEW: a floating cream tab bar with soft shadows, cerulean active pill,
// larger tap targets, subtle motion. Same three tabs — Home, Orders,
// Profile — same routing.

import { Tabs } from 'expo-router';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { T } from '../../../constants/theme';

const TAB_ICONS = {
  home: { active: 'home', inactive: 'home-outline' },
  orders: { active: 'receipt', inactive: 'receipt-outline' },
  profile: { active: 'person', inactive: 'person-outline' },
} as const;

const TAB_LABELS = { home: 'Home', orders: 'Orders', profile: 'Profile' } as const;

export default function StudentTabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          // Kill the default look — we render our own bar via tabBar.
          display: 'none',
        },
      }}
      tabBar={({ state, navigation }) => (
        <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.bar}>
            {state.routes.map((route, index) => {
              const key = route.name as keyof typeof TAB_ICONS;
              const icons = TAB_ICONS[key];
              const label = TAB_LABELS[key];
              if (!icons) return null;

              const focused = state.index === index;

              return (
                <Pressable
                  key={route.key}
                  onPress={() => {
                    const event = navigation.emit({
                      type: 'tabPress',
                      target: route.key,
                      canPreventDefault: true,
                    });
                    if (!focused && !event.defaultPrevented) {
                      navigation.navigate(route.name as any);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.item,
                    focused && styles.itemActive,
                    pressed && !focused && { transform: [{ scale: 0.94 }] },
                  ]}
                >
                  <Ionicons
                    name={focused ? icons.active : icons.inactive}
                    size={focused ? 22 : 20}
                    color={focused ? T.color.card : T.color.inkSoft}
                  />
                  {focused && (
                    <Text style={styles.label} numberOfLines={1}>
                      {label}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: T.space.lg,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: T.color.card,
    borderRadius: T.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: T.color.line,
    // Elevation — the bar floats over the surface
    shadowColor: '#12333B',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 12,
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: T.radius.pill,
    gap: 8,
    minHeight: 46,
  },
  itemActive: {
    backgroundColor: T.color.cerulean,
    ...({
      shadowColor: T.color.cerulean,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 5,
    }),
  },
  label: {
    color: T.color.card,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
