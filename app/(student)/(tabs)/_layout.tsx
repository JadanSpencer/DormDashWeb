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

// Tide Print: a sea-glass bar, the active tab a teal plate.
const PALETTE = {
  glass: 'rgba(11, 60, 90, 0.9)',
  solid: T.color.sea,
  edge: 'rgba(127, 214, 200, 0.28)',
  highlight: 'rgba(169, 211, 230, 0.25)',
  active: T.color.teal,
  activeText: T.color.card,
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
