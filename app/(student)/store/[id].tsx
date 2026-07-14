// app/(student)/store/[id].tsx
// Students browse menu items and add to cart.
// Cart lives in local state — only hits Firestore when order is placed.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, getDoc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { Store, MenuItem, CartItem } from '../../../types';
import { COLORS, SPACING, RADIUS, MAX_ORDER_ITEMS, formatJMD } from '../../../constants';
import { appCache, CACHE_KEYS, CACHE_TTL } from '../../../services/cache';

export default function StoreMenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [store, setStore] = useState<Store | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');

  

  // Load store info — check cache first
  useEffect(() => {
    if (!id) return;

    // Try cache first — instant load
    const cached = appCache.get<Store>(CACHE_KEYS.STORE(id));
    if (cached) {
      setStore(cached);
      return;
    }

    // Not in cache — fetch from Firestore
    getDoc(doc(db, 'stores', id)).then(snap => {
      if (snap.exists()) {
        const storeData = { id: snap.id, ...snap.data() } as Store;
        setStore(storeData);
        // Store in cache for next time
        appCache.set(CACHE_KEYS.STORE(id), storeData, CACHE_TTL.STORES);
      }
    });
  }, [id]);

  // Real-time menu items listener
  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, 'stores', id, 'menuItems'),
      orderBy('category', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setMenuItems(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as MenuItem))
          .filter(item => item.isAvailable) // Only show available items
      );
      setLoading(false);
    });
    return unsub;
  }, [id]);

  // ── CART LOGIC ─────────────────────────────────────────────────────
  const addToCart = (item: MenuItem) => {
    const totalItems = cart.reduce((sum, c) => sum + c.quantity, 0);
    if (totalItems >= MAX_ORDER_ITEMS) {
      Alert.alert('Cart Full', `Maximum ${MAX_ORDER_ITEMS} items per order.`);
      return;
    }
    setCart(prev => {
      const existing = prev.find(c => c.menuItem.id === item.id);
      if (existing) {
        return prev.map(c =>
          c.menuItem.id === item.id
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev.find(c => c.menuItem.id === itemId);
      if (existing && existing.quantity > 1) {
        return prev.map(c =>
          c.menuItem.id === itemId
            ? { ...c, quantity: c.quantity - 1 }
            : c
        );
      }
      return prev.filter(c => c.menuItem.id !== itemId);
    });
  };

  const getQuantity = (itemId: string) =>
    cart.find(c => c.menuItem.id === itemId)?.quantity ?? 0;

  const cartTotal = cart.reduce((sum, c) => sum + c.menuItem.price * c.quantity, 0);
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  // Categories from actual menu items
  const categories = ['All', ...Array.from(new Set(menuItems.map(i => i.category)))];

  const filtered = selectedCategory === 'All'
    ? menuItems
    : menuItems.filter(i => i.category === selectedCategory);

  // Group by category
  const grouped = filtered.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const STORE_COLORS = ['#FF6B35','#00D9A3','#3B82F6','#8B5CF6','#EC4899','#F59E0B'];
  const storeColor = store
    ? STORE_COLORS[Math.abs(store.name.split('').reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % STORE_COLORS.length]
    : COLORS.primary;

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>

        {/* ── STORE HERO ─────────────────────────────────────── */}
        <View style={[styles.hero, { backgroundColor: storeColor, paddingTop: insets.top + SPACING.md }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <View style={styles.heroCircle1} />
          <View style={styles.heroCircle2} />
          <Text style={styles.heroInitial}>{store?.name.charAt(0) ?? '?'}</Text>
          <Text style={styles.heroName}>{store?.name}</Text>
          <View style={styles.heroMeta}>
            <Text style={styles.heroMetaText}>⭐ {store?.rating.toFixed(1)}</Text>
            <Text style={styles.heroMetaDot}>·</Text>
            <Text style={styles.heroMetaText}>🕐 {store?.estimatedTime}</Text>
            <Text style={styles.heroMetaDot}>·</Text>
            <Text style={styles.heroMetaText}>
              {store?.deliveryFee === 0 ? '🎉 Free delivery' : `$${store?.deliveryFee} delivery`}
            </Text>
          </View>
          {store && (
            <View style={[styles.openBadge, { backgroundColor: store.isOpen ? '#00D9A3' : '#FF4757' }]}>
              <Text style={styles.openBadgeText}>{store.isOpen ? '● Open' : '● Closed'}</Text>
            </View>
          )}
        </View>

        {/* ── CATEGORY PILLS ─────────────────────────────────── */}
        {!loading && categories.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catRow}
            style={styles.catScroll}
          >
            {categories.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.catPill, selectedCategory === cat && styles.catPillActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.catText, selectedCategory === cat && { color: COLORS.primary }]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── MENU ITEMS ─────────────────────────────────────── */}
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🍽</Text>
            <Text style={styles.emptyText}>No items available</Text>
          </View>
        ) : (
          <View style={styles.menuList}>
            {Object.entries(grouped).map(([cat, items]) => (
              <View key={cat}>
                <Text style={styles.catHeader}>{cat}</Text>
                {items.map(item => {
                  const qty = getQuantity(item.id);
                  return (
                    <View key={item.id} style={styles.itemCard}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        {item.description ? (
                          <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                        ) : null}
                        {item.allergens && item.allergens.length > 0 && (
                          <Text style={styles.allergens}>⚠ {item.allergens.join(', ')}</Text>
                        )}
                        <Text style={styles.itemPrice}>{formatJMD(item.price)}</Text>
                      </View>

                      {/* Add/Remove controls */}
                      <View style={styles.qtyControl}>
                        {qty === 0 ? (
                          <TouchableOpacity
                            style={[styles.addBtn, { backgroundColor: storeColor }]}
                            onPress={() => addToCart(item)}
                          >
                            <Text style={styles.addBtnText}>+ Add</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.qtyRow}>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => removeFromCart(item.id)}
                            >
                              <Text style={styles.qtyBtnText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.qtyNum}>{qty}</Text>
                            <TouchableOpacity
                              style={[styles.qtyBtn, { backgroundColor: storeColor + '33', borderColor: storeColor }]}
                              onPress={() => addToCart(item)}
                            >
                              <Text style={[styles.qtyBtnText, { color: storeColor }]}>+</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* ── CART BUTTON (sticky bottom) ────────────────────── */}
      {cartCount > 0 && (
        <View style={[styles.cartBar, { paddingBottom: insets.bottom + SPACING.md }]}>
          <TouchableOpacity
            style={[styles.cartBtn, { backgroundColor: storeColor }]}
            onPress={() => router.push({
              pathname: '/(student)/checkout',
              params: {
                storeId: id!,
                storeName: store?.name ?? '',
                deliveryFee: store?.deliveryFee ?? 0,
                cart: JSON.stringify(cart),
              }
            })}
            activeOpacity={0.9}
          >
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
            <Text style={styles.cartBtnText}>View Cart</Text>
            <Text style={styles.cartTotal}>{formatJMD(cartTotal)}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0E1A' },

  // Hero
  hero: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    overflow: 'hidden',
    alignItems: 'center',
    minHeight: 200,
    justifyContent: 'flex-end',
  },
  backBtn: {
    position: 'absolute',
    top: 56,
    left: SPACING.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  backText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  heroCircle1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.12)', top: -50, right: -30 },
  heroCircle2: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.08)', bottom: -20, left: 20 },
  heroInitial: { fontSize: 60, fontWeight: '900', color: 'rgba(255,255,255,0.25)', marginBottom: SPACING.xs },
  heroName: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5, textAlign: 'center' },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  heroMetaText: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  heroMetaDot: { color: 'rgba(255,255,255,0.4)', fontWeight: '900' },
  openBadge: { marginTop: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: 5, borderRadius: RADIUS.full },
  openBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // Categories
  catScroll: { borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  catRow: { paddingHorizontal: SPACING.lg, gap: SPACING.sm, paddingVertical: SPACING.md },
  catPill: { paddingHorizontal: SPACING.md, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: '#141828', borderWidth: 1.5, borderColor: '#1F2937' },
  catPillActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '18' },
  catText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },

  // Menu
  menuList: { padding: SPACING.lg, gap: SPACING.xs },
  catHeader: { fontSize: 11, fontWeight: '900', color: '#4B5563', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: SPACING.lg, marginBottom: SPACING.sm },
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141828', borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: '#1F2937', gap: SPACING.md },
  itemInfo: { flex: 1, gap: 3 },
  itemName: { fontSize: 15, fontWeight: '800', color: '#fff' },
  itemDesc: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  allergens: { fontSize: 11, color: COLORS.warning, fontWeight: '600' },
  itemPrice: { fontSize: 15, fontWeight: '900', color: COLORS.primary, marginTop: 4 },

  // Quantity controls
  qtyControl: { alignItems: 'center' },
  addBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.md },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  qtyBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1F2937', borderWidth: 1.5, borderColor: '#374151', justifyContent: 'center', alignItems: 'center' },
  qtyBtnText: { color: '#9CA3AF', fontSize: 18, fontWeight: '700', lineHeight: 22 },
  qtyNum: { fontSize: 16, fontWeight: '900', color: '#fff', minWidth: 20, textAlign: 'center' },

  // Cart bar
  cartBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, backgroundColor: '#0A0E1A', borderTopWidth: 1, borderTopColor: '#1F2937' },
  cartBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.lg, height: 56, paddingHorizontal: SPACING.lg },
  cartBadge: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm },
  cartBadgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  cartBtnText: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '800' },
  cartTotal: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '900' },

  // Loading / empty
  loading: { paddingTop: 80, justifyContent: 'center', alignItems: 'center' },
  empty: { paddingTop: 80, alignItems: 'center', gap: SPACING.sm },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: 18, fontWeight: '800', color: '#fff' },
});