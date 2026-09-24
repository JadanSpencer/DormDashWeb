// Preview-mode fake of firebase/auth.
// Pick who you are with ?as=student | dasher | admin | none on any URL
// (remembered for the tab). Default: student.
import { PREVIEW_USERS } from './fixtures';

type Listener = (u: any) => void;
const listeners = new Set<Listener>();

function pickRole(): string {
  if (typeof window === 'undefined') return 'student';
  const q = new URLSearchParams(window.location.search).get('as');
  if (q) sessionStorage.setItem('dd_preview_as', q);
  return sessionStorage.getItem('dd_preview_as') || 'student';
}

const role = pickRole();
const current = role === 'none' ? null : PREVIEW_USERS[role] ?? PREVIEW_USERS.student;
const auth: any = { currentUser: current ? { uid: current.uid, email: current.email } : null };

function emit() { listeners.forEach(l => l(auth.currentUser)); }

export const getAuth = (_app?: any) => auth;
export const initializeAuth = (_app?: any, _opts?: any) => auth;
export const getReactNativePersistence = (_s: any) => null;
export type Auth = any;

export function onAuthStateChanged(_a: any, cb: Listener) {
  listeners.add(cb);
  setTimeout(() => cb(auth.currentUser), 0);
  return () => { listeners.delete(cb); };
}
export async function signInWithEmailAndPassword(_a: any, email: string) {
  const u = Object.values(PREVIEW_USERS).find((x: any) => x.email === email) ?? PREVIEW_USERS.student;
  auth.currentUser = { uid: u.uid, email: u.email }; emit();
  return { user: auth.currentUser };
}
export async function createUserWithEmailAndPassword(_a: any, email: string) {
  auth.currentUser = { uid: 'new-user', email }; emit();
  return { user: auth.currentUser };
}
export async function signOut(_a: any) { auth.currentUser = null; emit(); }
export async function sendPasswordResetEmail() {}
export async function updateProfile() {}
export async function updatePassword() {}
export async function reauthenticateWithCredential() { return {}; }
export const EmailAuthProvider = { credential: (e: string, p: string) => ({ e, p }) };
