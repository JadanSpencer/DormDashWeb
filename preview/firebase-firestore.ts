// Preview-mode fake of firebase/firestore: a tiny in-memory database seeded
// from preview/fixtures.ts. Supports what DormDash uses: doc, collection,
// query, where (==, in), orderBy, limit, getDoc(s), onSnapshot, addDoc,
// setDoc, updateDoc, deleteDoc, serverTimestamp. Writes notify listeners, so
// the UI reacts like it would against real Firestore.
import { seed } from './fixtures';

const store = new Map<string, any>(Object.entries(seed()));
const listeners = new Set<() => void>();
let autoId = 0;

type Ref = { kind: 'doc' | 'col'; path: string; id: string };
type Q = { kind: 'query'; path: string; filters: [string, string, any][]; order: [string, string][]; max?: number };

const join = (segs: string[]) => segs.join('/');

export const getFirestore = (_app?: any) => ({});
export const initializeFirestore = (_app?: any, _settings?: any) => ({});
export const persistentLocalCache = (_s?: any) => ({});
export const persistentMultipleTabManager = () => ({});
export async function terminate(_db?: any) {}
export async function clearIndexedDbPersistence(_db?: any) {}
export type Firestore = Record<string, never>;
export const serverTimestamp = () => Date.now();

export function doc(base: any, ...segs: string[]): Ref {
  const path = base?.kind === 'col' ? join([base.path, ...segs]) : join(segs);
  return { kind: 'doc', path, id: path.split('/').pop()! };
}
export function collection(base: any, ...segs: string[]): Ref {
  const path = base?.kind ? join([base.path, ...segs]) : join(segs);
  return { kind: 'col', path, id: path.split('/').pop()! };
}
export const where = (f: string, op: string, v: any) => ({ t: 'where', f, op, v });
export const orderBy = (f: string, dir = 'asc') => ({ t: 'order', f, dir });
export const limit = (n: number) => ({ t: 'limit', n });
export function query(col: Ref, ...cs: any[]): Q {
  return {
    kind: 'query', path: col.path,
    filters: cs.filter(c => c.t === 'where').map(c => [c.f, c.op, c.v]),
    order: cs.filter(c => c.t === 'order').map(c => [c.f, c.dir]),
    max: cs.find(c => c.t === 'limit')?.n,
  };
}

function docSnap(path: string) {
  const data = store.get(path);
  const id = path.split('/').pop()!;
  return { id, ref: { kind: 'doc', path, id }, exists: () => data !== undefined, data: () => (data ? { ...data } : undefined) };
}

function run(q: Q | Ref) {
  const path = q.path;
  const depth = path.split('/').length + 1;
  let rows = [...store.keys()]
    .filter(k => k.startsWith(path + '/') && k.split('/').length === depth)
    .map(docSnap);
  if (q.kind === 'query') {
    for (const [f, op, v] of q.filters) {
      rows = rows.filter(r => {
        const x = r.data()![f];
        if (op === '==') return x === v;
        if (op === 'in') return (v as any[]).includes(x);
        if (op === '!=') return x !== v;
        if (op === '>=') return x >= v;
        if (op === '>') return x > v;
        return true;
      });
    }
    for (const [f, dir] of [...q.order].reverse()) {
      rows.sort((a, b) => {
        const x = a.data()![f], y = b.data()![f];
        return (x > y ? 1 : x < y ? -1 : 0) * (dir === 'desc' ? -1 : 1);
      });
    }
    if (q.max) rows = rows.slice(0, q.max);
  }
  return { docs: rows, size: rows.length, empty: rows.length === 0, forEach: (fn: any) => rows.forEach(fn) };
}

// Aggregations (admin dashboard): count(), sum(field), average(field).
export const count = () => ({ agg: 'count' });
export const sum = (f: string) => ({ agg: 'sum', f });
export const average = (f: string) => ({ agg: 'avg', f });
export async function getAggregateFromServer(q: Q | Ref, spec: Record<string, any>) {
  const rows = run(q).docs.map(d => d.data()!);
  const out: Record<string, number | null> = {};
  for (const [key, a] of Object.entries(spec)) {
    const nums = a.f ? rows.map(r => r[a.f]).filter((x): x is number => typeof x === 'number') : [];
    out[key] = a.agg === 'count' ? rows.length
      : a.agg === 'sum' ? nums.reduce((s, x) => s + x, 0)
      : nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : null;
  }
  return { data: () => out };
}

export async function getDoc(ref: Ref) { return docSnap(ref.path); }
// The fake has no network, so its cache and server answers are the same.
export async function getDocFromCache(ref: Ref) { return docSnap(ref.path); }
export async function getDocs(q: Q | Ref) { return run(q); }

let frozen = false; // see disableNetwork / enableNetwork below
export function onSnapshot(target: any, a: any, b?: any) {
  // Also accepts (target, options, cb), like the real SDK.
  const cb: (s: any) => void = typeof a === 'function' ? a : b;
  const meta = { metadata: { fromCache: false, hasPendingWrites: false } };
  const fire = () => cb({ ...(target.kind === 'doc' ? docSnap(target.path) : run(target)), ...meta });
  listeners.add(fire);
  // ?slow=3000 delays the first answer, to see loading states in design QA.
  const slow = typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('slow')) || 0 : 0;
  setTimeout(() => { if (!frozen) fire(); }, slow); // a dead connection delivers nothing
  return () => { listeners.delete(fire); };
}

// Simulated dead connection (design QA / tests of services/liveSync): while
// frozen, listeners get no updates, like a phone whose Firestore connection
// died silently. disableNetwork + enableNetwork (a reconnect) unfreezes.
function changed() { setTimeout(() => { if (!frozen) listeners.forEach(l => l()); }, 0); }
export async function disableNetwork(_db?: any) { /* reconnect starts */ }
export async function enableNetwork(_db?: any) {
  frozen = false;
  setTimeout(() => listeners.forEach(l => l()), 0);
}
if (typeof window !== 'undefined') {
  (window as any).__ddPreview = {
    freezeListeners: () => { frozen = true; },
    isFrozen: () => frozen,
    set: (path: string, data: any) => { store.set(path, { ...data }); changed(); },
    update: (path: string, patch: any) => { store.set(path, { ...(store.get(path) ?? {}), ...patch }); changed(); },
  };
}

export async function setDoc(ref: Ref, data: any) { store.set(ref.path, { ...data }); changed(); }
export async function updateDoc(ref: Ref, data: any) {
  store.set(ref.path, { ...(store.get(ref.path) ?? {}), ...data }); changed();
}
export async function deleteDoc(ref: Ref) { store.delete(ref.path); changed(); }
export async function addDoc(col: Ref, data: any) {
  const id = `new${++autoId}`;
  store.set(`${col.path}/${id}`, { ...data }); changed();
  return { id, path: `${col.path}/${id}` };
}

// Minimal transaction for preview mode (dasher accept uses runTransaction).
export async function runTransaction(_db: any, fn: (tx: any) => Promise<any>) {
  const tx = {
    get: async (ref: Ref) => docSnap(ref.path),
    update: (ref: Ref, data: any) => { store.set(ref.path, { ...(store.get(ref.path) ?? {}), ...data }); changed(); },
    set: (ref: Ref, data: any) => { store.set(ref.path, { ...data }); changed(); },
  };
  return fn(tx);
}
