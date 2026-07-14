// app/(admin)/(tabs)/_layout.tsx - Bolder version
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={styles.tabBlock}>
      <View style={[styles.numberBadge, focused && styles.numberBadgeActive]}>
        <Text style={[styles.number, focused && styles.numberActive]}>
          {label === 'Overview' ? '01' : label === 'Stores' ? '02' : '03'}
        </Text>
      </View>
      <Text style={[styles.tabName, focused && styles.tabNameActive]}>{label}</Text>
      {focused && <View style={styles.dot} />}
    </View>
  );
}

export default function AdminTabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopWidth: 0,
          height: 72 + insets.bottom,
          paddingBottom: insets.bottom + 12,
          paddingTop: 12,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Overview" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="stores"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Stores" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Users" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 85,
  },
  numberBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  numberBadgeActive: {
    backgroundColor: '#111111',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  number: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333333',
    letterSpacing: 0.8,
  },
  numberActive: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  tabName: {
    fontSize: 10,
    fontWeight: '500',
    color: '#444444',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  tabNameActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3B82F6',
    marginTop: 2,
  },
});