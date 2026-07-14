// app/(student)/(tabs)/home.tsx
// Student home — fully wired to Firestore with real-time store data.
// Professional liquid glassmorphism design with yellow/cerulean palette.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  ScrollView,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { useAuth } from '../../../hooks/useAuth';
import { Store } from '../../../types';
import { COLORS, SPACING, RADIUS, formatJMD } from '../../../constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - SPACING.lg * 2;

const CATEGORIES = [
  { id: 'All' },
  { id: 'Fast Food' },
  { id: 'Grocery' },
  { id: 'Pharmacy' },
  { id: 'Drinks' },
  { id: 'Snacks' },
  { id: 'Other' },
];

// Deterministic color palette per store name - Updated for Yellow/Cerulean theme
const STORE_GRADIENTS: Record<number, [string, string]> = {
  0: ['#FFD166', '#FFC107'], // Yellow primary
  1: ['#00B4D8', '#0096C7'], // Cerulean
  2: ['#FFE066', '#FFD166'], // Light yellow
  3: ['#48CAE4', '#00B4D8'], // Light cerulean
  4: ['#FFE5B4', '#FFD166'], // Warm yellow
  5: ['#90E0EF', '#00B4D8'], // Pastel cerulean
};

function storeColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 6;
}

// Featured Store Card
const FeaturedCard: React.FC<{ store: Store; onPress: () => void }> = ({ store, onPress }) => {
  const idx = storeColorIndex(store.name);
  const [c1, c2] = STORE_GRADIENTS[idx];

  return (
    <TouchableOpacity
      style={[styles.featuredCard, { width: SCREEN_WIDTH - SPACING.lg * 3 }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <View style={[styles.featuredHeader, { backgroundColor: c1 + '20' }]}>
        <View style={[styles.featuredCircle1, { backgroundColor: c1 + '40' }]} />
        <View style={[styles.featuredCircle2, { backgroundColor: c2 + '30' }]} />
        <Text style={[styles.featuredInitial, { color: c1 }]}>{store.name.charAt(0)}</Text>
        <View style={[styles.featuredOpenBadge, { backgroundColor: store.isOpen ? '#00D9A322' : '#FF475722' }]}>
          <View style={[styles.featuredOpenDot, { backgroundColor: store.isOpen ? '#00D9A3' : '#FF4757' }]} />
          <Text style={[styles.featuredOpenText, { color: store.isOpen ? '#00D9A3' : '#FF4757' }]}>
            {store.isOpen ? 'Open' : 'Closed'}
          </Text>
        </View>
      </View>

      <View style={styles.featuredBody}>
        <Text style={styles.featuredName} numberOfLines={1}>{store.name}</Text>
        <Text style={styles.featuredDesc} numberOfLines={2}>{store.description}</Text>
        <View style={styles.featuredMeta}>
          <Text style={styles.featuredMetaText}>★ {store.rating.toFixed(1)}</Text>
          <Text style={styles.featuredMetaDot}>·</Text>
          <Text style={styles.featuredMetaText}>{store.estimatedTime}</Text>
          <Text style={styles.featuredMetaDot}>·</Text>
          <Text style={[styles.featuredMetaText, store.deliveryFee === 0 && styles.featuredFree]}>
            {store.deliveryFee === 0 ? 'Free delivery' : formatJMD(store.deliveryFee)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// Regular Store Row Card
const StoreRowCard: React.FC<{ store: Store; onPress: () => void }> = ({ store, onPress }) => {
  const idx = storeColorIndex(store.name);
  const [c1] = STORE_GRADIENTS[idx];

  return (
    <TouchableOpacity style={styles.rowCard} onPress={onPress} activeOpacity={0.88}>
      <View style={[styles.rowCardThumb, { backgroundColor: c1 + '15', borderColor: c1 + '30' }]}>
        <Text style={[styles.rowCardInitial, { color: c1 }]}>{store.name.charAt(0)}</Text>
      </View>

      <View style={styles.rowCardContent}>
        <View style={styles.rowCardTopRow}>
          <Text style={styles.rowCardName} numberOfLines={1}>{store.name}</Text>
          <View style={[styles.rowCardStatus, { backgroundColor: store.isOpen ? '#00D9A322' : '#FF475722' }]}>
            <View style={[styles.rowCardStatusDot, { backgroundColor: store.isOpen ? '#00D9A3' : '#FF4757' }]} />
            <Text style={[styles.rowCardStatusText, { color: store.isOpen ? '#00D9A3' : '#FF4757' }]}>
              {store.isOpen ? 'Open' : 'Closed'}
            </Text>
          </View>
        </View>

        <Text style={styles.rowCardDesc} numberOfLines={1}>{store.description}</Text>

        <View style={styles.rowCardMeta}>
          <Text style={styles.rowCardMetaText}>★ {store.rating.toFixed(1)}</Text>
          <Text style={styles.rowCardMetaSep}>·</Text>
          <Text style={styles.rowCardMetaText}>{store.estimatedTime}</Text>
          <Text style={styles.rowCardMetaSep}>·</Text>
          <Text style={[styles.rowCardMetaText, store.deliveryFee === 0 && styles.featuredFree]}>
            {store.deliveryFee === 0 ? 'Free' : formatJMD(store.deliveryFee)}
          </Text>
        </View>
      </View>

      <Text style={styles.rowCardArrow}>›</Text>
    </TouchableOpacity>
  );
};

// Main Screen
export default function StudentHome() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const q = query(collection(db, 'stores'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const list: Store[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Store));
      setStores(list);
      setLoading(false);
      setRefreshing(false);
    }, () => {
      setLoading(false);
      setRefreshing(false);
    });
    return unsub;
  }, []);

  const onRefresh = useCallback(() => { setRefreshing(true); }, []);

  const filtered = stores.filter(s => {
    const matchCat = selectedCategory === 'All' || s.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const featured = stores.filter(s => s.isOpen).slice(0, 5);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const heroHeight = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [140, 90],
    extrapolate: 'clamp',
  });

  const navigateToStore = (storeId: string) => {
    router.push(`/(student)/store/${storeId}` as any);
  };

  return (
    <View style={styles.root}>
      {/* Wave Background - Yellow & Cerulean */}
      <View style={styles.waveDecoration} pointerEvents="none">
        <View style={styles.waveCircle1} />
        <View style={styles.waveCircle2} />
        <View style={styles.waveCircle3} />
        <View style={styles.waveBlur1} />
        <View style={styles.waveBlur2} />
      </View>

      {/* Hero Header */}
      <Animated.View style={[styles.hero, { height: heroHeight, paddingTop: insets.top }]}>
        <View style={styles.heroContent}>
          <View>
            <Text style={styles.heroGreeting}>{greeting()}</Text>
            <Text style={styles.heroName}>{firstName}</Text>
          </View>
          <TouchableOpacity style={styles.heroBell}>
            <View style={styles.heroBellDot} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Search Bar */}
      <View style={styles.searchWrapper}>
        <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search stores, food..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Content */}
      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFD166" colors={['#FFD166']} />
        }
        contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
      >
        {/* Category Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
          style={styles.categoryScroll}
        >
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.catPill, selectedCategory === cat.id && styles.catPillActive]}
              onPress={() => setSelectedCategory(cat.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.catLabel, selectedCategory === cat.id && styles.catLabelActive]}>
                {cat.id}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#FFD166" />
            <Text style={styles.loadingText}>Loading stores...</Text>
          </View>
        ) : (
          <>
            {/* Featured Section */}
            {selectedCategory === 'All' && !searchQuery && featured.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Open Now</Text>
                  <Text style={styles.sectionCount}>{featured.length} stores</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.featuredRow}
                  decelerationRate="fast"
                  snapToInterval={SCREEN_WIDTH - SPACING.lg * 3 + SPACING.md}
                >
                  {featured.map(store => (
                    <FeaturedCard
                      key={store.id}
                      store={store}
                      onPress={() => navigateToStore(store.id)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* All Stores List */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {searchQuery ? `Search Results` : selectedCategory === 'All' ? 'All Stores' : selectedCategory}
                </Text>
                <Text style={styles.sectionCount}>{filtered.length}</Text>
              </View>

              {filtered.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconContainer}>
                    <View style={styles.emptyIcon} />
                  </View>
                  <Text style={styles.emptyTitle}>No stores found</Text>
                  <Text style={styles.emptySub}>
                    {searchQuery ? 'Try different keywords' : 'No stores in this category yet'}
                  </Text>
                  {(searchQuery || selectedCategory !== 'All') && (
                    <TouchableOpacity
                      style={styles.emptyReset}
                      onPress={() => { setSearchQuery(''); setSelectedCategory('All'); }}
                    >
                      <Text style={styles.emptyResetText}>Clear filters</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.rowList}>
                  {filtered.map(store => (
                    <StoreRowCard
                      key={store.id}
                      store={store}
                      onPress={() => navigateToStore(store.id)}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFDF5', // Soft yellow tint background
  },

  // Wave decoration - Yellow & Cerulean
  waveDecoration: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: -1,
  },
  waveCircle1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: '#FFD166', // Yellow
    top: -120,
    right: -80,
    opacity: 0.12,
  },
  waveCircle2: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 240,
    backgroundColor: '#00B4D8', // Cerulean
    bottom: 100,
    left: -100,
    opacity: 0.08,
  },
  waveCircle3: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 180,
    backgroundColor: '#FFE066', // Light yellow
    top: '50%',
    right: -60,
    opacity: 0.06,
  },
  waveBlur1: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 320,
    backgroundColor: '#48CAE4', // Light cerulean
    top: 300,
    right: -150,
    opacity: 0.06,
  },
  waveBlur2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 200,
    backgroundColor: '#FFD166',
    bottom: 200,
    right: -80,
    opacity: 0.05,
  },

  // Hero
  hero: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 209, 102, 0.2)',
  },
  heroContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  heroGreeting: {
    fontSize: 13,
    color: '#00B4D8',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  heroName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFC107',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  heroBell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 209, 102, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.3)',
  },
  heroBellDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFD166',
  },

  // Search
  searchWrapper: {
    backgroundColor: '#FFFDF5',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginTop: -1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 40,
    paddingHorizontal: SPACING.md,
    height: 52,
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.3)',
    gap: SPACING.sm,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchBarFocused: {
    borderColor: '#FFD166',
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  searchIcon: {
    fontSize: 16,
    color: '#FFC107',
  },
  searchInput: {
    flex: 1,
    color: '#023E8A',
    fontSize: 15,
  },
  searchClear: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },

  // Categories
  categoryScroll: { marginBottom: SPACING.xs },
  categoryRow: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  catPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.3)',
  },
  catPillActive: {
    backgroundColor: 'rgba(255, 209, 102, 0.2)',
    borderColor: '#FFD166',
    borderWidth: 2,
  },
  catLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00B4D8',
  },
  catLabelActive: {
    color: '#FFC107',
    fontWeight: '700',
  },

  // Sections
  section: { marginBottom: SPACING.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFC107',
    letterSpacing: -0.3,
  },
  sectionCount: {
    fontSize: 12,
    color: '#00B4D8',
    fontWeight: '600',
  },

  // Featured cards
  featuredRow: {
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.md,
    gap: SPACING.md,
  },
  featuredCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  featuredHeader: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  featuredCircle1: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    top: -30,
    right: -20,
    opacity: 0.4,
  },
  featuredCircle2: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    bottom: -20,
    left: 10,
    opacity: 0.3,
  },
  featuredInitial: {
    fontSize: 48,
    fontWeight: '800',
    zIndex: 1,
  },
  featuredOpenBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 40,
  },
  featuredOpenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  featuredOpenText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  featuredBody: {
    padding: SPACING.md,
    gap: 4,
  },
  featuredName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#023E8A',
    letterSpacing: -0.3,
  },
  featuredDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  featuredMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  featuredMetaText: {
    fontSize: 11,
    color: '#00B4D8',
    fontWeight: '600',
  },
  featuredMetaDot: {
    color: '#CBD5E1',
    fontWeight: '700',
  },
  featuredFree: {
    color: '#00D9A3',
  },

  // Row cards
  rowList: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.2)',
    gap: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  rowCardThumb: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  rowCardInitial: {
    fontSize: 22,
    fontWeight: '800',
  },
  rowCardContent: {
    flex: 1,
    gap: 4,
  },
  rowCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  rowCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#023E8A',
    flex: 1,
    letterSpacing: -0.2,
  },
  rowCardStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 40,
    flexShrink: 0,
  },
  rowCardStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  rowCardStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  rowCardDesc: {
    fontSize: 12,
    color: '#64748B',
  },
  rowCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rowCardMetaText: {
    fontSize: 11,
    color: '#00B4D8',
    fontWeight: '600',
  },
  rowCardMetaSep: {
    color: '#CBD5E1',
    fontWeight: '700',
    fontSize: 10,
  },
  rowCardArrow: {
    fontSize: 22,
    color: '#FFD166',
    fontWeight: '400',
    flexShrink: 0,
  },

  // Loading
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: SPACING.md,
  },
  loadingText: {
    color: '#00B4D8',
    fontSize: 14,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 209, 102, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  emptyIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFD166',
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFC107',
    letterSpacing: -0.5,
  },
  emptySub: {
    fontSize: 14,
    color: '#00B4D8',
    textAlign: 'center',
  },
  emptyReset: {
    marginTop: SPACING.md,
    backgroundColor: 'rgba(255, 209, 102, 0.15)',
    borderRadius: 40,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 102, 0.4)',
  },
  emptyResetText: {
    color: '#FFC107',
    fontWeight: '700',
    fontSize: 14,
  },
});