// app/(admin)/(tabs)/users.tsx
// View all users. Admins can deactivate (soft-ban) any account.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, onSnapshot, updateDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { User } from '../../../types';
import { SPACING } from '../../../constants';

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'dasher' | 'admin'>('all');

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as User)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleToggleActive = (user: User) => {
    const action = user.isActive ? 'Deactivate' : 'Reactivate';
    const message = user.isActive
      ? `${user.name} will be blocked from logging in.`
      : `${user.name} will be able to log in again.`;

    Alert.alert(action + ' Account', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: user.isActive ? 'destructive' : 'default',
        onPress: async () => {
          await updateDoc(doc(db, 'users', user.uid), { isActive: !user.isActive });
        },
      },
    ]);
  };

  const filtered = users.filter(u => {
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const matchSearch = u.name?.toLowerCase().includes(search.toLowerCase()) ||
                        u.email?.toLowerCase().includes(search.toLowerCase());
    return matchRole && matchSearch;
  });

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'student': return '#3B82F6';
      case 'dasher': return '#00FF88';
      case 'admin': return '#FF4444';
      default: return '#666666';
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name.charAt(0).toUpperCase();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Users</Text>
          <Text style={styles.subtitle}>{users.length} registered</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="search by name or email"
          placeholderTextColor="#444444"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {(['all', 'student', 'dasher', 'admin'] as const).map(role => (
          <TouchableOpacity
            key={role}
            style={[styles.filterChip, roleFilter === role && styles.filterChipActive]}
            onPress={() => setRoleFilter(role)}
          >
            <Text style={[styles.filterText, roleFilter === role && styles.filterTextActive]}>
              {role === 'all' ? 'all' : role}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color="#3B82F6" size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.uid}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyNumber}>00</Text>
              <Text style={styles.emptyText}>no users found</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={[styles.userCard, !item.isActive && styles.userCardInactive]}>
              <View style={styles.cardHeader}>
                <Text style={styles.userNumber}>{(index + 1).toString().padStart(2, '0')}</Text>
                <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) + '22' }]}>
                  <Text style={[styles.roleText, { color: getRoleColor(item.role) }]}>{item.role}</Text>
                </View>
                {!item.isActive && (
                  <View style={styles.bannedBadge}>
                    <Text style={styles.bannedText}>banned</Text>
                  </View>
                )}
              </View>

              <View style={styles.userInfo}>
                <View style={[styles.avatar, { backgroundColor: getRoleColor(item.role) + '33' }]}>
                  <Text style={[styles.avatarText, { color: getRoleColor(item.role) }]}>
                    {getInitials(item.name)}
                  </Text>
                </View>
                <View style={styles.userDetails}>
                  <Text style={styles.userName}>{item.name || 'Unknown'}</Text>
                  <Text style={styles.userEmail}>{item.email}</Text>
                  <Text style={styles.userUni}>{item.university || 'No university listed'}</Text>
                </View>
              </View>

              <View style={styles.userMeta}>
                <Text style={styles.metaText}>{item.phone || 'No phone'}</Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText}>
                  joined {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'recently'}
                </Text>
              </View>

              {item.role !== 'admin' && (
                <TouchableOpacity
                  style={[styles.actionBtn, item.isActive ? styles.deactivateBtn : styles.reactivateBtn]}
                  onPress={() => handleToggleActive(item)}
                >
                  <Text style={[styles.actionBtnText, { color: item.isActive ? '#FF4444' : '#00FF88' }]}>
                    {item.isActive ? 'deactivate' : 'reactivate'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    height: 44,
  },
  searchIcon: {
    fontSize: 14,
    color: '#666666',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  filterChipActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#3B82F622',
  },
  filterText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666666',
    textTransform: 'lowercase',
  },
  filterTextActive: {
    color: '#3B82F6',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 100,
    gap: SPACING.md,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: SPACING.sm,
  },
  emptyNumber: {
    fontSize: 40,
    fontWeight: '700',
    color: '#2A2A2A',
    letterSpacing: -1,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666666',
  },
  userCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 12,
  },
  userCardInactive: {
    opacity: 0.5,
    borderColor: '#FF444422',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userNumber: {
    fontSize: 11,
    fontWeight: '500',
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  bannedBadge: {
    backgroundColor: '#FF444422',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  bannedText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#FF4444',
    textTransform: 'uppercase',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 11,
    color: '#888888',
    marginBottom: 2,
  },
  userUni: {
    fontSize: 10,
    color: '#555555',
  },
  userMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
  },
  metaText: {
    fontSize: 10,
    color: '#555555',
  },
  metaDot: {
    fontSize: 10,
    color: '#333333',
  },
  actionBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  deactivateBtn: {
    backgroundColor: '#FF444422',
    borderColor: '#FF444444',
  },
  reactivateBtn: {
    backgroundColor: '#00FF8822',
    borderColor: '#00FF8844',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'lowercase',
  },
});