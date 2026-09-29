// app/(student)/(tabs)/home.tsx
// DormDash — Student home, "Tide Print" style (constants/theme.ts).
//
// Same data and behaviour: live stores (useStores), category + search
// filtering, pull to refresh, tap a store to open it.
// Look: greeting and search on the sea band (components/Tide), category
// chips as teal plates, featured stores as big coloured store marks, and
// every card on a print plate.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView,
  Pressable, TouchableOpacity, TextInput, Animated, RefreshControl, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useStores } from '../../../hooks/useStores';
import { useAuth } from '../../../hooks/useAuth';
import { Store } from '../../../types';
import { formatJMD, MIN_DELIVERY_FEE_JMD } from '../../../constants';
import { T } from '../../../constants/theme';
import { Backdrop } from '../../../components/Backdrop';
import { TideBand, StoreMark, StoreArt, pressPlate } from '../../../components/Tide';
import { Swoosh } from '../../../components/Swoosh';
import { SkeletonGroup, StoreRowSkeleton, Bone } from '../../../components/Skeleton';
import { JcBadge } from '../../../components/JcBadge';
import { Scripture } from '../../../components/Scripture';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CATEGORIES = ['All', 'Fast Food', 'Grocery', 'Pharmacy', 'Drinks', 'Snacks', 'Other'];

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

// ─── FEATURED STORE CARD ────────────────────────────────────────────
const OpenTag: React.FC<{ open: boolean; onSea?: boolean }> = ({ open, onSea }) => (
  <View style={[styles.openTag, onSea ? styles.openTagSea : open ? styles.openTagOn : styles.openTagOff]}>
    <View style={[styles.openDot, { backgroundColor: open ? T.color.tealBright : T.color.danger }]} />
    <Text style={[styles.openText, { color: onSea ? T.color.card : open ? T.color.teal : T.color.danger }]}>
      {open ? 'Open' : 'Closed'}
    </Text>
  </View>
);

const FeaturedCard: React.FC<{ store: Store; onPress: () => void }> = ({ store, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`${store.name}, ${store.isOpen ? 'open' : 'closed'}`}
    style={({ pressed }) => [styles.featured, pressPlate(pressed)]}
  >
    <View style={styles.featuredHead}>
      <StoreArt id={store.id} name={store.name} />
      <OpenTag open={store.isOpen} onSea />
    </View>
    <View style={styles.featuredBody}>
      <Text style={styles.featuredName} numberOfLines={1}>{store.name}</Text>
      <Text style={styles.featuredDesc} numberOfLines={2}>{store.description}</Text>
      <View style={styles.featuredMeta}>
        <Text style={styles.metaText}>★ {store.rating.toFixed(1)}</Text>
        <View style={styles.metaDot} />
        <Text style={styles.metaText}>{store.estimatedTime}</Text>
        <View style={styles.metaDot} />
        <Text style={styles.feeText}>from {formatJMD(MIN_DELIVERY_FEE_JMD)}</Text>
      </View>
    </View>
  </Pressable>
);

