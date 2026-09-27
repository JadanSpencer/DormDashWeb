// app/(student)/store/[id].tsx
// DormDash — Store detail (Route identity).
// Same as previous; only change is safeGoBack — router.back() failed silently
// when there was no navigation history (deep link, notification open, cold
// boot). Now falls through to the student home if there's nothing to pop.

import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TouchableOpacity,
  ActivityIndicator, Alert, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useStore, useMenu } from '../../../hooks/useStores';
import { MenuItem, CartItem } from '../../../types';
import { MAX_ITEMS_PER_ORDER } from '../../../constants';
import { usePriceUnit } from '../../../hooks/usePriceUnit';
import { PriceUnitToggle } from '../../../components/PriceUnitToggle';
import { T, useReducedMotion } from '../../../constants/theme';
import { Watermark } from '../../../components/Watermark';

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
      <Text style={[styles.hollowText, { fontSize: size }]}>{text}</Text>
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
        deliveryFee: String(store?.deliveryFee ?? 0),
        cart: JSON.stringify(cart),
      }
    });
  };

  return (
    <View style={styles.root}>
      {/* Sticky rail */}
      <Animated.View
        pointerEvents={stickyActive ? 'auto' : 'none'}
        style={[styles.sticky, { paddingTop: insets.top + 8, opacity: stickyOpacity, transform: [{ translateY: stickyTranslate }] }]}
      >
        <View style={styles.stickyRow}>
          <TouchableOpacity onPress={safeGoBack} style={styles.stickyBack} hitSlop={12}>
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
                style={({ pressed }) => [styles.chip, selectedCategory === cat && styles.chipActive, pressed && { transform: [{ scale: 0.96 }] }]}
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
        <Animated.View style={[styles.hero, { paddingTop: insets.top + T.space.md, opacity: heroFade, transform: [{ translateY: heroRise }] }]}>
          <View style={styles.heroTop}>
            <TouchableOpacity onPress={safeGoBack} style={styles.backBtn} hitSlop={12}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
            {store && (
              <View style={[styles.openBadge, { backgroundColor: store.isOpen ? T.color.tealTint : T.color.dangerTint }]}>
                <View style={[styles.openDot, { backgroundColor: store.isOpen ? T.color.teal : T.color.danger }]} />
                <Text style={[styles.openText, { color: store.isOpen ? T.color.teal : T.color.danger }]}>
                  {store.isOpen ? 'Open now' : 'Closed'}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.monogramTile}>
            <Text style={styles.monogramText}>{store?.name.charAt(0) ?? '?'}</Text>
          </View>

          <Text style={styles.storeName}>{store?.name ?? ' '}</Text>
          {store?.description ? <Text style={styles.storeDesc} numberOfLines={2}>{store.description}</Text> : null}

          {store && (
            <View style={styles.infoRow}>
              <View style={styles.infoPill}>
                <Text style={styles.infoIcon}>★</Text>
                <Text style={styles.infoText}>{store.rating.toFixed(1)}</Text>
              </View>
              <View style={styles.infoDot} />
              <View style={styles.infoPill}>
                <Text style={styles.infoIcon}>◷</Text>
                <Text style={styles.infoText}>{store.estimatedTime}</Text>
              </View>
              <View style={styles.infoDot} />
              <View style={styles.infoPill}>
                <Text style={styles.infoIcon}>◇</Text>
                <Text style={[styles.infoText, store.deliveryFee === 0 && { color: T.color.teal, fontWeight: '800' }]}>
                  {store.deliveryFee === 0 ? 'Free' : fmt(store.deliveryFee)}
                </Text>
              </View>
            </View>
          )}
        </Animated.View>

        {!loading && (
          <View style={{ paddingHorizontal: T.space.lg, paddingTop: T.space.sm }}>
            <PriceUnitToggle />
          </View>
        )}

        {!loading && categories.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {categories.map(cat => (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={({ pressed }) => [styles.chip, selectedCategory === cat && styles.chipActive, pressed && { transform: [{ scale: 0.96 }] }]}
              >
                <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}>{cat}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={T.color.cerulean} />
            <Text style={styles.loadingText}>Loading menu…</Text>
          </View>
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
            style={({ pressed }) => [styles.cartBtn, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
            <Text style={styles.cartBtnText}>View cart</Text>
            <View style={styles.cartTotalWrap}>
              <Text style={styles.cartTotalText}>{fmt(cartTotal)}</Text>
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
            style={({ pressed }) => [styles.addBtn, pressed && { transform: [{ scale: 0.94 }] }]}
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

  hero: { paddingHorizontal: T.space.lg, paddingBottom: T.space.lg, alignItems: 'flex-start' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', marginBottom: T.space.lg },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: T.color.card,
    justifyContent: 'center', alignItems: 'center', ...T.shadow.card,
  },
  backText: { fontSize: 20, fontWeight: '700', color: T.color.ink },
  openBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: T.space.md, paddingVertical: 7, borderRadius: T.radius.pill },
  openDot: { width: 6, height: 6, borderRadius: 3 },
  openText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },

  monogramTile: {
    width: 96, height: 96, borderRadius: 28, backgroundColor: T.color.ceruleanTint,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    marginBottom: T.space.lg, borderWidth: 1, borderColor: 'rgba(14, 143, 181, 0.2)',
  },
  monogramCircle1: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: T.color.cerulean, opacity: 0.14, top: -20, right: -20 },
  monogramCircle2: { position: 'absolute', width: 50, height: 50, borderRadius: 25, backgroundColor: T.color.teal, opacity: 0.14, bottom: -10, left: -10 },
  monogramText: { fontSize: 44, fontWeight: '900', color: T.color.cerulean, letterSpacing: -1 },

  eyebrow: { ...T.type.label, color: T.color.teal, marginBottom: 6 },
  storeName: { ...T.type.display, fontSize: 34, color: T.color.ink, marginBottom: 6 },
  storeDesc: { ...T.type.body, color: T.color.inkSoft, marginBottom: T.space.md },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: T.space.sm, marginTop: T.space.xs },
  infoPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: T.color.card,
    borderRadius: T.radius.pill, paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: T.color.line,
  },
  infoIcon: { fontSize: 12, color: T.color.cerulean, fontWeight: '800' },
  infoText: { fontSize: 12, fontWeight: '700', color: T.color.ink },
  infoDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: T.color.lineStrong },

  sticky: {
    position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: T.color.cream,
    zIndex: 10, borderBottomWidth: 1, borderBottomColor: T.color.line, paddingBottom: T.space.sm,
  },
  stickyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.space.lg, marginBottom: T.space.sm },
  stickyBack: {
    width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center',
    backgroundColor: T.color.card, borderWidth: 1, borderColor: T.color.line,
  },
  stickyBackText: { fontSize: 16, color: T.color.ink, fontWeight: '700' },
  stickyTitle: { ...T.type.body, fontWeight: '800', color: T.color.ink, flex: 1, textAlign: 'center', marginHorizontal: T.space.sm },

  chipRow: { paddingHorizontal: T.space.lg, paddingVertical: T.space.sm, gap: T.space.sm },
  chip: { paddingHorizontal: T.space.md, paddingVertical: 8, borderRadius: T.radius.pill, backgroundColor: T.color.card, borderWidth: 1.5, borderColor: T.color.line },
  chipActive: { backgroundColor: T.color.ceruleanTint, borderColor: T.color.cerulean },
  chipText: { ...T.type.body, fontSize: 13, fontWeight: '700', color: T.color.inkSoft },
  chipTextActive: { color: T.color.cerulean },

  menuList: { paddingHorizontal: T.space.lg, paddingTop: T.space.sm },
  catHeader: { ...T.type.label, color: T.color.inkSoft, marginTop: T.space.lg, marginBottom: T.space.sm },

  itemCard: {
    flexDirection: 'row', alignItems: 'stretch', borderRadius: T.radius.lg,
    padding: T.space.md, marginBottom: T.space.md, borderWidth: 1.5,
    gap: T.space.md, ...T.shadow.card, shadowOpacity: 0.04,
  },
  itemInfo: { flex: 1, gap: 4 },
  itemName: { ...T.type.body, fontSize: 15, fontWeight: '800', color: T.color.ink },
  itemDesc: { ...T.type.body, fontSize: 12, color: T.color.inkSoft, lineHeight: 17 },
  allergens: { fontSize: 11, color: T.color.danger, fontWeight: '700', marginTop: 2 },

  pricePlate: { alignSelf: 'flex-start', marginTop: 8 },
  hollowText: { fontWeight: '900', color: T.color.cerulean, letterSpacing: -0.3 },

  qtyControl: { justifyContent: 'center' },
  addBtn: {
    backgroundColor: T.color.cerulean, borderRadius: T.radius.pill,
    paddingHorizontal: T.space.md, paddingVertical: 10, ...T.shadow.button, shadowOpacity: 0.06,
  },
  addBtnText: { color: T.color.card, fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: T.color.creamDeep,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: T.color.line,
  },
  qtyBtnAdd: { backgroundColor: T.color.cerulean, borderColor: T.color.cerulean },
  qtyBtnText: { fontSize: 18, fontWeight: '800', color: T.color.ink, lineHeight: 22 },
  qtyBtnTextAdd: { color: T.color.card },
  qtyNum: { ...T.type.body, fontSize: 15, fontWeight: '900', color: T.color.ink, minWidth: 20, textAlign: 'center' },

  cartBar: {
    position: 'absolute', bottom: 24, left: 0, right: 0,
    paddingHorizontal: T.space.lg, paddingTop: T.space.md, backgroundColor: T.color.cream,
    borderTopWidth: 1, borderTopColor: T.color.line,
  },
  cartBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: T.color.cerulean,
    borderRadius: T.radius.pill, height: 56, paddingHorizontal: T.space.md, ...T.shadow.button,
  },
  cartBadge: {
    backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 12, minWidth: 26, height: 26,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, marginRight: T.space.sm,
  },
  cartBadgeText: { color: T.color.card, fontSize: 13, fontWeight: '900' },
  cartBtnText: { flex: 1, color: T.color.card, fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  cartTotalWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartTotalText: { color: T.color.card, fontSize: 15, fontWeight: '900' },
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
