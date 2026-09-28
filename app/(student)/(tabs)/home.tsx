// app/(student)/(tabs)/home.tsx
// DormDash — Student home (Route identity).
//
// FUNCTIONALITY UNCHANGED. Same Firestore hooks (real-time stores listener),
// same filtering (category + search), same navigate handler.
//
// What's new is entirely visual:
//   • Cream canvas, ink type, cerulean action, teal accents. No yellow.
//   • Editorial header — small teal "campus delivery" eyebrow, greeting,
//     large ink display name.
//   • Compact search bar rests below the header, keeps its focus ring.
//   • Category chips scroll horizontally, cerulean-tinted on select.
//   • Featured row: one big open store per card, monogram tile with soft
//     drifting shapes, hollowed delivery-fee treatment.
//   • Store row: neat left-aligned cards with initial mark, name, meta.
//   • Empty and loading states are on-brand.
//   • Extra bottom padding accounts for the new floating tab bar.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView,
  Pressable, TouchableOpacity, TextInput, ActivityIndicator,
  Animated, RefreshControl, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStores } from '../../../hooks/useStores';
import { useAuth } from '../../../hooks/useAuth';
import { Store } from '../../../types';
import { formatJMD, DELIVERY_FEE_JMD } from '../../../constants';
import { T } from '../../../constants/theme';
import { Backdrop } from '../../../components/Backdrop';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CATEGORIES = ['All', 'Fast Food', 'Grocery', 'Pharmacy', 'Drinks', 'Snacks', 'Other'];

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

// ─── FEATURED STORE CARD ────────────────────────────────────────────
const FeaturedCard: React.FC<{ store: Store; onPress: () => void }> = ({ store, onPress }) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.featured,
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={styles.featuredHead}>
        <View style={styles.featuredMono}>
          <Text style={styles.featuredInitial}>{store.name.charAt(0)}</Text>
        </View>

        <View style={[
          styles.openBadge,
          { backgroundColor: store.isOpen ? T.color.tealTint : T.color.dangerTint },
        ]}>
          <View style={[
            styles.openDot,
            { backgroundColor: store.isOpen ? T.color.teal : T.color.danger },
          ]} />
          <Text style={[
            styles.openText,
            { color: store.isOpen ? T.color.teal : T.color.danger },
          ]}>
            {store.isOpen ? 'Open' : 'Closed'}
          </Text>
        </View>
      </View>

      <View style={styles.featuredBody}>
        <Text style={styles.featuredName} numberOfLines={1}>{store.name}</Text>
        <Text style={styles.featuredDesc} numberOfLines={2}>{store.description}</Text>

        <View style={styles.featuredMeta}>
          <Text style={styles.metaText}>★ {store.rating.toFixed(1)}</Text>
          <View style={styles.metaDot} />
          <Text style={styles.metaText}>{store.estimatedTime}</Text>
          <View style={styles.metaDot} />
          <View style={styles.feePlate}>
            <Text style={styles.feeText}>{formatJMD(DELIVERY_FEE_JMD)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
};

// ─── STORE ROW CARD ─────────────────────────────────────────────────
const StoreRow: React.FC<{ store: Store; onPress: () => void }> = ({ store, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && { transform: [{ scale: 0.98 }] }]}
  >
    <View style={styles.rowMono}>
      <Text style={styles.rowInitial}>{store.name.charAt(0)}</Text>
    </View>

    <View style={styles.rowContent}>
      <View style={styles.rowTop}>
        <Text style={styles.rowName} numberOfLines={1}>{store.name}</Text>
        <View style={[
          styles.rowStatus,
          { backgroundColor: store.isOpen ? T.color.tealTint : T.color.dangerTint },
        ]}>
          <View style={[
            styles.rowStatusDot,
            { backgroundColor: store.isOpen ? T.color.teal : T.color.danger },
          ]} />
          <Text style={[
            styles.rowStatusText,
            { color: store.isOpen ? T.color.teal : T.color.danger },
          ]}>
            {store.isOpen ? 'Open' : 'Closed'}
          </Text>
        </View>
      </View>

      <Text style={styles.rowDesc} numberOfLines={1}>{store.description}</Text>

      <View style={styles.rowMeta}>
        <Text style={styles.metaText}>★ {store.rating.toFixed(1)}</Text>
        <View style={styles.metaDot} />
        <Text style={styles.metaText}>{store.estimatedTime}</Text>
        <View style={styles.metaDot} />
        <Text style={styles.metaText}>{formatJMD(DELIVERY_FEE_JMD)}</Text>
      </View>
    </View>

    <Text style={styles.rowChevron}>›</Text>
  </Pressable>
);

