// components/InstallPrompt.web.tsx
// The PWA's one-time setup card, shown to signed-in users only (so it never
// covers the sign-in button), a few seconds after they land. Same card, three
// stages:
//
//   1. "Install DormDash?"  Yes, show me / Not now
//      • Yes + the browser can install directly (Chrome, Edge, Samsung
//        Internet on Android and desktop): opens the real install dialog.
//      • Yes + no direct install (iPhone, iPad, Safari on Mac, Firefox…):
//        the card switches to the steps for THIS device, with
//        "Other devices" to show every option.
//   2. "Turn on order alerts" (browser tab or installed app, any device where
//      web push works). Browsers only allow the permission prompt from a
//      tap, which is why this is a button. Calls enableWebPush().
//      iPhone/iPad only allow alerts once DormDash is on the Home Screen, so
//      there the install steps say so.
//
// Each stage is hidden for 14 days after "Not now".
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, ScrollView } from 'react-native';
import { T } from '../constants/theme';
import { enableWebPush, webPushPermission } from '../services/notifications';

const INSTALL_KEY = 'dd_install_dismissed_at';
const ALERTS_KEY = 'dd_alerts_dismissed_at';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const SHOW_AFTER_MS = 6000; // let the user land first

type Mode = 'hidden' | 'ask' | 'steps' | 'alerts';

let deferredPrompt: any = null;
const promptListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    promptListeners.forEach(fn => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    promptListeners.forEach(fn => fn());
  });
}

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

function isIOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

// Install steps for every platform. `detect` picks the one for this device.
type Guide = { key: string; label: string; steps: string };
const GUIDES: Guide[] = [
  { key: 'ios-safari', label: 'iPhone / iPad (Safari)',
    steps: 'Tap the Share button (square with an arrow), then "Add to Home Screen", then Add. Open DormDash from your Home Screen to get order alerts.' },
  { key: 'ios-other', label: 'iPhone / iPad (Chrome, Edge)',
    steps: 'Tap the Share button in the address bar, then "Add to Home Screen". If you don\'t see it, open this page in Safari instead.' },
  { key: 'android-chrome', label: 'Android (Chrome)',
    steps: 'Tap the ⋮ menu at the top right, then "Install app" or "Add to Home screen".' },
  { key: 'android-samsung', label: 'Samsung Internet',
    steps: 'Tap the ≡ menu at the bottom, then "Add page to", then "Home screen".' },
  { key: 'android-firefox', label: 'Android (Firefox)',
    steps: 'Tap the ⋮ menu, then "Install".' },
  { key: 'mac-safari', label: 'Mac (Safari)',
    steps: 'In the menu bar, choose File, then "Add to Dock".' },
  { key: 'desktop-chrome', label: 'Mac / Windows (Chrome)',
    steps: 'Click the install icon at the right end of the address bar, or ⋮ menu → "Cast, save and share" → "Install page as app".' },
  { key: 'desktop-edge', label: 'Mac / Windows (Edge)',
    steps: 'Click the … menu, then Apps, then "Install this site as an app".' },
  { key: 'desktop-firefox', label: 'Mac / Windows (Firefox)',
    steps: 'Firefox on computers can\'t install web apps. Keep this tab pinned, or open DormDash in Chrome, Edge or Safari to install it.' },
];

