// app/(student)/store/[id].tsx
// DormDash — Store detail, "Tide Print" style (constants/theme.ts): the
// store's mark and details on the sea band, menu items on print plates.
// Same as previous; only change is safeGoBack — router.back() failed silently
// when there was no navigation history (deep link, notification open, cold
// boot). Now falls through to the student home if there's nothing to pop.

import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TouchableOpacity,
  Alert, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useStore, useMenu } from '../../../hooks/useStores';
import { MenuItem, CartItem } from '../../../types';
import { MAX_ITEMS_PER_ORDER, DELIVERY_FEE_JMD } from '../../../constants';
import { usePriceUnit } from '../../../hooks/usePriceUnit';
import { PriceUnitToggle } from '../../../components/PriceUnitToggle';
import { T, useReducedMotion } from '../../../constants/theme';
import { Watermark } from '../../../components/Watermark';
import { Backdrop } from '../../../components/Backdrop';
import { TideBand, StoreMark, pressPlate } from '../../../components/Tide';
import { SkeletonGroup, MenuItemSkeleton, Bone } from '../../../components/Skeleton';
import { Money } from '../../../components/Money';

// Fallback-safe navigation. When a user lands on a store via notification
// or fresh app boot, there's no back stack — pop would leave a black screen.
const safeGoBack = () => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/(student)/(tabs)/home');
  }
};

const HollowPrice: React.FC<{ value: number; size?: number }> = ({ value, size = 16 }) => {
  const { fmt } = usePriceUnit(); // J$ or tokens, whichever the student chose
  const text = fmt(value);
  return (
    <View style={styles.pricePlate}>
      <Money style={[styles.hollowText, { fontSize: size }]}>{text}</Money>
    </View>
  );
};

