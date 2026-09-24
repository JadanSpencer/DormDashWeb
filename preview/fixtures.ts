// Sample data for preview mode. Fictional people and shops on a Jamaican
// campus, used only for design QA screenshots. Never shipped.
const now = Date.now();
const min = 60_000;
const day = 24 * 60 * min;
const CAMPUS = { latitude: 18.0061, longitude: -76.7466 };

export const PREVIEW_USERS: Record<string, any> = {
  student: { uid: 'stu1', email: 'tanesha.b@uwimona.edu.jm', name: 'Tanesha Brown', role: 'student', phone: '876 555 0142', university: 'UWI Mona', createdAt: now - 40 * day, isActive: true },
  dasher: { uid: 'das1', email: 'kemar.r@uwimona.edu.jm', name: 'Kemar Reid', role: 'dasher', phone: '876 555 0199', university: 'UWI Mona', createdAt: now - 60 * day, isActive: true },
  admin: { uid: 'adm1', email: 'ops@dormdash.app', name: 'Jadan Spencer', role: 'admin', phone: '876 555 0100', university: 'UWI Mona', createdAt: now - 90 * day, isActive: true },
};

const stores = [
  { id: 's1', name: 'Ring Road Grill', description: 'Jerk chicken, festival and fries off the grill.', category: 'Jamaican', deliveryFee: 250, estimatedTime: '20-30 min', rating: 4.7, isOpen: true },
  { id: 's2', name: 'Chancellor Tuck Shop', description: 'Snacks, drinks and late-night essentials.', category: 'Snacks', deliveryFee: 150, estimatedTime: '10-15 min', rating: 4.4, isOpen: true },
  { id: 's3', name: 'Irie Bowls', description: 'Rice bowls, ital stew and fresh juices.', category: 'Healthy', deliveryFee: 300, estimatedTime: '25-35 min', rating: 4.8, isOpen: true },
  { id: 's4', name: 'Mona Patty Hut', description: 'Beef, chicken and veggie patties, coco bread.', category: 'Bakery', deliveryFee: 200, estimatedTime: '15-20 min', rating: 4.5, isOpen: false },
];

const menu: Record<string, any[]> = {
  s1: [
    { id: 'm1', name: 'Jerk chicken quarter', description: 'With festival and pickled veg.', price: 1450, category: 'Mains', isAvailable: true },
    { id: 'm2', name: 'Jerk pork plate', description: 'Rice and peas, steamed cabbage.', price: 1650, category: 'Mains', isAvailable: true, allergens: ['Pepper'] },
    { id: 'm3', name: 'Festival (3)', description: 'Sweet fried dumplings.', price: 400, category: 'Sides', isAvailable: true, allergens: ['Gluten'] },
    { id: 'm4', name: 'Sorrel', description: 'Chilled, with ginger.', price: 350, category: 'Drinks', isAvailable: false },
  ],
  s2: [
    { id: 'm5', name: 'Bulla and cheese', description: 'A campus classic.', price: 280, category: 'Snacks', isAvailable: true, allergens: ['Gluten', 'Dairy'] },
    { id: 'm6', name: 'Box juice', description: 'Assorted flavours.', price: 180, category: 'Drinks', isAvailable: true },
  ],
  s3: [
    { id: 'm7', name: 'Ital stew bowl', description: 'Pumpkin, okra, callaloo, coconut.', price: 1350, category: 'Bowls', isAvailable: true },
    { id: 'm8', name: 'Carrot and beet juice', description: 'Fresh pressed.', price: 450, category: 'Drinks', isAvailable: true },
  ],
  s4: [
    { id: 'm9', name: 'Beef patty', description: 'Spicy, flaky crust.', price: 320, category: 'Patties', isAvailable: true, allergens: ['Gluten'] },
  ],
};

const item = (sid: string, mid: string, qty: number) => ({
  menuItem: { ...menu[sid].find(m => m.id === mid), storeId: sid }, quantity: qty,
});
const total = (sid: string, items: any[]) =>
  items.reduce((s, c) => s + c.menuItem.price * c.quantity, 0) + stores.find(s => s.id === sid)!.deliveryFee;

