// components/GroupFinder.tsx
// Group orders on the dasher's /dash screen: set up a search (how many
// orders, which stores, how far apart the stores may be), see a group the
// server found, and grab it before anyone takes one of its orders.
//
// The server does the matching and the accepting (functions/src/groups.ts);
// this only saves the search and asks to accept. A group isn't reserved, so
// the Accept button can say "no longer available".

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { D } from '../constants/themeDark';
import { formatJMD, GROUP_SIZES, GROUP_DISTANCES_M, GROUP_MAX_STORES } from '../constants';
import { useStores } from '../hooks/useStores';
import { useGroupSearch, useOrderGroup } from '../hooks/useGroups';
import { startGroupSearch, stopGroupSearch, acceptOrderGroup, distanceLabel } from '../services/groups';
import { serverNow } from '../services/serverClock';

type Props = {
  uid: string;
  /** Delivering right now: searching pauses until every order is finished. */
  busy: boolean;
};

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function GroupFinder({ uid, busy }: Props) {
  const search = useGroupSearch(uid);
  const group = useOrderGroup(search?.active ? search.offeredGroupId : null);
  const { stores } = useStores();

  const [editing, setEditing] = useState(false);
  const [size, setSize] = useState(GROUP_SIZES[GROUP_SIZES.length - 1]);
  const [distance, setDistance] = useState(GROUP_DISTANCES_M[0]);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [now, setNow] = useState(() => serverNow());

  const live = !!group && group.status === 'offered' && group.expiresAt > now;
  // Tick once a second while a group is on offer (countdown).
  useEffect(() => {
    if (!group || group.status !== 'offered') return;
    const t = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(t);
  }, [group?.id, group?.status]);

  const openEditor = () => {
    if (search) {
      setSize(search.size);
      setDistance(search.maxStoreDistanceM);
      setStoreIds(search.storeIds ?? []);
    }
    setEditing(true);
  };

  const toggleStore = (id: string) => {
    setStoreIds(cur => cur.includes(id)
      ? cur.filter(x => x !== id)
      : cur.length >= GROUP_MAX_STORES ? cur : [...cur, id]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await startGroupSearch({ size, maxStoreDistanceM: distance, storeIds });
      setEditing(false);
    } catch (e: any) {
      Alert.alert('Group search', e?.message ?? 'Could not start the group search. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const stop = async () => {
    setSaving(true);
    try {
      await stopGroupSearch();
      setEditing(false);
    } catch (e: any) {
      Alert.alert('Group search', e?.message ?? 'Could not stop the group search. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const accept = async () => {
    if (!group || accepting) return;
    setAccepting(true);
    try {
      const outcome = await acceptOrderGroup(group.id);
      if (outcome === 'gone') {
        Alert.alert('Group no longer available', 'Someone took one of its orders first. We\'ll keep looking for another group.');
      } else if (outcome === 'expired') {
        Alert.alert('Group expired', 'That group ran out of time. We\'ll keep looking for another one.');
      } else if (outcome === 'busy') {
        Alert.alert('Finish your delivery first', 'You can take a group once your current delivery is done.');
      }
    } catch (e: any) {
      Alert.alert('Group not accepted', e?.message ?? 'Could not accept the group. Try again.');
    } finally {
      setAccepting(false);
    }
  };

  const storeName = (id: string) => stores.find(s => s.id === id)?.name ?? 'A store';
  const filterText = (ids: string[]) => !ids.length
    ? 'any store'
    : ids.length <= 2 ? ids.map(storeName).join(' and ') : `${ids.length} stores`;

  // ── A group is on offer ────────────────────────────────────────────────
  if (live && group && !busy) {
    const from = group.storeNames.length === 1
      ? group.storeNames[0]
      : `${group.storeNames.length} stores within ${group.spanM} m`;
    return (
      <View style={[styles.card, styles.cardFound]}>
        <View style={styles.headRow}>
          <Text style={styles.foundTitle}>Group #{group.groupNo} found</Text>
          <Text style={styles.countdown} accessibilityLabel={`${clock(group.expiresAt - now)} left`}>
            {clock(group.expiresAt - now)}
          </Text>
        </View>
        <Text style={styles.sub}>{group.size} orders from {from}</Text>

        <View style={styles.stops}>
          {group.stops.map((s, i) => (
            <View key={s.orderId} style={styles.stop}>
              <Text style={styles.stopNo}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.stopStore} numberOfLines={1}>{s.storeName}</Text>
                <Text style={styles.stopDrop} numberOfLines={1}>to {s.dropOff}</Text>
              </View>
              <Text style={styles.stopPay}>{formatJMD(s.payoutJmd)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.payRow}>
          <Text style={styles.payLabel}>Total payout</Text>
          <View style={styles.payPlate}><Text style={styles.payText}>{formatJMD(group.payoutJmd)}</Text></View>
        </View>

        <Pressable
          onPress={accept}
          disabled={accepting}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primaryBtn, (pressed || accepting) && { transform: [{ scale: 0.98 }] }]}
        >
          {accepting
            ? <ActivityIndicator color={D.color.bg} />
            : <Text style={styles.primaryText}>Accept all {group.size} orders</Text>}
        </Pressable>
        <Text style={styles.fine}>
          Not held for you: if another dasher takes one of these orders first, the group is gone. Each customer pays for their own order before you pick it up.
        </Text>
      </View>
    );
  }

  // ── Setting up a search ─────────────────────────────────────────────────
  if (editing) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Group search</Text>

        <Text style={styles.label}>Orders per group</Text>
        <View style={styles.chips}>
          {GROUP_SIZES.map(n => <Chip key={n} label={`${n} orders`} on={size === n} onPress={() => setSize(n)} />)}
        </View>

        <Text style={styles.label}>How far apart the stores can be</Text>
        <View style={styles.chips}>
          {GROUP_DISTANCES_M.map(m => <Chip key={m} label={distanceLabel(m)} on={distance === m} onPress={() => setDistance(m)} />)}
        </View>

        <Text style={styles.label}>Stores</Text>
        <View style={styles.chips}>
          <Chip label="Any store" on={!storeIds.length} onPress={() => setStoreIds([])} />
          {stores.map(s => (
            <Chip key={s.id} label={s.name} on={storeIds.includes(s.id)} onPress={() => toggleStore(s.id)} />
          ))}
        </View>

        <View style={styles.btnRow}>
          <Pressable onPress={() => setEditing(false)} style={styles.ghostBtn} accessibilityRole="button">
            <Text style={styles.ghostText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={save}
            disabled={saving}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primaryBtn, styles.flex, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            {saving ? <ActivityIndicator color={D.color.bg} /> : <Text style={styles.primaryText}>Start searching</Text>}
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Searching, or not set up ────────────────────────────────────────────
  if (search?.active) {
    return (
      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.title}>Group search on</Text>
        </View>
        <Text style={styles.sub}>
          Groups of {search.size} from {filterText(search.storeIds ?? [])}, {distanceLabel(search.maxStoreDistanceM).toLowerCase()}.
          {busy
            ? ' Paused until you finish your deliveries.'
            : ' We\'ll send an alert when a group is ready.'}
        </Text>
        <View style={styles.btnRow}>
          <Pressable onPress={openEditor} style={[styles.ghostBtn, styles.flex]} accessibilityRole="button">
            <Text style={styles.ghostText}>Change</Text>
          </Pressable>
          <Pressable onPress={stop} disabled={saving} style={[styles.ghostBtn, styles.flex]} accessibilityRole="button">
            {saving ? <ActivityIndicator color={D.color.cream} /> : <Text style={styles.ghostText}>Stop</Text>}
          </Pressable>
        </View>
      </View>
    );
  }

  if (busy) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Group orders</Text>
      <Text style={styles.sub}>
        Take several orders in one trip. Choose the stores and how far apart they can be, and we'll alert you when open orders make a group.
      </Text>
      <Pressable onPress={openEditor} style={styles.ghostBtn} accessibilityRole="button">
        <Text style={styles.ghostText}>Set up a group search</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: D.color.card,
    marginHorizontal: D.space.lg,
    marginBottom: D.space.md,
    borderRadius: D.radius.xl,
    padding: D.space.lg,
    borderWidth: 1, borderColor: D.color.line,
    gap: D.space.sm,
  },
  cardFound: { borderWidth: 1.5, borderColor: D.color.teal },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: D.space.sm },
  title: { ...D.type.title, fontSize: 20, color: D.color.cream },
  foundTitle: { ...D.type.title, fontSize: 22, color: D.color.teal, flexShrink: 1 },
  countdown: { fontSize: 16, fontWeight: '900', color: D.color.warning, fontVariant: ['tabular-nums'] },
  sub: { ...D.type.body, fontSize: 13, color: D.color.creamSoft, lineHeight: 19 },
  label: { ...D.type.label, color: D.color.creamFaint, marginTop: D.space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: D.radius.pill,
    borderWidth: 1, borderColor: D.color.lineStrong,
  },
  chipOn: { backgroundColor: D.color.tealTint, borderColor: D.color.teal },
  chipText: { fontSize: 13, fontWeight: '700', color: D.color.creamSoft },
  chipTextOn: { color: D.color.teal },

  stops: { gap: 8, marginTop: 2 },
  stop: {
    flexDirection: 'row', alignItems: 'center', gap: D.space.sm,
    backgroundColor: D.color.cardHigh, borderRadius: D.radius.md, padding: D.space.sm,
  },
  stopNo: {
    width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24,
    backgroundColor: D.color.ceruleanTint, color: D.color.cerulean, fontSize: 12, fontWeight: '900',
  },
  stopStore: { ...D.type.body, fontSize: 14, fontWeight: '800', color: D.color.cream },
  stopDrop: { ...D.type.body, fontSize: 12, color: D.color.creamSoft },
  stopPay: { fontSize: 13, fontWeight: '800', color: D.color.teal },

  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payLabel: { ...D.type.label, color: D.color.creamFaint },
  payPlate: {
    backgroundColor: D.color.tealTint, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: D.radius.sm, borderWidth: 1.5, borderColor: D.color.teal,
  },
  payText: { fontSize: 18, fontWeight: '900', color: D.color.teal, letterSpacing: -0.3 },

  btnRow: { flexDirection: 'row', gap: D.space.sm, marginTop: D.space.xs },
  flex: { flex: 1 },
  primaryBtn: {
    backgroundColor: D.color.teal, borderRadius: D.radius.pill, height: 50,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: D.space.lg,
  },
  primaryText: { color: D.color.bg, fontSize: 15, fontWeight: '900', letterSpacing: 0.2 },
  ghostBtn: {
    borderRadius: D.radius.pill, height: 44, paddingHorizontal: D.space.lg,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: D.color.lineStrong,
  },
  ghostText: { color: D.color.cream, fontSize: 14, fontWeight: '800' },
  fine: { ...D.type.body, fontSize: 11, color: D.color.creamFaint, lineHeight: 16 },
});
