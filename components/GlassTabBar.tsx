// components/GlassTabBar.tsx
// One floating tab bar for all three roles (student, dasher, admin).
// Replaces three copy-pasted bars that had drifted apart.
//
// Look: "liquid glass". On web the bar is translucent with a backdrop blur,
// so content scrolls visibly underneath it, plus a 1px highlight on the top
// edge. Native keeps a solid surface (a real blur needs expo-blur / iOS 26
// glass, which can be added later without changing callers).
// No drop shadow: the glass edge and the blur separate it from the page.
//
// Accessibility: each tab is role="tab" with its label, so screen readers
// (and automated tests) can find tabs even when only the icon shows.

import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TabIcon, hasTabIcon } from './TabIcon';

export type TabSpec = { icon: string; iconActive: string; label: string };

export type GlassPalette = {
  glass: string;        // translucent bar fill (web)
  solid: string;        // bar fill (native)
  edge: string;         // hairline border
  highlight: string;    // top-edge light line (web)
  active: string;       // active pill fill
  activeText: string;   // icon + label on the active pill
  idle: string;         // inactive icon colour
};

export function GlassTabBar({
  state, navigation, tabs, palette,
}: {
  state: any; navigation: any;
  tabs: Record<string, TabSpec>;
  palette: GlassPalette;
}) {
  const insets = useSafeAreaInsets();
  const web = Platform.OS === 'web';

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View
        accessibilityRole="tablist"
        style={[
          styles.bar,
          { borderColor: palette.edge, backgroundColor: web ? palette.glass : palette.solid },
          web && ({
            backdropFilter: 'blur(18px) saturate(170%)',
            WebkitBackdropFilter: 'blur(18px) saturate(170%)',
            boxShadow: `inset 0 1px 0 ${palette.highlight}`,
          } as any),
        ]}
      >
        {state.routes.map((route: any, index: number) => {
          const tab = tabs[route.name];
          if (!tab) return null;
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={({ pressed }) => [
                styles.item,
                focused && { backgroundColor: palette.active },
                pressed && !focused && { transform: [{ scale: 0.95 }] },
              ]}
            >
              {hasTabIcon(focused ? tab.iconActive : tab.icon) ? (
                <TabIcon
                  name={focused ? tab.iconActive : tab.icon}
                  size={21}
                  color={focused ? palette.activeText : palette.idle}
                />
              ) : (
                <Ionicons
                  name={(focused ? tab.iconActive : tab.icon) as any}
                  size={21}
                  color={focused ? palette.activeText : palette.idle}
                />
              )}
              {focused && (
                <Text style={[styles.label, { color: palette.activeText }]} numberOfLines={1}>
                  {tab.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 8,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    width: '100%', maxWidth: 440,
    borderRadius: 999,
    padding: 6, gap: 4,
    borderWidth: 1,
  },
  item: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 46, paddingVertical: 12, borderRadius: 999, gap: 8,
  },
  label: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
});
