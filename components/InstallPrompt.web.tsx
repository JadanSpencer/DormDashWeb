// components/InstallPrompt.web.tsx
// The PWA's setup card, shown to signed-in users only (so it never covers the
// sign-in button), a few seconds after they land. Same card, four stages:
//
//   1. "Install DormDash?"  Yes, show me / Not now
//      • Yes + the browser can install directly (Chrome, Edge, Samsung
//        Internet on Android and desktop): opens the real install dialog.
//      • Yes + no direct install (iPhone, iPad, Safari on Mac, Firefox…):
//        the card switches to the steps for THIS device, with
//        "Other devices" to show every option.
//   2. "Turn on order alerts" while the browser hasn't been asked yet.
//      Browsers only allow the permission prompt from a tap, which is why
//      this is a button. Calls enableWebPush().
//   3. "Alerts are blocked" when the person said no to alerts before: steps
//      to switch them back on for this device. Dashers see this every visit
//      (no alerts = missed orders); students once a day.
//
// WHEN IT SHOWS: every visit, for as long as DormDash isn't installed (or
// alerts aren't on). "Not now" only hides it for SNOOZE_MS, so ignoring it
// once doesn't hide it for good. It never shows inside the installed app's
// install stage, and stops for good once we know it's installed:
//   • opened from the home screen (display-mode: standalone), or
//   • the browser says it's installed (appinstalled event, or
//     getInstalledRelatedApps on Android Chrome), or
//   • the person tapped "I already installed it" (iPhone Safari can't tell
//     us, because the Home Screen app and Safari keep separate storage).
// If the browser later offers to install again (beforeinstallprompt), that
// means it was uninstalled, so the card comes back.
//
// iPHONE / iPAD: a full-screen warning instead (IOSInstallGate below). On
// iOS, notifications only work in the Home Screen app, and there is no
// install button a website can offer, so people have to follow the steps.
// It covers the screen whenever DormDash is open in a browser tab (signed in
// or not: the Home Screen app has its own sign-in, so installing first saves
// signing in twice). "Continue without alerts" appears after a few seconds
// and only lasts for this visit.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, ScrollView } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { T, FONT } from '../constants/theme';
import { PAY_WINDOW_MIN } from '../constants';
import { TideBand, pressPlate } from './Tide';
import { Icon } from './TabIcon';
import { enableWebPush, webPushPermission } from '../services/notifications';

const INSTALL_KEY = 'dd_install_dismissed_at';
const ALERTS_KEY = 'dd_alerts_dismissed_at';
const INSTALLED_KEY = 'dd_installed';
const SNOOZE_MS = 4 * 60 * 60 * 1000;            // "Not now" = not for 4 hours
const STUDENT_BLOCKED_SNOOZE_MS = 24 * 60 * 60 * 1000;
const SHOW_AFTER_MS = 6000; // let the user land first

type Mode = 'hidden' | 'ask' | 'steps' | 'alerts' | 'blocked';

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}
function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

let deferredPrompt: any = null;
const promptListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // The browser only offers this when DormDash is NOT installed.
    store(INSTALLED_KEY, null);
    promptListeners.forEach(fn => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    store(INSTALLED_KEY, '1');
    promptListeners.forEach(fn => fn());
  });
}

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches ||
    (navigator as any).standalone === true
  );
}

function isIOS() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

async function isInstalled(): Promise<boolean> {
  if (isStandalone()) {
    store(INSTALLED_KEY, '1');
    return true;
  }
  if (deferredPrompt) return false; // the browser is offering to install it
  try {
    const nav: any = navigator;
    if (typeof nav.getInstalledRelatedApps === 'function') {
      const apps = await nav.getInstalledRelatedApps();
      if (Array.isArray(apps) && apps.length > 0) return true;
    }
  } catch {}
  return read(INSTALLED_KEY) === '1';
}