export default function StoreMenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const { fmt } = usePriceUnit();
  // Store details are reused from a short-lived cache; the menu is live and
  // hides switched-off items (hooks/useStores.ts).
  const store = useStore(id, { cached: true });
  const { items: menuItems, loading } = useMenu(id, { availableOnly: true });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [addedItemId, setAddedItemId] = useState<string | null>(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const [stickyActive, setStickyActive] = useState(false);
  const cartPulse = useRef(new Animated.Value(1)).current;
  const heroFade = useRef(new Animated.Value(0.4)).current;
  const heroRise = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroFade, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(heroRise, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const addToCart = (item: MenuItem) => {
    const totalItems = cart.reduce((sum, c) => sum + c.quantity, 0);
    if (totalItems >= MAX_ITEMS_PER_ORDER) {
      Alert.alert('Cart Full', `Maximum ${MAX_ITEMS_PER_ORDER} items per order.`);
      return;
    }
    setCart(prev => {
      const existing = prev.find(c => c.menuItem.id === item.id);
      if (existing) {
        return prev.map(c => c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
    setAddedItemId(item.id);
    setTimeout(() => setAddedItemId(null), 700);
    if (!reduced) {
      Animated.sequence([
        Animated.spring(cartPulse, { toValue: 1.06, friction: 4, useNativeDriver: true }),
        Animated.spring(cartPulse, { toValue: 1, friction: 5, useNativeDriver: true }),
      ]).start();
    }
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItem.id === itemId);
      if (existing && existing.quantity > 1) {
        return prev.map(c => c.menuItem.id === itemId ? { ...c, quantity: c.quantity - 1 } : c);
      }
      return prev.filter(c => c.menuItem.id !== itemId);
    });
  };

  const getQuantity = (itemId: string) => cart.find(c => c.menuItem.id === itemId)?.quantity ?? 0;
  const cartTotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0);
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const categories = ['All', ...Array.from(new Set(menuItems.map(i => i.category)))];
  const filtered = selectedCategory === 'All' ? menuItems : menuItems.filter(i => i.category === selectedCategory);
  const grouped = filtered.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const stickyOpacity = scrollY.interpolate({ inputRange: [180, 240], outputRange: [0, 1], extrapolate: 'clamp' });
  const stickyTranslate = scrollY.interpolate({ inputRange: [180, 240], outputRange: [-40, 0], extrapolate: 'clamp' });

  const goCheckout = () => {
    router.push({
      pathname: '/(student)/checkout',
      params: {
        storeId: id!,
        storeName: store?.name ?? '',
        cart: JSON.stringify(cart),
      }
    });
  };

  return (
    <View style={styles.root}>
      <Backdrop tone="cream" />
      {/* Sticky rail */}
      <Animated.View
        pointerEvents={stickyActive ? 'auto' : 'none'}
        style={[styles.sticky, { paddingTop: insets.top + 8, opacity: stickyOpacity, transform: [{ translateY: stickyTranslate }] }]}
      >
        <View style={styles.stickyRow}>
          <TouchableOpacity onPress={safeGoBack} style={styles.stickyBack} hitSlop={12} accessibilityLabel="Back">
            <Text style={styles.stickyBackText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.stickyTitle} numberOfLines={1}>{store?.name ?? ''}</Text>
          <View style={{ width: 32 }} />
        </View>
        {categories.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {categories.map(cat => (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={({ pressed }) => [styles.chip, selectedCategory === cat && styles.chipActive, pressPlate(pressed, 3)]}
              >
                <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}>{cat}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Animated.View>

      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (e: any) => {
              const y = e.nativeEvent.contentOffset.y;
              setStickyActive(prev => (y > 210) === prev ? prev : y > 210);
            },
          }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: cartCount > 0 ? 140 : 80 + insets.bottom }}
      >
        <TideBand>
          <Animated.View style={[styles.hero, { paddingTop: insets.top + T.space.md, opacity: heroFade, transform: [{ translateY: heroRise }] }]}>
            <View style={styles.heroTop}>
              <Pressable onPress={safeGoBack} style={({ pressed }) => [styles.backBtn, pressPlate(pressed, 3)]} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
                <Text style={styles.backText}>←</Text>
              </Pressable>
              {store && (
                <View style={styles.openBadge}>
                  <View style={[styles.openDot, { backgroundColor: store.isOpen ? T.color.tealBright : T.color.danger }]} />
                  <Text style={styles.openText}>{store.isOpen ? 'Open now' : 'Closed'}</Text>
                </View>
              )}
            </View>

            <View style={styles.heroMain}>
              {store ? <StoreMark id={store.id} name={store.name} size={84} radius={T.radius.lg} muted={!store.isOpen} style={styles.heroMark} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.storeName}>{store?.name ?? ' '}</Text>
                {store?.description ? <Text style={styles.storeDesc} numberOfLines={2}>{store.description}</Text> : null}
              </View>
            </View>

            {store && (
              <View style={styles.infoRow}>
                <View style={styles.infoPill}>
                  <Text style={styles.infoIcon}>★</Text>
                  <Text style={styles.infoText}>{store.rating.toFixed(1)}</Text>
                </View>
                <View style={styles.infoPill}>
                  <Text style={styles.infoIcon}>◷</Text>
                  <Text style={styles.infoText}>{store.estimatedTime}</Text>
                </View>
                <View style={styles.infoPill}>
                  <Text style={styles.infoIcon}>◇</Text>
                  <Text style={styles.infoText}>{fmt(DELIVERY_FEE_JMD)} delivery</Text>
                </View>
              </View>
            )}
          </Animated.View>
        </TideBand>

        {!loading && (
          <View style={{ paddingHorizontal: T.space.lg, paddingTop: T.space.md }}>
            <PriceUnitToggle />
          </View>
        )}

        {!loading && categories.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {categories.map(cat => (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={({ pressed }) => [styles.chip, selectedCategory === cat && styles.chipActive, pressPlate(pressed, 3)]}
              >
                <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}>{cat}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {loading ? (
          <SkeletonGroup label="Loading menu…" style={styles.menuList}>
            <Bone w={110} h={22} style={{ marginTop: T.space.lg, marginBottom: T.space.md }} />
            {[0, 1, 2].map(i => <View key={i} style={{ marginBottom: T.space.md + 2 }}><MenuItemSkeleton /></View>)}
          </SkeletonGroup>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIconTile}><View style={styles.emptyIconInner} /></View>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptySub}>This store hasn't added items in this category.</Text>
          </View>
        ) : (
          <View style={styles.menuList}>
            {Object.entries(grouped).map(([cat, items]) => (
              <View key={cat}>
                <Text style={styles.catHeader}>{cat}</Text>
                {items.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    qty={getQuantity(item.id)}
                    flashing={addedItemId === item.id}
                    onAdd={() => addToCart(item)}
                    onRemove={() => removeFromCart(item.id)}
                    reduced={reduced}
                  />
                ))}
              </View>
            ))}
          </View>
        )}
        <Watermark variant="inline" tint="teal" />
      </Animated.ScrollView>

      {cartCount > 0 && (
        <Animated.View style={[styles.cartBar, { paddingBottom: insets.bottom + T.space.md, transform: [{ scale: cartPulse }] }]}>
          <Pressable
            onPress={goCheckout}
            style={({ pressed }) => [styles.cartBtn, pressPlate(pressed)]}
          >
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
            <Text style={styles.cartBtnText}>View cart</Text>
            <View style={styles.cartTotalWrap}>
              <Money style={styles.cartTotalText}>{fmt(cartTotal)}</Money>
              <Text style={styles.cartArrow}>→</Text>
            </View>
          </Pressable>
        </Animated.View>
      )}

    </View>
  );
}

