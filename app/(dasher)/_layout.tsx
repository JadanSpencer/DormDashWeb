// app/(dasher)/_layout.tsx
// Dasher shell — was a bare Stack; now Tabs with the floating pill bar in
// the inverted (dark) Route identity. Two tabs: Dash (work surface) and
// Profile (stats, history, account). Route '/(dasher)/home' still resolves
// for notification deep links.

import { Tabs } from 'expo-router';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { D } from '../../constants/themeDark';

const TAB_ICONS = {
  home:    { active: 'bicycle',        inactive: 'bicycle-outline' },
  profile: { active: 'person',         inactive: 'person-outline' },
} as const;

const TAB_LABELS = { home: 'Dash', profile: 'Profile' } as const;

export default function DasherLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
        sceneStyle: { backgroundColor: D.color.bg },
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
                    color={focused ? D.color.bg : D.color.creamSoft}
                  />
                  {focused && (
                    <Text style={styles.label} numberOfLines={1}>{label}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: D.space.lg,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: D.color.card,
    borderRadius: D.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: D.color.line,
    ...D.shadow.card,
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: D.radius.pill,
    gap: 8,
    minHeight: 46,
  },
  itemActive: {
    backgroundColor: D.color.teal,
  },
  label: {
    color: D.color.bg,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