// Install steps for every platform. `detect` picks the one for this device.
type Guide = { key: string; label: string; steps: string; unblock: string };
const GUIDES: Guide[] = [
  { key: 'ios-safari', label: 'iPhone / iPad (Safari)',
    steps: 'Tap the three dots (⋯) at the bottom of Safari, then Share, then "Add to Home Screen", then Add. Open Runner from your Home Screen to get order alerts.',
    unblock: 'Open the Settings app, tap Notifications, find Runner and turn on Allow Notifications.' },
  { key: 'ios-other', label: 'iPhone / iPad (Chrome, Edge)',
    steps: 'Tap the Share button in the address bar, then "Add to Home Screen". If you don\'t see it, open this page in Safari instead.',
    unblock: 'Open the Settings app, tap Notifications, find Runner and turn on Allow Notifications.' },
  { key: 'android-chrome', label: 'Android (Chrome)',
    steps: 'Tap the ⋮ menu at the top right, then "Install app" or "Add to Home screen".',
    unblock: 'Tap the icon to the left of the address bar, then Permissions (or Site settings), then Notifications, then Allow. In the installed app: press and hold the Runner icon, tap App info, then Notifications, and turn them on.' },
  { key: 'android-samsung', label: 'Samsung Internet',
    steps: 'Tap the ≡ menu at the bottom, then "Add page to", then "Home screen".',
    unblock: 'Tap the ≡ menu, then Settings, then Sites and downloads, then Notifications, and allow Runner.' },
  { key: 'android-firefox', label: 'Android (Firefox)',
    steps: 'Tap the ⋮ menu, then "Install".',
    unblock: 'Tap the lock icon in the address bar, then turn Notifications on.' },
  { key: 'mac-safari', label: 'Mac (Safari)',
    steps: 'In the menu bar, choose File, then "Add to Dock".',
    unblock: 'In the menu bar choose Safari, then Settings, then Websites, then Notifications, and set Runner to Allow.' },
  { key: 'desktop-chrome', label: 'Mac / Windows (Chrome)',
    steps: 'Click the install icon at the right end of the address bar, or ⋮ menu → "Cast, save and share" → "Install page as app".',
    unblock: 'Click the icon to the left of the address bar, then Site settings, and set Notifications to Allow. Then reload this page.' },
  { key: 'desktop-edge', label: 'Mac / Windows (Edge)',
    steps: 'Click the … menu, then Apps, then "Install this site as an app".',
    unblock: 'Click the lock icon to the left of the address bar, then Permissions for this site, and set Notifications to Allow. Then reload this page.' },
  { key: 'desktop-firefox', label: 'Mac / Windows (Firefox)',
    steps: 'Firefox on computers can\'t install web apps. Keep this tab pinned, or open Runner in Chrome, Edge or Safari to install it.',
    unblock: 'Click the lock icon in the address bar, then clear the "Blocked" setting next to Notifications. Then reload this page.' },
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

function snoozed(key: string, ms = SNOOZE_MS) {
  return Date.now() - Number(read(key) || 0) < ms;
}

function snooze(key: string) {
  store(key, String(Date.now()));
}

// ─── iPhone / iPad: full-screen "add to Home Screen" invitation ──────────
// Steps for Safari on current iOS: ⋯ (three dots, bottom of Safari) →
// Share → Add to Home Screen → Add. Older iOS shows the Share button
// directly; the footnote covers it.
const IOS_SKIP_KEY = 'dd_ios_gate_skipped'; // sessionStorage: this visit only
const IOS_SKIP_DELAY_MS = 6000;             // read first, then the way out

// Links opened inside Instagram, TikTok, Snapchat, Facebook, Gmail's or
// Google's app, etc. can't be added to the Home Screen from there.
function inAppBrowser() {
  return /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Snapchat|Line\/|GSA\/|LinkedInApp|Twitter/i.test(navigator.userAgent);
}
function iosNonSafari() {
  return /CriOS|EdgiOS|FxiOS|OPiOS/.test(navigator.userAgent);
}

function needsIOSGate(role?: string) {
  if (typeof window === 'undefined' || !isIOS() || isStandalone()) return false;
  if (role === 'admin') return false;
  if (read(INSTALLED_KEY) === '1') return false;
  // Coming back from the card payment page, or reading the legal pages.
  if (/^\/(payment-result|legal)/.test(window.location.pathname)) return false;
  try { if (sessionStorage.getItem(IOS_SKIP_KEY)) return false; } catch {}
  return true;
}

function IOSInstallGate({ onClose }: { onClose: () => void }) {
  const [canSkip, setCanSkip] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setCanSkip(true), IOS_SKIP_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const wrongBrowser = inAppBrowser() || iosNonSafari();
  const link = window.location.origin;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  };
  const added = () => { store(INSTALLED_KEY, '1'); onClose(); };
  const skip = () => {
    try { sessionStorage.setItem(IOS_SKIP_KEY, '1'); } catch {}
    onClose();
  };

  // The three taps, each with a drawing of the button to look for.
  const steps: { art: React.ReactNode; text: React.ReactNode }[] = [
    ...(wrongBrowser ? [{
      art: <StepArt kind="safari" />,
      text: <>Open <Text style={gate.strong}>{link.replace(/^https?:\/\//, '')}</Text> in <Text style={gate.strong}>Safari</Text></>,
    }] : []),
    { art: <StepArt kind="dots" />, text: <>Tap the <Text style={gate.key}> ⋯ </Text> three dots at the bottom of Safari</> },
    { art: <StepArt kind="share" />, text: <>Tap <Text style={gate.key}> Share </Text></> },
    { art: <StepArt kind="add" />, text: <>Tap <Text style={gate.key}> Add to Home Screen </Text>, then <Text style={gate.strong}>Add</Text></> },
  ];

  return (
    <View style={gate.screen} accessibilityRole="alert" accessibilityViewIsModal>
      <ScrollView contentContainerStyle={gate.scroll} bounces={false}>
        <TideBand>
          <View style={gate.head}>
            {/* The real app icon, about to land on their Home Screen. */}
            <View style={gate.iconWrap}>
              <Image source={{ uri: '/brand/dormdash-tile.png' }} style={gate.appIcon} accessible={false} />
              <View style={gate.iconBadge}><Text style={gate.iconBadgeText}>+</Text></View>
            </View>
            <Text style={gate.kicker}>3 taps, 10 seconds</Text>
            <Text style={gate.title}>Put Runner on your Home Screen</Text>
            <Text style={gate.lead}>
              It opens like a real app, and it's the only way your iPhone can send you order alerts.
            </Text>
          </View>
        </TideBand>

        <View style={gate.body}>
          {/* What they get for it */}
          <View style={gate.perks}>
            {[
              'An alert the moment a runner takes your order',
              `Never miss "Pay now" (unpaid orders cancel after ${PAY_WINDOW_MIN} minutes)`,
              'One tap from your Home Screen, full screen, still signed in',
            ].map(t => (
              <View key={t} style={gate.perk}>
                <View style={gate.tick}><Icon name="checkmark" size={14} color={T.color.card} /></View>
                <Text style={gate.perkText}>{t}</Text>
              </View>
            ))}
          </View>

          <Text style={gate.takes}>Here's how</Text>
          {steps.map((st, i) => (
            <View key={i} style={gate.step}>
              <View style={gate.num}><Text style={gate.numText}>{i + 1}</Text></View>
              <Text style={gate.stepText}>{st.text}</Text>
              <View style={gate.art}>{st.art}</View>
            </View>
          ))}
          <View style={gate.finish}>
            <Text style={gate.finishText}>
              Then open Runner from your <Text style={gate.strong}>Home Screen</Text>. That's it, you're set.
            </Text>
          </View>
          {wrongBrowser && (
            <Pressable onPress={copy} style={({ pressed }) => [gate.copy, pressPlate(pressed, 3)]} accessibilityRole="button">
              <Text style={gate.copyText}>{copied ? 'Link copied. Paste it in Safari.' : 'Copy the link'}</Text>
            </Pressable>
          )}
          <Text style={gate.older}>
            No three dots? On older iPhones, tap the Share button (a square with an arrow) at the bottom of Safari, then Add to Home Screen.
          </Text>

          <Pressable onPress={added} style={({ pressed }) => [gate.primary, pressPlate(pressed)]} accessibilityRole="button">
            <Text style={gate.primaryText}>Done, it's on my Home Screen</Text>
          </Pressable>
          {canSkip ? (
            <Pressable onPress={skip} style={gate.skip} accessibilityRole="button">
              <Text style={gate.skipText}>Maybe later (no order alerts)</Text>
            </Pressable>
          ) : <View style={gate.skip} />}
        </View>
      </ScrollView>
    </View>
  );
}

// Small drawings of the Safari buttons each step talks about, so students
// can match them to what's on their screen.
function StepArt({ kind }: { kind: 'dots' | 'share' | 'add' | 'safari' }) {
  const ink = T.color.cerulean;
  return (
    <Svg width={30} height={30} viewBox="0 0 36 36">
      {kind === 'dots' && (<>
        <Circle cx={18} cy={18} r={15} fill="none" stroke={ink} strokeWidth={2} />
        <Circle cx={11.5} cy={18} r={2.2} fill={ink} />
        <Circle cx={18} cy={18} r={2.2} fill={ink} />
        <Circle cx={24.5} cy={18} r={2.2} fill={ink} />
      </>)}
      {kind === 'share' && (<>
        <Path d="M13 15 H10 V31 H26 V15 H23" fill="none" stroke={ink} strokeWidth={2.2} strokeLinejoin="round" />
        <Path d="M18 22 V4 M12.5 9.5 L18 4 L23.5 9.5" fill="none" stroke={ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </>)}
      {kind === 'add' && (<>
        <Rect x={5} y={5} width={26} height={26} rx={7} fill="none" stroke={ink} strokeWidth={2.2} />
        <Path d="M18 11 V25 M11 18 H25" stroke={ink} strokeWidth={2.4} strokeLinecap="round" />
      </>)}
      {kind === 'safari' && (<>
        <Circle cx={18} cy={18} r={15} fill="none" stroke={ink} strokeWidth={2} />
        <Path d="M23 13 L20 20 L13 23 L16 16 Z" fill={ink} />
      </>)}
    </Svg>
  );
}

export function InstallPrompt({ uid, role }: { uid?: string | null; role?: string }) {
  const [iosGate, setIosGate] = useState(() => needsIOSGate(role));
  useEffect(() => { setIosGate(needsIOSGate(role)); }, [role]);
  if (iosGate) return <IOSInstallGate onClose={() => setIosGate(false)} />;
  return <InstallCard uid={uid} role={role} />;
}

function InstallCard({ uid, role }: { uid?: string | null; role?: string }) {
  const [mode, setMode] = useState<Mode>('hidden');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [alertsResult, setAlertsResult] = useState<'on' | 'blocked' | null>(null);

  const blockedSnooze = role === 'student' ? STUDENT_BLOCKED_SNOOZE_MS : SNOOZE_MS;

  // Which alerts card (if any) this device needs right now.
  const alertsMode = async (): Promise<Mode> => {
    const perm = await webPushPermission();
    if (perm === 'default' && !snoozed(ALERTS_KEY)) return 'alerts';
    if (perm === 'denied' && !snoozed(ALERTS_KEY, blockedSnooze)) return 'blocked';
    return 'hidden';
  };

  const nextAfterInstall = async () => {
    // Offer alerts right away if this browser can do them (not in an iPhone
    // Safari tab: there they only work from the Home Screen app).
    setAlertsResult(null);
    setMode(await alertsMode());
  };

  useEffect(() => {
    if (!uid || typeof window === 'undefined') return;
    let cancelled = false;

    const decide = async () => {
      // iPhone browser tab: IOSInstallGate already asked this visit.
      const iosTab = isIOS() && !isStandalone();
      if (!iosTab && !(await isInstalled()) && !snoozed(INSTALL_KEY)) {
        return !cancelled && setMode(m => (m === 'steps' ? m : 'ask'));
      }
      const next = await alertsMode();
      if (cancelled) return;
      setAlertsResult(null);
      // Keep the install steps open if they're reading them.
      setMode(m => (next === 'hidden' && m === 'steps' ? m : next));
    };

    const timer = setTimeout(decide, SHOW_AFTER_MS);
    // Installed or uninstalled while the page is open: think again.
    const onPromptChange = () => { decide(); };
    promptListeners.add(onPromptChange);
    // Coming back to DormDash after a while counts as a new visit.
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 60 * 1000) decide();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      promptListeners.delete(onPromptChange);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [uid, role]);

  const dismiss = async () => {
    if (mode === 'ask') {
      snooze(INSTALL_KEY);
      // Alerts matter even if they don't want to install (dashers above all).
      return nextAfterInstall();
    }
    snooze(ALERTS_KEY);
    setMode('hidden');
  };

  const alreadyInstalled = () => {
    store(INSTALLED_KEY, '1');
    nextAfterInstall();
  };

  const yesInstall = async () => {
    if (deferredPrompt) {
      // This browser can install directly: open its own install dialog.
      const evt = deferredPrompt;
      deferredPrompt = null;
      evt.prompt();
      const choice = await evt.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') {
        store(INSTALLED_KEY, '1');
      } else {
        snooze(INSTALL_KEY); // said no in the browser's own dialog: ask again next visit
      }
      nextAfterInstall();
      return;
    }
    setShowAll(false);
    setMode('steps');
  };

  const doneSteps = () => {
    // We can't be sure they finished the steps, so this is a snooze, not
    // "installed": if they didn't, the card comes back next visit.
    snooze(INSTALL_KEY);
    nextAfterInstall();
  };

  const turnOnAlerts = async () => {
    if (!uid) return;
    setBusy(true);
    const ok = await enableWebPush(uid);
    setBusy(false);
    setAlertsResult(ok ? 'on' : 'blocked');
    if (!ok) snooze(ALERTS_KEY);
    setTimeout(() => setMode('hidden'), 2600);
  };

  if (!uid || mode === 'hidden') return null;

  const guide = typeof window !== 'undefined' ? detectGuide() : GUIDES[0];
  const canInstallDirectly = !!deferredPrompt;

  let title = 'Install Runner?';
  let text = 'It opens full screen like a normal app, right from your home screen, and order alerts work best. No app store needed.';
  if (mode === 'steps') {
    title = `Install on ${guide.label}`;
    text = guide.steps;
  }
  if (mode === 'alerts') {
    title = 'Turn on order alerts';
    text = role === 'dasher'
      ? 'Get a notification the moment a new order comes in, even with Runner closed.'
      : 'Get a notification when a runner accepts your order, picks it up and arrives.';
    if (alertsResult === 'on') text = 'Order alerts are on.';
    if (alertsResult === 'blocked') text = 'Alerts are blocked. You can allow them later in your browser\'s site settings.';
  }
  if (mode === 'blocked') {
    title = 'Order alerts are blocked';
    text = (role === 'dasher'
      ? 'You won\'t hear about new orders until you allow notifications. '
      : 'You won\'t be told when your order is on the way until you allow notifications. ')
      + guide.unblock;
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
              {mode === 'blocked' && (
                <Pressable onPress={dismiss} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
                  <Text style={styles.primaryText}>Got it</Text>
                </Pressable>
              )}
              {mode === 'steps' ? (
                <Pressable onPress={() => setShowAll(v => !v)} style={styles.secondary}>
                  <Text style={styles.secondaryText}>{showAll ? 'Hide other devices' : 'Other devices'}</Text>
                </Pressable>
              ) : mode !== 'blocked' && (
                <Pressable onPress={dismiss} style={styles.secondary}>
                  <Text style={styles.secondaryText}>Not now</Text>
                </Pressable>
              )}
            </View>
          )}
          {(mode === 'ask' || mode === 'steps') && !canInstallDirectly && (
            <Pressable onPress={alreadyInstalled} style={styles.link}>
              <Text style={styles.linkText}>I already installed it</Text>
            </Pressable>
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
  primaryText: { color: T.color.card, fontWeight: '700', fontSize: 14 },
  secondary: { paddingHorizontal: 12, paddingVertical: 8 },
  secondaryText: { color: T.color.inkSoft, fontWeight: '700', fontSize: 14 },
  allList: { maxHeight: 220, marginTop: T.space.sm },
  allItem: { marginTop: T.space.xs },
  allLabel: { fontSize: 13, fontWeight: '800', color: T.color.ink, marginTop: 4 },
  link: { alignSelf: 'flex-start', paddingVertical: 4, marginTop: 2 },
  linkText: { color: T.color.inkSoft, fontSize: 12, textDecorationLine: 'underline' },
});

const gate = StyleSheet.create({
  screen: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
    backgroundColor: T.color.cream,
  },
  scroll: { flexGrow: 1 },
  head: { paddingHorizontal: T.space.lg, paddingTop: T.space.xl + 8, paddingBottom: T.space.xl, maxWidth: 520 },
  iconWrap: { width: 76, height: 76, marginBottom: T.space.md },
  appIcon: { width: 76, height: 76 },
  iconBadge: {
    position: 'absolute', right: -6, bottom: -6, width: 30, height: 30, borderRadius: 15,
    backgroundColor: T.color.mustard, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: T.color.card,
  },
  iconBadgeText: { fontSize: 20, lineHeight: 22, fontWeight: '900', color: T.color.ink },
  kicker: { fontFamily: FONT.script, fontSize: 24, color: T.color.mustard, marginBottom: 2 },
  title: { ...T.type.display, fontSize: 36, lineHeight: 42, color: T.color.card },
  lead: { fontSize: 17, lineHeight: 25, fontWeight: '600', color: T.color.seaSoft, marginTop: T.space.md },

  perks: {
    backgroundColor: T.color.tealTint, borderRadius: T.radius.lg, padding: T.space.md, gap: T.space.sm,
  },
  perk: { flexDirection: 'row', alignItems: 'flex-start', gap: T.space.sm },
  tick: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: T.color.teal, marginTop: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  perkText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '700', color: T.color.ink },
  art: {
    width: 48, height: 48, borderRadius: T.radius.md, backgroundColor: T.color.ceruleanTint,
    alignItems: 'center', justifyContent: 'center',
  },
  finish: { paddingHorizontal: T.space.xs },
  finishText: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: T.color.inkSoft },

  body: { paddingHorizontal: T.space.lg, paddingTop: T.space.lg, paddingBottom: T.space.xl, gap: T.space.md, maxWidth: 520 },
  takes: { ...T.type.title, fontSize: 22, color: T.color.ink },
  step: {
    flexDirection: 'row', alignItems: 'center', gap: T.space.md,
    backgroundColor: T.color.card, borderRadius: T.radius.lg, padding: T.space.md,
    borderWidth: 1.5, borderColor: T.color.line, ...T.plate.card,
  },
  num: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: T.color.teal,
    alignItems: 'center', justifyContent: 'center', ...T.plate.teal, shadowOffset: { width: 0, height: 2 },
  },
  numText: { fontFamily: FONT.heading, fontSize: 20, color: T.color.card },
  stepText: { flex: 1, fontSize: 17, lineHeight: 26, fontWeight: '600', color: T.color.ink },
  strong: { fontWeight: '900', color: T.color.ink },
  key: {
    fontWeight: '900', color: T.color.cerulean, backgroundColor: T.color.ceruleanTint,
    borderRadius: 6, overflow: 'hidden',
  },
  copy: {
    alignSelf: 'flex-start', backgroundColor: T.color.card, borderRadius: T.radius.pill,
    paddingHorizontal: T.space.md, paddingVertical: 10, borderWidth: 1.5, borderColor: T.color.cerulean,
    ...T.plate.card, shadowOffset: { width: 0, height: 3 },
  },
  copyText: { fontSize: 15, fontWeight: '800', color: T.color.cerulean },
  older: { fontSize: 13, lineHeight: 19, color: T.color.inkSoft },
  primary: {
    marginTop: T.space.sm, backgroundColor: T.color.mustard, borderRadius: T.radius.pill, height: 58,
    alignItems: 'center', justifyContent: 'center', ...T.plate.mustard, shadowColor: '#8A6214',
  },
  primaryText: { ...T.type.button, fontSize: 17, fontWeight: '900', color: T.color.ink },
  skip: { height: 44, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 14, fontWeight: '700', color: T.color.inkSoft, textDecorationLine: 'underline' },
});