const ItemCard: React.FC<{
  item: MenuItem;
  qty: number;
  flashing: boolean;
  onAdd: () => void;
  onRemove: () => void;
  reduced: boolean;
}> = ({ item, qty, flashing, onAdd, onRemove, reduced }) => {
  const flash = useRef(new Animated.Value(0)).current;
  const plusScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!flashing || reduced) return;
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 220, useNativeDriver: false }),
      Animated.timing(flash, { toValue: 0, duration: 480, useNativeDriver: false }),
    ]).start();
  }, [flashing]);

  const springPlus = () => {
    if (reduced) return;
    Animated.sequence([
      Animated.spring(plusScale, { toValue: 0.9, friction: 4, useNativeDriver: true }),
      Animated.spring(plusScale, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
  };

  const borderColor = flash.interpolate({ inputRange: [0, 1], outputRange: [T.color.line, T.color.teal] });
  const bgColor = flash.interpolate({ inputRange: [0, 1], outputRange: [T.color.card, T.color.tealTint] });

  return (
    <Animated.View style={[styles.itemCard, { borderColor, backgroundColor: bgColor }]}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
        {item.description ? <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text> : null}
        {item.allergens && item.allergens.length > 0 && (
          <Text style={styles.allergens}>Contains: {item.allergens.join(', ')}</Text>
        )}
        <HollowPrice value={item.price} size={16} />
      </View>

      <View style={styles.qtyControl}>
        {qty === 0 ? (
          <Pressable
            onPress={() => { onAdd(); springPlus(); }}
            style={({ pressed }) => [styles.addBtn, pressPlate(pressed, 3)]}
          >
            <Animated.View style={{ transform: [{ scale: plusScale }] }}>
              <Text style={styles.addBtnText}>＋ Add</Text>
            </Animated.View>
          </Pressable>
        ) : (
          <View style={styles.qtyRow}>
            <Pressable onPress={onRemove} style={({ pressed }) => [styles.qtyBtn, pressed && { transform: [{ scale: 0.9 }] }]}>
              <Text style={styles.qtyBtnText}>−</Text>
            </Pressable>
            <Text style={styles.qtyNum}>{qty}</Text>
            <Pressable
              onPress={() => { onAdd(); springPlus(); }}
              style={({ pressed }) => [styles.qtyBtn, styles.qtyBtnAdd, pressed && { transform: [{ scale: 0.9 }] }]}
            >
              <Animated.Text style={[styles.qtyBtnText, styles.qtyBtnTextAdd, { transform: [{ scale: plusScale }] }]}>
                ＋
              </Animated.Text>
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.cream },
  canvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: -1 },
  blobTeal: { position: 'absolute', width: 240, height: 240, borderRadius: 120, backgroundColor: T.color.teal, opacity: 0.06, top: 80, right: -80 },
  blobCerulean: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: T.color.cerulean, opacity: 0.05, top: 300, left: -120 },

  hero: { paddingHorizontal: T.space.lg, paddingBottom: T.space.lg + 4 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: T.space.lg },
  backBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: T.color.card,
    justifyContent: 'center', alignItems: 'center', ...T.plate.sea, shadowOffset: { width: 0, height: 3 },
  },
  backText: { fontSize: 20, fontWeight: '700', color: T.color.sea },
  openBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: T.space.md, paddingVertical: 7,
    borderRadius: T.radius.pill, backgroundColor: 'rgba(7, 42, 64, 0.6)',
    borderWidth: 1, borderColor: 'rgba(127, 214, 200, 0.35)',
  },
  openDot: { width: 7, height: 7, borderRadius: 4 },
  openText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3, color: T.color.card },

  heroMain: { flexDirection: 'row', alignItems: 'center', gap: T.space.md },
  heroMark: { borderWidth: 3, borderColor: T.color.card, ...T.plate.sea },
  storeName: { ...T.type.display, fontSize: 32, lineHeight: 38, color: T.color.card },
  storeDesc: { ...T.type.body, fontSize: 14, color: T.color.seaSoft, marginTop: 4 },

  infoRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: T.space.sm, marginTop: T.space.lg },
  infoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(7, 42, 64, 0.55)',
    borderRadius: T.radius.pill, paddingVertical: 7, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(169, 211, 230, 0.3)',
  },
  infoIcon: { fontSize: 12, color: T.color.seaFoam, fontWeight: '800' },
  infoText: { fontSize: 12, fontWeight: '800', color: T.color.card },

  sticky: {
    position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: T.color.sea,
    zIndex: 10, paddingBottom: T.space.sm, ...T.plate.card,
  },
  stickyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.space.lg, marginBottom: T.space.sm },
  stickyBack: {
    width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center',
    backgroundColor: T.color.card,
  },
  stickyBackText: { fontSize: 16, color: T.color.sea, fontWeight: '700' },
  stickyTitle: { ...T.type.title, fontSize: 18, color: T.color.card, flex: 1, textAlign: 'center', marginHorizontal: T.space.sm },

  chipRow: { paddingHorizontal: T.space.lg, paddingTop: T.space.sm, paddingBottom: T.space.sm + 4, gap: T.space.sm },
  chip: {
    paddingHorizontal: T.space.md, paddingVertical: 9, borderRadius: T.radius.pill, backgroundColor: T.color.card,
    borderWidth: 1.5, borderColor: T.color.lineStrong, ...T.plate.card, shadowOffset: { width: 0, height: 3 },
  },
  chipActive: { backgroundColor: T.color.teal, borderColor: T.color.teal, ...T.plate.teal, shadowOffset: { width: 0, height: 3 } },
  chipText: { ...T.type.body, fontSize: 13, fontWeight: '800', color: T.color.inkSoft },
  chipTextActive: { color: T.color.card },

  menuList: { paddingHorizontal: T.space.lg, paddingTop: T.space.xs },
  catHeader: { ...T.type.title, fontSize: 21, color: T.color.ink, marginTop: T.space.lg, marginBottom: T.space.md },

  itemCard: {
    flexDirection: 'row', alignItems: 'stretch', borderRadius: T.radius.lg,
    padding: T.space.md, marginBottom: T.space.md + 2, borderWidth: 1.5,
    gap: T.space.md, ...T.plate.card,
  },
  itemInfo: { flex: 1, gap: 4 },
  itemName: { ...T.type.body, fontSize: 16, fontWeight: '800', color: T.color.ink },
  itemDesc: { ...T.type.body, fontSize: 13, color: T.color.inkSoft, lineHeight: 18 },
  allergens: { fontSize: 12, color: T.color.danger, fontWeight: '700', marginTop: 2 },

  pricePlate: {
    alignSelf: 'flex-start', marginTop: 8,
    backgroundColor: T.color.ceruleanTint, borderRadius: T.radius.sm, paddingHorizontal: 8, paddingVertical: 3,
  },
  hollowText: { fontWeight: '900', color: T.color.cerulean, letterSpacing: -0.3 },

  qtyControl: { justifyContent: 'center' },
  addBtn: {
    backgroundColor: T.color.cerulean, borderRadius: T.radius.pill,
    paddingHorizontal: T.space.md, paddingVertical: 10, ...T.plate.cerulean, shadowOffset: { width: 0, height: 3 },
  },
  addBtnText: { color: T.color.card, fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: T.color.creamDeep,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: T.color.line,
  },
  qtyBtnAdd: { backgroundColor: T.color.cerulean, borderColor: T.color.cerulean, ...T.plate.cerulean, shadowOffset: { width: 0, height: 2 } },
  qtyBtnText: { fontSize: 18, fontWeight: '800', color: T.color.ink, lineHeight: 22 },
  qtyBtnTextAdd: { color: T.color.card },
  qtyNum: { ...T.type.body, fontSize: 16, fontWeight: '900', color: T.color.ink, minWidth: 20, textAlign: 'center' },

  cartBar: {
    position: 'absolute', bottom: 24, left: 0, right: 0,
    paddingHorizontal: T.space.lg, paddingTop: T.space.md,
  },
  cartBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: T.color.teal,
    borderRadius: T.radius.pill, height: 58, paddingHorizontal: T.space.md, ...T.plate.teal, shadowOffset: { width: 0, height: 5 },
  },
  cartBadge: {
    backgroundColor: T.color.card, borderRadius: 13, minWidth: 26, height: 26,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, marginRight: T.space.sm,
  },
  cartBadgeText: { color: T.color.teal, fontSize: 13, fontWeight: '900' },
  cartBtnText: { flex: 1, color: T.color.card, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  cartTotalWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartTotalText: { color: T.color.card, fontSize: 16, fontWeight: '900' },
  cartArrow: { color: T.color.card, fontSize: 18, fontWeight: '800' },

  loading: { paddingTop: 60, alignItems: 'center', gap: T.space.md },
  loadingText: { ...T.type.body, color: T.color.inkSoft, fontWeight: '600' },
  empty: { paddingTop: 60, alignItems: 'center', paddingHorizontal: T.space.xl, gap: T.space.sm },
  emptyIconTile: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: T.color.ceruleanTint,
    justifyContent: 'center', alignItems: 'center', marginBottom: T.space.sm,
  },
  emptyIconInner: { width: 24, height: 24, borderRadius: 8, backgroundColor: T.color.cerulean, opacity: 0.4 },
  emptyTitle: { ...T.type.title, fontSize: 20, color: T.color.ink },
  emptySub: { ...T.type.body, color: T.color.inkSoft, textAlign: 'center' },
});