// ─── MAIN ────────────────────────────────────────────────────────────
export default function StudentHome() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [refreshing, setRefreshing] = useState(false);
  const { stores, loading, refresh, refreshedAt } = useStores();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Entrance motion
  const headerFade = useRef(new Animated.Value(0.5)).current;
  const headerRise = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(headerRise, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();
  }, []);

  // Pull-to-refresh re-opens the live listener (useStores); the spinner
  // stops when fresh data arrives (it used to spin until a store changed).
  useEffect(() => { setRefreshing(false); }, [refreshedAt]);
  const onRefresh = useCallback(() => { setRefreshing(true); refresh(); }, [refresh]);

  const filtered = stores.filter(s => {
    const matchCat = selectedCategory === 'All' || s.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const featured = stores.filter(s => s.isOpen).slice(0, 5);
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const navigate = (id: string) => router.push(`/(student)/store/${id}` as any);

  return (
    <View style={styles.root}>
      <Backdrop tone="cream" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={T.color.cerulean}
            colors={[T.color.cerulean]}
          />
        }
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
      >
        {/* Header */}
        <Animated.View
          style={[
            styles.header,
            { paddingTop: insets.top + T.space.md, opacity: headerFade, transform: [{ translateY: headerRise }] },
          ]}
        >
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.name}>{firstName}.</Text>
        </Animated.View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <View style={[styles.search, searchFocused && styles.searchFocused]}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search stores, food…"
              placeholderTextColor={T.color.inkFaint}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Text style={styles.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {CATEGORIES.map(cat => (
            <Pressable
              key={cat}
              onPress={() => setSelectedCategory(cat)}
              style={({ pressed }) => [
                styles.chip,
                selectedCategory === cat && styles.chipActive,
                pressed && { transform: [{ scale: 0.96 }] },
              ]}
            >
              <Text style={[
                styles.chipText,
                selectedCategory === cat && styles.chipTextActive,
              ]}>{cat}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={T.color.cerulean} />
            <Text style={styles.loadingText}>Loading stores…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyTile}><View style={styles.emptyInner} /></View>
            <Text style={styles.emptyTitle}>Nothing matches</Text>
            <Text style={styles.emptySub}>
              {searchQuery ? 'Try a different search' : 'No open stores in this category right now'}
            </Text>
            {(searchQuery || selectedCategory !== 'All') && (
              <TouchableOpacity
                style={styles.emptyReset}
                onPress={() => { setSearchQuery(''); setSelectedCategory('All'); }}
              >
                <Text style={styles.emptyResetText}>Reset filters</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {/* Featured row — only shown when no filter/search */}
            {featured.length > 0 && selectedCategory === 'All' && !searchQuery && (
              <>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Featured</Text>
                  <Text style={styles.sectionCount}>{featured.length} open</Text>
                </View>
                <FlatList
                  data={featured}
                  horizontal
                  keyExtractor={item => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.featuredRow}
                  ItemSeparatorComponent={() => <View style={{ width: T.space.md }} />}
                  renderItem={({ item }) => (
                    <FeaturedCard store={item} onPress={() => navigate(item.id)} />
                  )}
                />
              </>
            )}

            {/* All stores */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>
                {selectedCategory === 'All' && !searchQuery ? 'All stores' : 'Results'}
              </Text>
              <Text style={styles.sectionCount}>{filtered.length}</Text>
            </View>

            <View style={styles.rowList}>
              {filtered.map(item => (
                <StoreRow key={item.id} store={item} onPress={() => navigate(item.id)} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const FEATURED_WIDTH = SCREEN_WIDTH * 0.75;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.cream },

  canvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: -1 },
  blobTeal: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: T.color.teal, opacity: 0.06,
    top: -100, right: -100,
  },
  blobCerulean: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: T.color.cerulean, opacity: 0.05,
    top: 240, left: -120,
  },

  // Header
  header: { paddingHorizontal: T.space.lg, paddingBottom: T.space.md },
  eyebrow: { ...T.type.label, color: T.color.teal, marginBottom: 4 },
  greeting: { ...T.type.body, color: T.color.inkSoft, fontSize: 15, marginBottom: 2 },
  name: { ...T.type.display, color: T.color.ink },

  // Search
  searchWrap: { paddingHorizontal: T.space.lg, paddingTop: T.space.sm, paddingBottom: T.space.sm },
  search: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.color.card,
    borderRadius: T.radius.pill,
    height: 50, paddingHorizontal: T.space.md,
    borderWidth: 1.5, borderColor: T.color.line,
    gap: T.space.sm,
  },
  searchFocused: {
    borderColor: T.color.cerulean,
    ...T.shadow.card, shadowOpacity: 0.06,
  },
  searchIcon: { fontSize: 18, color: T.color.inkFaint, fontWeight: '700' },
  searchInput: { flex: 1, ...T.type.body, color: T.color.ink, fontSize: 14 },
  searchClear: { color: T.color.inkFaint, fontSize: 16, fontWeight: '700' },

  // Chips
  chipRow: { paddingHorizontal: T.space.lg, paddingVertical: T.space.sm, gap: T.space.sm },
  chip: {
    paddingHorizontal: T.space.md, paddingVertical: 8,
    borderRadius: T.radius.pill,
    backgroundColor: T.color.card,
    borderWidth: 1.5, borderColor: T.color.line,
  },
  chipActive: { backgroundColor: T.color.ceruleanTint, borderColor: T.color.cerulean },
  chipText: { ...T.type.body, fontSize: 13, fontWeight: '700', color: T.color.inkSoft },
  chipTextActive: { color: T.color.cerulean },

  // Section heads
  sectionHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    paddingHorizontal: T.space.lg,
    paddingTop: T.space.lg, paddingBottom: T.space.sm,
  },
  sectionTitle: { ...T.type.title, fontSize: 22, color: T.color.ink },
  sectionCount: { ...T.type.label, color: T.color.teal, fontSize: 11 },

  // Featured
  featuredRow: { paddingHorizontal: T.space.lg, paddingBottom: T.space.md },
  featured: {
    width: FEATURED_WIDTH,
    backgroundColor: T.color.card,
    borderRadius: T.radius.xl,
    overflow: 'hidden',
    borderWidth: 1, borderColor: T.color.line,
    ...T.shadow.card, shadowOpacity: 0.06,
  },
  featuredHead: {
    height: 140,
    padding: T.space.md,
    backgroundColor: T.color.ceruleanTint,
    justifyContent: 'space-between',
    flexDirection: 'row',
    alignItems: 'flex-start',
    overflow: 'hidden',
  },
  featuredMono: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: T.color.card,
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1, borderColor: T.color.line,
  },
  featuredCircle1: {
    position: 'absolute',
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: T.color.cerulean, opacity: 0.15,
    top: -15, right: -15,
  },
  featuredCircle2: {
    position: 'absolute',
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: T.color.teal, opacity: 0.15,
    bottom: -8, left: -8,
  },
  featuredInitial: { fontSize: 30, fontWeight: '900', color: T.color.cerulean },
  featuredBody: { padding: T.space.md, gap: 4 },
  featuredName: { ...T.type.body, fontSize: 17, fontWeight: '800', color: T.color.ink, letterSpacing: -0.3 },
  featuredDesc: { ...T.type.body, fontSize: 12, color: T.color.inkSoft, lineHeight: 17, minHeight: 34 },
  featuredMeta: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6, marginTop: 4,
  },

  openBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: T.radius.pill,
  },
  openDot: { width: 6, height: 6, borderRadius: 3 },
  openText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },

  // Row cards
  rowList: { paddingHorizontal: T.space.lg, gap: T.space.sm, paddingBottom: T.space.md },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.color.card,
    borderRadius: T.radius.lg,
    padding: T.space.md,
    borderWidth: 1, borderColor: T.color.line,
    gap: T.space.md,
  },
  rowMono: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: T.color.ceruleanTint,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(14, 143, 181, 0.15)',
  },
  rowInitial: { fontSize: 22, fontWeight: '900', color: T.color.cerulean },
  rowContent: { flex: 1, gap: 3 },
  rowTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    gap: T.space.sm,
  },
  rowName: { flex: 1, ...T.type.body, fontSize: 15, fontWeight: '800', color: T.color.ink, letterSpacing: -0.2 },
  rowStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: T.radius.pill,
    flexShrink: 0,
  },
  rowStatusDot: { width: 5, height: 5, borderRadius: 3 },
  rowStatusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  rowDesc: { ...T.type.body, fontSize: 12, color: T.color.inkSoft },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  rowChevron: { fontSize: 22, color: T.color.cerulean, fontWeight: '700', flexShrink: 0 },

  // Meta text (shared)
  metaText: { fontSize: 12, color: T.color.inkSoft, fontWeight: '700' },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: T.color.lineStrong },

  feePlate: {},
  feeText: { fontSize: 12, color: T.color.cerulean, fontWeight: '800' },

  // Loading
  loading: { paddingTop: 60, alignItems: 'center', gap: T.space.md },
  loadingText: { ...T.type.body, color: T.color.inkSoft, fontWeight: '600' },

  // Empty
  empty: { paddingTop: 60, alignItems: 'center', paddingHorizontal: T.space.xl, gap: T.space.sm },
  emptyTile: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: T.color.ceruleanTint,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: T.space.sm,
  },
  emptyInner: { width: 24, height: 24, borderRadius: 8, backgroundColor: T.color.cerulean, opacity: 0.4 },
  emptyTitle: { ...T.type.title, fontSize: 20, color: T.color.ink },
  emptySub: { ...T.type.body, color: T.color.inkSoft, textAlign: 'center' },
  emptyReset: {
    marginTop: T.space.md,
    backgroundColor: T.color.cerulean,
    borderRadius: T.radius.pill,
    paddingHorizontal: T.space.lg, paddingVertical: 10,
    ...T.shadow.button,
  },
  emptyResetText: { color: T.color.card, fontSize: 13, fontWeight: '800' },
});
