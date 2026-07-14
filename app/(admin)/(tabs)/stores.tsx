// app/(admin)/(tabs)/stores.tsx
// Admin store management — list all stores, add new, edit, delete, toggle open/closed.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, ScrollView, Alert, Switch, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy,
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { Store } from '../../../types';
import { SPACING, formatJMD } from '../../../constants';

const CATEGORIES = ['Fast Food', 'Grocery', 'Pharmacy', 'Drinks', 'Snacks', 'Other'];

const blankForm = () => ({
  name: '',
  description: '',
  category: 'Fast Food',
  deliveryFee: '0',
  estimatedTime: '20-30 mins',
  rating: '5.0',
  isOpen: true,
  address: '',
  latitude: '',
  longitude: '',
});

// Store Form Modal
const StoreFormModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  initialData?: Store | null;
}> = ({ visible, onClose, initialData }) => {
  const isEdit = !!initialData;
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name,
        description: initialData.description,
        category: initialData.category,
        deliveryFee: String(initialData.deliveryFee),
        estimatedTime: initialData.estimatedTime,
        rating: String(initialData.rating),
        isOpen: initialData.isOpen,
        address: initialData.location.address,
        latitude: String(initialData.location.latitude),
        longitude: String(initialData.location.longitude),
      });
    } else {
      setForm(blankForm());
    }
    setError('');
  }, [initialData, visible]);

  const setField = (field: string, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const validate = () => {
    if (!form.name.trim()) return 'Store name is required';
    if (!form.description.trim()) return 'Description is required';
    if (!form.address.trim()) return 'Address is required';
    const fee = parseFloat(form.deliveryFee);
    if (isNaN(fee) || fee < 0) return 'Delivery fee must be a valid number';
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSaving(true);
    setError('');

    const data = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      deliveryFee: parseFloat(form.deliveryFee) || 0,
      estimatedTime: form.estimatedTime.trim() || '20-30 mins',
      rating: parseFloat(form.rating) || 5.0,
      isOpen: form.isOpen,
      location: {
        address: form.address.trim(),
        latitude: parseFloat(form.latitude) || 0,
        longitude: parseFloat(form.longitude) || 0,
      },
    };

    try {
      if (isEdit && initialData) {
        await updateDoc(doc(db, 'stores', initialData.id), data);
      } else {
        await addDoc(collection(db, 'stores'), {
          ...data,
          createdAt: Date.now(),
        });
      }
      onClose();
    } catch (e: any) {
      setError('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modalStyles.container}>
        <View style={modalStyles.header}>
          <Text style={modalStyles.title}>{isEdit ? 'Edit Store' : 'New Store'}</Text>
          <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
            <Text style={modalStyles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={modalStyles.scroll} showsVerticalScrollIndicator={false}>
          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>store name</Text>
            <TextInput
              style={modalStyles.input}
              value={form.name}
              onChangeText={v => setField('name', v)}
              placeholder="e.g., Campus Burger"
              placeholderTextColor="#444444"
            />
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>description</Text>
            <TextInput
              style={[modalStyles.input, modalStyles.textArea]}
              value={form.description}
              onChangeText={v => setField('description', v)}
              placeholder="What do you sell?"
              placeholderTextColor="#444444"
              multiline
            />
          </View>

          <Text style={modalStyles.label}>category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={modalStyles.categoryScroll}>
            <View style={modalStyles.categoryRow}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[modalStyles.categoryChip, form.category === cat && modalStyles.categoryChipActive]}
                  onPress={() => setField('category', cat)}
                >
                  <Text style={[modalStyles.categoryText, form.category === cat && modalStyles.categoryTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={modalStyles.row}>
            <View style={modalStyles.halfField}>
              <Text style={modalStyles.label}>delivery fee</Text>
              <TextInput
                style={modalStyles.input}
                value={form.deliveryFee}
                onChangeText={v => setField('deliveryFee', v)}
                placeholder="0.00"
                placeholderTextColor="#444444"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={modalStyles.halfField}>
              <Text style={modalStyles.label}>est. time</Text>
              <TextInput
                style={modalStyles.input}
                value={form.estimatedTime}
                onChangeText={v => setField('estimatedTime', v)}
                placeholder="20-30 mins"
                placeholderTextColor="#444444"
              />
            </View>
          </View>

          <View style={modalStyles.field}>
            <Text style={modalStyles.label}>address</Text>
            <TextInput
              style={modalStyles.input}
              value={form.address}
              onChangeText={v => setField('address', v)}
              placeholder="Building / street name"
              placeholderTextColor="#444444"
            />
          </View>

          <View style={modalStyles.row}>
            <View style={modalStyles.halfField}>
              <Text style={modalStyles.label}>latitude</Text>
              <TextInput
                style={modalStyles.input}
                value={form.latitude}
                onChangeText={v => setField('latitude', v)}
                placeholder="18.0179"
                placeholderTextColor="#444444"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={modalStyles.halfField}>
              <Text style={modalStyles.label}>longitude</Text>
              <TextInput
                style={modalStyles.input}
                value={form.longitude}
                onChangeText={v => setField('longitude', v)}
                placeholder="-76.8099"
                placeholderTextColor="#444444"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={modalStyles.toggleRow}>
            <View>
              <Text style={modalStyles.label}>store status</Text>
              <Text style={modalStyles.toggleSub}>Students see this live</Text>
            </View>
            <Switch
              value={form.isOpen}
              onValueChange={v => setField('isOpen', v)}
              trackColor={{ false: '#2A2A2A', true: '#00FF8844' }}
              thumbColor={form.isOpen ? '#00FF88' : '#666666'}
            />
          </View>

          {error ? <Text style={modalStyles.errorText}>{error}</Text> : null}

          <TouchableOpacity style={modalStyles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#0A0A0A" /> : <Text style={modalStyles.saveBtnText}>{isEdit ? 'Save Changes' : 'Create Store'}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  title: { fontSize: 18, fontWeight: '600', color: '#FFFFFF', letterSpacing: -0.3 },
  closeBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center' },
  closeText: { color: '#666666', fontSize: 14, fontWeight: '500' },
  scroll: { padding: SPACING.lg, paddingBottom: 60 },
  field: { marginBottom: SPACING.md },
  label: { fontSize: 10, fontWeight: '600', color: '#666666', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  input: { backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, height: 48, paddingHorizontal: SPACING.md, color: '#FFFFFF', fontSize: 14 },
  textArea: { height: 80, textAlignVertical: 'top', paddingTop: SPACING.sm },
  row: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  halfField: { flex: 1 },
  categoryScroll: { marginBottom: SPACING.md },
  categoryRow: { flexDirection: 'row', gap: SPACING.sm },
  categoryChip: { paddingHorizontal: SPACING.md, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A' },
  categoryChipActive: { borderColor: '#3B82F6', backgroundColor: '#3B82F622' },
  categoryText: { color: '#666666', fontSize: 12, fontWeight: '500' },
  categoryTextActive: { color: '#3B82F6' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 8, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#2A2A2A' },
  toggleSub: { fontSize: 10, color: '#444444', marginTop: 2 },
  errorText: { color: '#FF4444', fontSize: 12, marginBottom: SPACING.md, backgroundColor: '#FF444422', padding: SPACING.sm, borderRadius: 6, textAlign: 'center' },
  saveBtn: { backgroundColor: '#3B82F6', borderRadius: 8, height: 50, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: '#0A0A0A', fontSize: 14, fontWeight: '600' },
});

// Main Screen
export default function AdminStores() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Store | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'stores'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setStores(snap.docs.map(d => ({ id: d.id, ...d.data() } as Store)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleDelete = (store: Store) => {
    Alert.alert(
      'Delete Store',
      `Delete "${store.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'stores', store.id));
            } catch (e: any) {
              Alert.alert('Error', 'Could not delete: ' + e.message);
            }
          },
        },
      ]
    );
  };

  const handleToggleOpen = async (store: Store) => {
    await updateDoc(doc(db, 'stores', store.id), { isOpen: !store.isOpen });
  };

  const getStoreNumber = (index: number) => {
    return (index + 1).toString().padStart(2, '0');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Stores</Text>
          <Text style={styles.subtitle}>{stores.length} total</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => { setEditTarget(null); setModalVisible(true); }}>
          <Text style={styles.addBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color="#3B82F6" size="large" /></View>
      ) : (
        <FlatList
          data={stores}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyNumber}>00</Text>
              <Text style={styles.emptyText}>no stores yet</Text>
              <Text style={styles.emptySub}>tap + New to add your first store</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.storeCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.storeNumber}>{getStoreNumber(index)}</Text>
                <TouchableOpacity
                  style={[styles.statusBtn, { backgroundColor: item.isOpen ? '#00FF8822' : '#FF444422' }]}
                  onPress={() => handleToggleOpen(item)}
                >
                  <View style={[styles.statusDot, { backgroundColor: item.isOpen ? '#00FF88' : '#FF4444' }]} />
                  <Text style={[styles.statusText, { color: item.isOpen ? '#00FF88' : '#FF4444' }]}>
                    {item.isOpen ? 'open' : 'closed'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.storeName}>{item.name}</Text>
              <Text style={styles.storeCategory}>{item.category}</Text>
              <Text style={styles.storeDesc} numberOfLines={2}>{item.description}</Text>

              <View style={styles.metaRow}>
                <Text style={styles.metaText}>{formatJMD(item.deliveryFee)} fee</Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText}>{item.estimatedTime}</Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText}>★ {item.rating}</Text>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.menuBtn}
                  onPress={() => router.push(`/(admin)/store/${item.id}` as any)}
                >
                  <Text style={styles.menuBtnText}>menu items</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editBtn} onPress={() => { setEditTarget(item); setModalVisible(true); }}>
                  <Text style={styles.editBtnText}>edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Text style={styles.deleteBtnText}>delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <StoreFormModal visible={modalVisible} onClose={() => setModalVisible(false)} initialData={editTarget} />
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
  addBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#0A0A0A',
    fontSize: 13,
    fontWeight: '600',
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
  emptySub: {
    fontSize: 12,
    color: '#444444',
  },
  storeCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  storeNumber: {
    fontSize: 11,
    fontWeight: '500',
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
  statusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  storeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  storeCategory: {
    fontSize: 11,
    color: '#3B82F6',
    fontWeight: '500',
  },
  storeDesc: {
    fontSize: 12,
    color: '#888888',
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 11,
    color: '#555555',
  },
  metaDot: {
    fontSize: 11,
    color: '#333333',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  menuBtn: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  menuBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#888888',
  },
  editBtn: {
    flex: 1,
    backgroundColor: '#3B82F622',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3B82F644',
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3B82F6',
  },
  deleteBtn: {
    width: 60,
    backgroundColor: '#FF444422',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FF4444',
  },
});