// ─── STORE ROW CARD ─────────────────────────────────────────────────
const StoreRow: React.FC<{ store: Store; onPress: () => void }> = ({ store, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={`${store.name}, ${store.isOpen ? 'open' : 'closed'}`}
    style={({ pressed }) => [styles.row, !store.isOpen && styles.rowClosed, pressPlate(pressed)]}
  >
    <StoreMark id={store.id} name={store.name} size={56} muted={!store.isOpen} />
    <View style={styles.rowContent}>
      <View style={styles.rowTop}>
        <Text style={styles.rowName} numberOfLines={1}>{store.name}</Text>
        <OpenTag open={store.isOpen} />
      </View>
      <Text style={styles.rowDesc} numberOfLines={1}>{store.description}</Text>
      <View style={styles.rowMeta}>
        <Text style={styles.metaText}>★ {store.rating.toFixed(1)}</Text>
        <View style={styles.metaDot} />
        <Text style={styles.metaText}>{store.estimatedTime}</Text>
        <View style={styles.metaDot} />
        <Text style={styles.feeText}>from {formatJMD(MIN_DELIVERY_FEE_JMD)}</Text>
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
        {/* Sea band: greeting and search */}
        <TideBand>
          <Animated.View
            style={[
              styles.header,
              { paddingTop: insets.top + T.space.lg, opacity: headerFade, transform: [{ translateY: headerRise }] },
            ]}
          >
            {/* Greeting on the left, the Jcommerce mark across from it. */}
            <View style={styles.greetRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.greeting}>{greeting()},</Text>
                <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit>{firstName}.</Text>
              </View>
              <JcBadge />
            </View>
            <Swoosh width={Math.min(260, 40 + firstName.length * 26)} />
            <Text style={styles.headerNote}>Anything on campus, to your door from {formatJMD(MIN_DELIVERY_FEE_JMD)}.</Text>
          </Animated.View>

          <View style={styles.searchWrap}>
            <View style={styles.search}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search stores, food…"
                placeholderTextColor={T.color.inkFaint}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                  <Text style={styles.searchClear}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TideBand>

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
                pressPlate(pressed, 3),
              ]}
            >
              <Text style={[
                styles.chipText,
                selectedCategory === cat && styles.chipTextActive,
              ]}>{cat}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* A Bible verse, changing every few minutes (not while searching). */}
        {!searchQuery && <Scripture />}

        {loading ? (
          <SkeletonGroup label="Loading stores…">
            <View style={styles.sectionHead}><Bone w={140} h={24} /></View>
            <View style={styles.rowList}>
              {[0, 1, 2, 3].map(i => <StoreRowSkeleton key={i} />)}
            </View>
          </SkeletonGroup>
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
                  <View style={styles.countTag}><Text style={styles.sectionCount}>{featured.length} open</Text></View>
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
              <View style={styles.countTag}><Text style={styles.sectionCount}>{filtered.length}</Text></View>
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

const FEATURED_WIDTH = Math.min(SCREEN_WIDTH * 0.75, 320);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.cream },

  // Sea band
  header: { paddingHorizontal: T.space.lg, paddingBottom: T.space.md },
  greetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: T.space.md },
  greeting: { ...T.type.display, fontSize: 30, lineHeight: 36, color: T.color.card },
  name: { ...T.type.display, fontSize: 48, lineHeight: 56, color: T.color.mustard },
  headerNote: { ...T.type.body, color: T.color.card, fontSize: 15, fontWeight: '600', marginTop: 10 },

  searchWrap: { paddingHorizontal: T.space.lg },
  search: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.color.card,
    borderRadius: T.radius.pill,
    height: 52, paddingHorizontal: T.space.md,
    gap: T.space.sm,
  },
  searchIcon: { fontSize: 18, color: T.color.cerulean, fontWeight: '700' },
  // No focus ring inside the pill (web draws one on the input by default).
  searchInput: { flex: 1, ...T.type.body, color: T.color.ink, fontSize: 15, outlineStyle: 'none', borderWidth: 0 } as any,
  searchClear: { color: T.color.inkFaint, fontSize: 16, fontWeight: '700' },

  // Chips: teal plates
  chipRow: { paddingHorizontal: T.space.lg, paddingTop: T.space.md, paddingBottom: T.space.sm + 4, gap: T.space.sm },
  chip: {
    paddingHorizontal: T.space.md, paddingVertical: 9,
    borderRadius: T.radius.pill,
    backgroundColor: T.color.card,
    borderWidth: 1.5, borderColor: T.color.lineStrong,
    ...T.plate.card, shadowOffset: { width: 0, height: 3 },
  },
  chipActive: { backgroundColor: T.color.mustard, borderColor: T.color.mustard, ...T.plate.mustard, shadowOffset: { width: 0, height: 3 } },
  chipText: { ...T.type.body, fontSize: 13, fontWeight: '800', color: T.color.inkSoft },
  chipTextActive: { color: T.color.ink },

  // Section heads
  sectionHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: T.space.lg,
    paddingTop: T.space.lg, paddingBottom: T.space.sm,
  },
  sectionTitle: { ...T.type.title, fontSize: 24, color: T.color.ink },
  countTag: {
    backgroundColor: T.color.ceruleanTint, borderRadius: T.radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  sectionCount: { ...T.type.label, color: T.color.cerulean, fontSize: 12 },

  // Featured
  featuredRow: { paddingHorizontal: T.space.lg, paddingBottom: T.space.lg },
  featured: {
    width: FEATURED_WIDTH,
    backgroundColor: T.color.card,
    borderRadius: T.radius.xl,
    borderWidth: 1.5, borderColor: T.color.line,
    ...T.plate.card,
  },
  featuredHead: {
    height: 132,
    borderTopLeftRadius: T.radius.xl - 1.5, borderTopRightRadius: T.radius.xl - 1.5,
    overflow: 'hidden',
    padding: T.space.md,
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-start',
  },
  featuredBody: { padding: T.space.md, gap: 4 },
  featuredName: { ...T.type.title, fontSize: 20, color: T.color.ink },
  featuredDesc: { ...T.type.body, fontSize: 13, color: T.color.inkSoft, lineHeight: 18, minHeight: 36 },
  featuredMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },

  openTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: T.radius.pill, flexShrink: 0,
  },
  openTagOn: { backgroundColor: T.color.tealTint },
  openTagOff: { backgroundColor: T.color.dangerTint },
  openTagSea: { backgroundColor: 'rgba(7, 42, 64, 0.55)' },
  openDot: { width: 6, height: 6, borderRadius: 3 },
  openText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

  // Rows
  rowList: { paddingHorizontal: T.space.lg, gap: T.space.md, paddingBottom: T.space.md },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.color.card,
    borderRadius: T.radius.lg,
    padding: T.space.md - 2,
    borderWidth: 1.5, borderColor: T.color.line,
    gap: T.space.md,
    ...T.plate.card,
  },
  // Low tide: a closed store sits flat, without its plate.
  rowClosed: { backgroundColor: T.color.cream, borderColor: T.color.lineStrong, shadowOpacity: 0, elevation: 0 },
  rowContent: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: T.space.sm },
  rowName: { flex: 1, ...T.type.body, fontSize: 16, fontWeight: '800', color: T.color.ink, letterSpacing: -0.2 },
  rowDesc: { ...T.type.body, fontSize: 13, color: T.color.inkSoft },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  rowChevron: { fontSize: 24, color: T.color.cerulean, fontWeight: '700', flexShrink: 0 },

  // Meta (shared)
  metaText: { fontSize: 12, color: T.color.inkSoft, fontWeight: '700' },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: T.color.lineStrong },
  feeText: { fontSize: 12, color: T.color.teal, fontWeight: '800' },

  // Loading
  loading: { paddingTop: 60, alignItems: 'center', gap: T.space.md },
  loadingText: { ...T.type.body, color: T.color.inkSoft, fontWeight: '600' },

  // Empty
  empty: { paddingTop: 48, alignItems: 'center', paddingHorizontal: T.space.xl, gap: T.space.sm },
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
    ...T.plate.cerulean,
  },
  emptyResetText: { color: T.color.card, fontSize: 13, fontWeight: '800' },
});
