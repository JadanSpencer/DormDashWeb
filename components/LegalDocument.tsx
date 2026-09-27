// components/LegalDocument.tsx
// Renders the Privacy Policy and Terms of Service from plain data
// (app/legal/*.tsx), so the wording can be edited without touching layout.
// Readable line length (max 680px), real headings for screen readers,
// and no decoration: legal text should look like a document.

import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './TabIcon'; // SVG icons: no icon font to fail loading
import { FONT, T } from '../constants/theme';
import { Backdrop } from './Backdrop';

export type Block =
  | { p: string }
  | { list: string[] }
  | { table: [string, string][] };

export type Section = { title: string; blocks: Block[] };

export function LegalDocument({ title, updated, intro, sections }: {
  title: string; updated: string; intro: string; sections: Section[];
}) {
  const insets = useSafeAreaInsets();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={styles.root}>
    <Backdrop tone="cream" />
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 48 }]}
    >
      <View style={styles.column}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} style={styles.back}>
          <Icon name="chevron-back" size={20} color={T.color.ink} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        <Text style={styles.updated}>Last updated {updated}</Text>
        <Text style={styles.p}>{linkify(intro)}</Text>

        {sections.map((s, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.h2} accessibilityRole="header">{s.title}</Text>
            {s.blocks.map((b, j) => {
              if ('p' in b) return <Text key={j} style={styles.p}>{linkify(b.p)}</Text>;
              if ('list' in b) {
                return (
                  <View key={j} style={styles.list}>
                    {b.list.map((li, k) => (
                      <View key={k} style={styles.li}>
                        <View style={styles.dot} />
                        <Text style={[styles.p, styles.liText]}>{linkify(li)}</Text>
                      </View>
                    ))}
                  </View>
                );
              }
              return (
                <View key={j} style={styles.table}>
                  {b.table.map(([k, v], r) => (
                    <View key={r} style={[styles.tr, r > 0 && styles.trLine]}>
                      <Text style={styles.th}>{k}</Text>
                      <Text style={styles.td}>{linkify(v)}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
    </View>
  );
}

// Turns email addresses and /legal/* paths inside text into links.
function linkify(text: string): React.ReactNode {
  const parts = text.split(/(\S+@\S+\.[a-z]{2,}|\/legal\/(?:privacy|terms))/g);
  return parts.map((part, i) => {
    if (/@/.test(part)) {
      return <Text key={i} style={styles.link} onPress={() => Linking.openURL(`mailto:${part}`)}>{part}</Text>;
    }
    if (part === '/legal/privacy' || part === '/legal/terms') {
      const label = part.endsWith('privacy') ? 'Privacy Policy' : 'Terms of Service';
      return <Text key={i} style={styles.link} onPress={() => router.push(part as any)}>{label}</Text>;
    }
    return part;
  });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.color.cream },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2, paddingVertical: 6, marginBottom: 16 },
  backText: { fontSize: 15, fontWeight: '600', color: T.color.ink },
  title: { fontFamily: FONT.heading, fontSize: 30, lineHeight: 38, letterSpacing: -0.3, color: T.color.ink },
  updated: { fontSize: 13, color: T.color.inkSoft, marginTop: 6, marginBottom: 20 },
  section: { marginTop: 28 },
  h2: { fontFamily: FONT.heading, fontSize: 19, lineHeight: 26, color: T.color.ink, marginBottom: 8 },
  p: { fontSize: 15, lineHeight: 23, color: T.color.ink, marginBottom: 10 },
  list: { marginBottom: 6 },
  li: { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: T.color.inkSoft, marginTop: 9, marginRight: 10 },
  liText: { flex: 1, marginBottom: 6 },
  table: { borderWidth: 1, borderColor: T.color.line, borderRadius: 10, backgroundColor: T.color.card, marginBottom: 12 },
  tr: { paddingHorizontal: 14, paddingVertical: 12 },
  trLine: { borderTopWidth: 1, borderTopColor: T.color.line },
  th: { fontSize: 14, fontWeight: '700', color: T.color.ink, marginBottom: 2 },
  td: { fontSize: 14, lineHeight: 21, color: T.color.inkSoft },
  link: { color: T.color.ceruleanDeep, textDecorationLine: 'underline' },
});
