// app/(admin)/(tabs)/_layout.tsx
// Admin shell — floating cream tab bar on the slate canvas.
// Same three tabs: dashboard, stores, users. Routing unchanged.

import { Tabs } from 'expo-router';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { S } from '../../../constants/themeMid';

const TAB_ICONS = {
  dashboard: { active: 'grid',           inactive: 'grid-outline' },
  stores:    { active: 'storefront',     inactive: 'storefront-outline' },
  users:     { active: 'people',         inactive: 'people-outline' },
} as const;

const TAB_LABELS = { dashboard: 'Board', stores: 'Stores', users: 'Users' } as const;

export default function AdminTabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
        sceneStyle: { backgroundColor: S.color.bg },
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
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) navigation.navigate(route.name as any);
                  }}
                  style={({ pressed }) => [
                    styles.item,
                    focused && styles.itemActive,
                    pressed && !focused && { transform: [{ scale: 0.94 }] },
                  ]}
                >
                  <Ionicons
                    name={focused ? icons.active : icons.inactive}
                    size={focused ? 21 : 19}
                    color={focused ? S.color.card : S.color.inkSoft}
                  />
                  {focused && <Text style={styles.label} numberOfLines={1}>{label}</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="stores" />
      <Tabs.Screen name="users" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: S.space.lg, paddingTop: 8,
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: S.color.card,
    borderRadius: S.radius.pill,
    paddingHorizontal: 6, paddingVertical: 6, gap: 4,
    borderWidth: 1, borderColor: S.color.lineOnCard,
    ...S.shadow.card,
  },
  item: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: S.radius.pill, gap: 8, minHeight: 44,
  },
  itemActive: { backgroundColor: S.color.cerulean },
  label: { color: S.color.card, fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
});