function detectGuide(): Guide {
  const ua = navigator.userAgent;
  const pick = (k: string) => GUIDES.find(g => g.key === k)!;
  if (isIOS()) return /CriOS|EdgiOS|FxiOS/.test(ua) ? pick('ios-other') : pick('ios-safari');
  if (/Android/.test(ua)) {
    if (/SamsungBrowser/.test(ua)) return pick('android-samsung');
    if (/Firefox/.test(ua)) return pick('android-firefox');
    return pick('android-chrome');
  }
  if (/Edg\//.test(ua)) return pick('desktop-edge');
  if (/Firefox\//.test(ua)) return pick('desktop-firefox');
  if (/Chrome|Chromium/.test(ua)) return pick('desktop-chrome');
  if (/Safari\//.test(ua)) return pick('mac-safari');
  return pick('desktop-chrome');
}

function snoozed(key: string) {
  try {
    return Date.now() - Number(localStorage.getItem(key) || 0) < SNOOZE_MS;
  } catch {
    return false;
  }
}

function snooze(key: string) {
  try { localStorage.setItem(key, String(Date.now())); } catch {}
}

export function InstallPrompt({ uid }: { uid?: string | null }) {
  const [mode, setMode] = useState<Mode>('hidden');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [alertsResult, setAlertsResult] = useState<'on' | 'blocked' | null>(null);

  const nextAfterInstall = async () => {
    // Offer alerts right away if this browser can do them (not in an iPhone
    // Safari tab: there they only work from the Home Screen app).
    if (!snoozed(ALERTS_KEY) && (await webPushPermission()) === 'default') setMode('alerts');
    else setMode('hidden');
  };

  useEffect(() => {
    if (!uid || typeof window === 'undefined') return;
    let cancelled = false;

    const decide = async () => {
      if (!isStandalone() && !snoozed(INSTALL_KEY)) {
        return !cancelled && setMode(m => (m === 'steps' ? m : 'ask'));
      }
      if (!snoozed(ALERTS_KEY) && (await webPushPermission()) === 'default') {
        return !cancelled && setMode('alerts');
      }
      if (!cancelled) setMode('hidden');
    };

    const timer = setTimeout(decide, SHOW_AFTER_MS);
    const onPromptChange = () => { if (isStandalone()) decide(); };
    promptListeners.add(onPromptChange);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      promptListeners.delete(onPromptChange);
    };
  }, [uid]);

  const dismiss = () => {
    snooze(mode === 'alerts' ? ALERTS_KEY : INSTALL_KEY);
    setMode('hidden');
  };

  const yesInstall = async () => {
    if (deferredPrompt) {
      // This browser can install directly: open its own install dialog.
      const evt = deferredPrompt;
      deferredPrompt = null;
      evt.prompt();
      const choice = await evt.userChoice.catch(() => null);
      snooze(INSTALL_KEY);
      if (choice?.outcome === 'accepted') { setMode('hidden'); return; }
      nextAfterInstall();
      return;
    }
    setShowAll(false);
    setMode('steps');
  };

  const doneSteps = () => {
    snooze(INSTALL_KEY);
    nextAfterInstall();
  };

  const turnOnAlerts = async () => {
    if (!uid) return;
    setBusy(true);
    const ok = await enableWebPush(uid);
    setBusy(false);
    setAlertsResult(ok ? 'on' : 'blocked');
    snooze(ALERTS_KEY);
    setTimeout(() => setMode('hidden'), 2600);
  };

  if (!uid || mode === 'hidden') return null;

  const guide = typeof window !== 'undefined' ? detectGuide() : GUIDES[0];

  let title = 'Install DormDash?';
  let text = 'It opens full screen like a normal app, right from your home screen, and order alerts work best. No app store needed.';
  if (mode === 'steps') {
    title = `Install on ${guide.label}`;
    text = guide.steps;
  }
  if (mode === 'alerts') {
    title = 'Turn on order alerts';
    text = 'Get a notification when a dasher accepts your order, picks it up and arrives.';
    if (alertsResult === 'on') text = 'Order alerts are on.';
    if (alertsResult === 'blocked') text = 'Alerts are blocked. You can allow them later in your browser\'s site settings.';
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card} accessibilityRole="alert">
        <Image source={require('../assets/icon.png')} style={styles.icon} />
        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.text}>{text}</Text>

          {mode === 'steps' && showAll && (
            <ScrollView style={styles.allList} nestedScrollEnabled>
              {GUIDES.filter(g => g.key !== guide.key).map(g => (
                <View key={g.key} style={styles.allItem}>
                  <Text style={styles.allLabel}>{g.label}</Text>
                  <Text style={styles.text}>{g.steps}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {!alertsResult && (
            <View style={styles.row}>
              {mode === 'ask' && (
                <Pressable onPress={yesInstall} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
                  <Text style={styles.primaryText}>Yes, show me</Text>
                </Pressable>
              )}
              {mode === 'steps' && (
                <Pressable onPress={doneSteps} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
                  <Text style={styles.primaryText}>Done</Text>
                </Pressable>
              )}
              {mode === 'alerts' && (
                <Pressable
                  onPress={turnOnAlerts}
                  disabled={busy}
                  style={({ pressed }) => [styles.primary, (pressed || busy) && { opacity: 0.85 }]}
                >
                  <Text style={styles.primaryText}>{busy ? 'Turning on…' : 'Turn on alerts'}</Text>
                </Pressable>
              )}
              {mode === 'steps' ? (
                <Pressable onPress={() => setShowAll(v => !v)} style={styles.secondary}>
                  <Text style={styles.secondaryText}>{showAll ? 'Hide other devices' : 'Other devices'}</Text>
                </Pressable>
              ) : (
                <Pressable onPress={dismiss} style={styles.secondary}>
                  <Text style={styles.secondaryText}>Not now</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 0, right: 0, bottom: 96,
    alignItems: 'center', paddingHorizontal: T.space.md, zIndex: 50,
  },
  card: {
    flexDirection: 'row', width: '100%', maxWidth: 440,
    backgroundColor: T.color.card, borderRadius: T.radius.md,
    padding: T.space.md, borderWidth: 1, borderColor: T.color.line,
    ...T.shadow.card,
  },
  icon: { width: 44, height: 44, borderRadius: 12, marginRight: T.space.sm },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800', color: T.color.ink },
  text: { fontSize: 13, lineHeight: 18, color: T.color.inkSoft, marginTop: 4 },
  row: { flexDirection: 'row', marginTop: T.space.sm, gap: 8 },
  primary: {
    backgroundColor: T.color.cerulean, borderRadius: T.radius.pill,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  secondary: { paddingHorizontal: 12, paddingVertical: 8 },
  secondaryText: { color: T.color.inkSoft, fontWeight: '700', fontSize: 14 },
  allList: { maxHeight: 220, marginTop: T.space.sm },
  allItem: { marginTop: T.space.xs },
  allLabel: { fontSize: 13, fontWeight: '800', color: T.color.ink, marginTop: 4 },
});
