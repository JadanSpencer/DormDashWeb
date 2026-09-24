// app/(dasher)/_layout.tsx
// Dasher tabs (dark theme). The bar lives in components/GlassTabBar.tsx.

import { Tabs } from 'expo-router';
import { GlassTabBar } from '../../components/GlassTabBar';
import { D } from '../../constants/themeDark';

const TABS = {
  dash: { icon: 'bicycle-outline', iconActive: 'bicycle', label: 'Dash' },
  account: { icon: 'person-outline', iconActive: 'person', label: 'Profile' },
};

const PALETTE = {
  glass: 'rgba(22, 52, 60, 0.72)',
  solid: D.color.card,
  edge: D.color.lineStrong,
  highlight: 'rgba(250, 245, 236, 0.12)',
  active: D.color.teal,
  activeText: D.color.bg,
  idle: D.color.creamSoft,
};

export default function DasherLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
        sceneStyle: { backgroundColor: D.color.bg },
      }}
      tabBar={(props) => <GlassTabBar {...props} tabs={TABS} palette={PALETTE} />}
    >
      <Tabs.Screen name="dash" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
