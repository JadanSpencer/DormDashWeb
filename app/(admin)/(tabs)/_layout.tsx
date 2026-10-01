// app/(admin)/(tabs)/_layout.tsx
// Admin tabs on the slate canvas. The bar lives in components/GlassTabBar.tsx.

import { Tabs } from 'expo-router';
import { GlassTabBar } from '../../../components/GlassTabBar';
import { S } from '../../../constants/themeMid';

const TABS = {
  dashboard: { icon: 'grid-outline', iconActive: 'grid', label: 'Board' },
  stores: { icon: 'storefront-outline', iconActive: 'storefront', label: 'Stores' },
  users: { icon: 'people-outline', iconActive: 'people', label: 'Users' },
};

const PALETTE = {
  glass: 'rgba(250, 245, 236, 0.78)',
  solid: S.color.card,
  edge: 'rgba(240, 194, 79, 0.45)', // a fine gold edge
  highlight: 'rgba(255, 255, 255, 0.85)',
  active: S.color.cerulean,
  activeText: '#FFFDF8',
  idle: S.color.inkSoft,
};

export default function AdminTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
        sceneStyle: { backgroundColor: S.color.bg },
      }}
      tabBar={(props) => <GlassTabBar {...props} tabs={TABS} palette={PALETTE} />}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="stores" />
      <Tabs.Screen name="users" />
    </Tabs>
  );
}
