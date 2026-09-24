// app/(student)/(tabs)/_layout.tsx
// Student tabs. The bar itself lives in components/GlassTabBar.tsx.

import { Tabs } from 'expo-router';
import { GlassTabBar } from '../../../components/GlassTabBar';
import { T } from '../../../constants/theme';

const TABS = {
  home: { icon: 'home-outline', iconActive: 'home', label: 'Home' },
  orders: { icon: 'receipt-outline', iconActive: 'receipt', label: 'Orders' },
  profile: { icon: 'person-outline', iconActive: 'person', label: 'Profile' },
};

const PALETTE = {
  glass: 'rgba(255, 253, 248, 0.72)',
  solid: T.color.card,
  edge: T.color.line,
  highlight: 'rgba(255, 255, 255, 0.9)',
  active: T.color.cerulean,
  activeText: '#FFFDF8',
  idle: T.color.inkSoft,
};

export default function StudentTabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}
      tabBar={(props) => <GlassTabBar {...props} tabs={TABS} palette={PALETTE} />}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