function order(id: string, sid: string, items: any[], status: string, createdAgo: number, extra: any = {}) {
  const s = stores.find(x => x.id === sid)!;
  return {
    studentId: 'stu1', studentName: 'Tanesha Brown', storeId: sid, storeName: s.name,
    items, status, deliveryFee: s.deliveryFee, totalAmount: total(sid, items),
    deliveryAddress: { ...CAMPUS, latitude: CAMPUS.latitude + 0.002, label: 'Chancellor Hall, Block C, Room 204', hasGpsFix: true },
    createdAt: now - createdAgo, ...extra,
  };
}

export function seed(): Record<string, any> {
  const db: Record<string, any> = {};
  Object.values(PREVIEW_USERS).forEach(u => { db[`users/${u.uid}`] = u; });
  db['users/stu2'] = { uid: 'stu2', email: 'daniel.w@uwimona.edu.jm', name: 'Daniel Williams', role: 'student', phone: '876 555 0177', university: 'UWI Mona', createdAt: now - 3 * day, isActive: true };
  db['users/das2'] = { uid: 'das2', email: 'shanice.c@utech.edu.jm', name: 'Shanice Campbell', role: 'dasher', phone: '876 555 0133', university: 'UTech', createdAt: now - 12 * day, isActive: false };
  db['dashers/das1'] = { uid: 'das1', isOnline: true, lastSeenAt: now, currentLocation: CAMPUS, rating: 4.9, totalDeliveries: 37, vehicleType: 'bicycle' };
  stores.forEach(s => {
    db[`stores/${s.id}`] = { ...s, location: { ...CAMPUS, address: 'Ring Road, UWI Mona' }, createdAt: now - 30 * day };
    menu[s.id].forEach(m => { db[`stores/${s.id}/menuItems/${m.id}`] = { ...m, storeId: s.id }; });
  });
  db['orders/o1'] = order('o1', 's1', [item('s1', 'm1', 1), item('s1', 'm3', 1)], 'on_the_way', 18 * min,
    { dasherId: 'das1', dasherName: 'Kemar Reid', acceptedAt: now - 14 * min, studentNote: 'Call when you reach the gate.' });
  db['orders/o2'] = order('o2', 's3', [item('s3', 'm7', 2)], 'delivered', 2 * day, { dasherId: 'das1', dasherName: 'Kemar Reid', deliveredAt: now - 2 * day + 30 * min });
  db['orders/o3'] = order('o3', 's2', [item('s2', 'm5', 2), item('s2', 'm6', 2)], 'cancelled', 5 * day);
  db['orders/o4'] = { ...order('o4', 's2', [item('s2', 'm6', 3)], 'pending', 4 * min), studentId: 'stu2', studentName: 'Daniel Williams', verifiedAt: now - 4 * min };
  db['orders/o5'] = { ...order('o5', 's3', [item('s3', 'm8', 1)], 'pending', 9 * min), studentId: 'stu2', studentName: 'Daniel Williams', verifiedAt: now - 9 * min, deliveryAddress: { latitude: 0, longitude: 0, label: 'Science Library, 2nd floor', hasGpsFix: false } };
  db['orders/o6'] = order('o6', 's1', [item('s1', 'm2', 1)], 'delivered', 9 * day, { dasherId: 'das1', dasherName: 'Kemar Reid', deliveredAt: now - 9 * day + 25 * min });
  // A second in-progress order (students can have up to 3) and enough
  // history to show the "Show more" paging on the Orders tab.
  db['orders/o7'] = order('o7', 's2', [item('s2', 'm5', 1)], 'pending', 2 * min, { verifiedAt: now - 2 * min });
  for (let i = 1; i <= 12; i++) {
    db[`orders/h${i}`] = order(`h${i}`, 's3', [item('s3', 'm7', 1)], 'delivered', (10 + i) * day,
      { dasherId: 'das1', dasherName: 'Kemar Reid', deliveredAt: now - (10 + i) * day + 20 * min });
  }
  return db;
}
