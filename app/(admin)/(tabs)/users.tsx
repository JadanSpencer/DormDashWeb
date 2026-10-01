// app/(admin)/(tabs)/users.tsx
// DormDash — Admin user management (mid-tone "slate" Route identity).
// FUNCTIONALITY PRESERVED: same listener, search, role filter chips,
// soft-ban toggle with confirm Alert. Role colors remapped into the
// palette: student = cerulean, dasher = teal, admin = danger.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAllUsers, useAllWallets, useDasherFloats } from '../../../hooks/useUsers';
import { setUserActive } from '../../../services/users';
import { User } from '../../../types';
import { S } from '../../../constants/themeMid';
import { formatJMD, TOKEN_JMD } from '../../../constants';
import { AmountPrompt } from '../../../components/AmountPrompt';
import { adminAdjustTokens, adminAdjustFloat, formatTokens } from '../../../services/payments';
import { Backdrop } from '../../../components/Backdrop';

export default function AdminUsers() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'dasher' | 'admin'>('all');
  const [searchFocused, setSearchFocused] = useState(false);

  // Money: students' token balances and dashers' floats (read-only here;
  // changes go through Cloud Functions so every change is in the ledger).
  const wallets = useAllWallets();
  const floats = useDasherFloats();
  const [adjust, setAdjust] = useState<{ user: User; kind: 'tokens' | 'float' } | null>(null);
  const { users, loading } = useAllUsers();

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
          await setUserActive(user.uid, !user.isActive);
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
      case 'student': return S.color.cerulean;
      case 'dasher':  return S.color.teal;
      case 'admin':   return S.color.danger;
      default:        return S.color.inkFaint;
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name.charAt(0).toUpperCase();
  };

  return (
    <View style={styles.root}>
      <Backdrop tone="mid" />
      <View style={[styles.header, { paddingTop: insets.top + S.space.md }]}>
        <Text style={styles.title}>Users</Text>
        <Text style={styles.subtitle}>{users.length} registered</Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={[styles.search, searchFocused && styles.searchFocused]}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or email"
            placeholderTextColor={S.color.inkFaint}
            value={search}
            onChangeText={setSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </View>
      </View>

      {/* Role filter chips */}
      <View style={styles.filterRow}>
        {(['all', 'student', 'dasher', 'admin'] as const).map(role => (
          <Pressable
            key={role}
            style={[styles.chip, roleFilter === role && styles.chipActive]}
            onPress={() => setRoleFilter(role)}
          >
            <Text style={[styles.chipText, roleFilter === role && styles.chipTextActive]}>
              {role === 'all' ? 'All' : role.charAt(0).toUpperCase() + role.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={S.color.ceruleanBright} size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.uid}
          contentContainerStyle={{ paddingHorizontal: S.space.lg, paddingBottom: 120 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const roleColor = getRoleColor(item.role);
            return (
              <View style={[styles.card, !item.isActive && styles.cardInactive]}>
                <View style={styles.cardHead}>
                  <View />
                  <View style={styles.badges}>
                    <View style={[styles.roleBadge, { backgroundColor: roleColor + '1F' }]}>
                      <Text style={[styles.roleText, { color: roleColor }]}>{item.role.charAt(0).toUpperCase() + item.role.slice(1)}</Text>
                    </View>
                    {!item.isActive && (
                      <View style={styles.bannedBadge}>
                        <Text style={styles.bannedText}>Banned</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.userRow}>
                  <View style={[styles.avatar, { backgroundColor: roleColor + '22' }]}>
                    <Text style={[styles.avatarText, { color: roleColor }]}>{getInitials(item.name)}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.userName}>{item.name || 'Unknown'}</Text>
                    <Text style={styles.userEmail}>{item.email}</Text>
                    <Text style={styles.userUni}>{item.university || 'No university listed'}</Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>{item.phone || 'No phone'}</Text>
                  <View style={styles.metaDot} />
                  <Text style={styles.metaText}>
                    joined {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'recently'}
                  </Text>
                </View>

                {item.role === 'student' && (
                  <View style={styles.moneyRow}>
                    <Text style={styles.moneyText}>
                      Tokens: {formatTokens((wallets[item.uid]?.balanceJmd ?? 0) - (wallets[item.uid]?.reservedJmd ?? 0))}
                      {(wallets[item.uid]?.reservedJmd ?? 0) > 0 ? ` (+${formatTokens(wallets[item.uid].reservedJmd)} held)` : ''}
                    </Text>
                    <Pressable onPress={() => setAdjust({ user: item, kind: 'tokens' })} style={styles.moneyBtn}>
                      <Text style={styles.moneyBtnText}>Adjust tokens</Text>
                    </Pressable>
                  </View>
                )}
                {item.role === 'dasher' && (
                  <View style={styles.moneyRow}>
                    <Text style={styles.moneyText}>Float: {formatJMD(floats[item.uid] ?? 0)}</Text>
                    <Pressable onPress={() => setAdjust({ user: item, kind: 'float' })} style={styles.moneyBtn}>
                      <Text style={styles.moneyBtnText}>Adjust float</Text>
                    </Pressable>
                  </View>
                )}

                {item.role !== 'admin' && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionBtn,
                      item.isActive ? styles.deactivateBtn : styles.reactivateBtn,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => handleToggleActive(item)}
                  >
                    <Text style={[
                      styles.actionText,
                      { color: item.isActive ? S.color.danger : S.color.teal },
                    ]}>
                      {item.isActive ? 'Deactivate account' : 'Reactivate account'}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          }}
        />
      )}

      <AmountPrompt
        visible={!!adjust}
        title={adjust?.kind === 'float' ? `Float for ${adjust?.user.name}` : `Tokens for ${adjust?.user.name}`}
        hint={adjust?.kind === 'float'
          ? 'J$ to add to this runner\'s float (money you gave them to buy orders). Use a minus sign to reduce it.'
          : `Tokens to add (1 token = J$${TOKEN_JMD}), e.g. after they pay you cash. Use a minus sign to remove.`}
        unitLabel={adjust?.kind === 'float' ? 'J$' : 'tokens'}
        onCancel={() => setAdjust(null)}
        onSubmit={async (amount, note) => {
          if (!adjust) return;
          if (adjust.kind === 'tokens') await adminAdjustTokens(adjust.user.uid, amount, note);
          else await adminAdjustFloat('dasher', adjust.user.uid, amount, note);
          setAdjust(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  moneyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  moneyText: { flex: 1, fontSize: 13, fontWeight: '800', color: S.color.ink },
  moneyBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: S.color.ceruleanTint },
  moneyBtnText: { fontSize: 12, fontWeight: '800', color: S.color.cerulean },
  root: { flex: 1, backgroundColor: S.color.bg },

  header: { paddingHorizontal: S.space.lg, paddingBottom: S.space.sm },
  eyebrow: { ...S.type.label, color: S.color.tealBright, marginBottom: 4 },
  title: { ...S.type.display, color: S.color.cream },
  subtitle: { fontSize: 12, fontWeight: '600', color: S.color.creamFaint, marginTop: 2 },

  searchWrap: { paddingHorizontal: S.space.lg, paddingBottom: S.space.sm },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: S.space.sm,
    backgroundColor: S.color.card, borderRadius: S.radius.pill,
    height: 46, paddingHorizontal: S.space.md,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  searchFocused: { borderColor: S.color.ceruleanBright },
  searchIcon: { fontSize: 16, color: S.color.inkFaint, fontWeight: '700' },
  searchInput: { flex: 1, fontSize: 13, fontWeight: '500', color: S.color.ink },

  filterRow: {
    flexDirection: 'row', gap: S.space.sm,
    paddingHorizontal: S.space.lg, paddingBottom: S.space.md,
  },
  chip: {
    paddingHorizontal: S.space.md, paddingVertical: 7,
    borderRadius: S.radius.pill,
    backgroundColor: 'rgba(242, 239, 230, 0.08)',
    borderWidth: 1, borderColor: S.color.lineOnBg,
  },
  chipActive: { backgroundColor: S.color.card, borderColor: S.color.card },
  chipText: { fontSize: 12, fontWeight: '700', color: S.color.creamSoft },
  chipTextActive: { color: S.color.cerulean },

  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    backgroundColor: S.color.card, borderRadius: S.radius.lg,
    padding: S.space.md, marginBottom: S.space.sm,
    gap: S.space.sm, ...S.shadow.card,
  },
  cardInactive: { opacity: 0.65 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardNumber: { ...S.type.number, color: S.color.teal },
  badges: { flexDirection: 'row', gap: 6 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: S.radius.pill },
  roleText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  bannedBadge: {
    backgroundColor: S.color.dangerTint,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: S.radius.pill,
  },
  bannedText: { fontSize: 10, fontWeight: '800', color: S.color.danger, letterSpacing: 0.6 },

  userRow: { flexDirection: 'row', alignItems: 'center', gap: S.space.md },
  avatar: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '900' },
  userName: { fontSize: 15, fontWeight: '800', color: S.color.ink, letterSpacing: -0.2 },
  userEmail: { fontSize: 12, fontWeight: '500', color: S.color.inkSoft },
  userUni: { fontSize: 11, fontWeight: '500', color: S.color.inkFaint },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 11, fontWeight: '600', color: S.color.inkFaint },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: S.color.lineOnCard },

  actionBtn: {
    borderRadius: S.radius.pill, paddingVertical: 10, alignItems: 'center',
  },
  deactivateBtn: { backgroundColor: S.color.dangerTint },
  reactivateBtn: { backgroundColor: S.color.tealTint },
  actionText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 6 },
  emptyNumber: { ...S.type.number, fontSize: 22, color: S.color.creamFaint },
  emptyText: { fontSize: 16, fontWeight: '800', color: S.color.cream },
});
