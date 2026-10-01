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

// Flyer style: a deep blue glass bar, the active tab in mustard gold.
const PALETTE = {
  glass: 'rgba(155, 27, 34, 0.92)',
  solid: T.color.sea,
  edge: 'rgba(242, 190, 69, 0.5)', // a fine gold edge
  highlight: 'rgba(245, 216, 206, 0.25)',
  active: T.color.mustard,
  activeText: T.color.ink,
  idle: T.color.seaSoft,
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
