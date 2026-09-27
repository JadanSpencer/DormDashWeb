// components/MapView.web.tsx
// Web / PWA stand-in for react-native-maps.
//
// Same import surface as the native map (default MapView, Marker,
// PROVIDER_GOOGLE) so screens don't need Platform checks. It renders a
// keyless Google Maps embed centred on the first <Marker>, plus a button that
// opens turn-by-turn directions in the Google Maps app / site.
//
// Limitations vs native (see PWA_HANDOFF.md):
//   • One pin shown (the first Marker — the drop-off). The dasher's own
//     position is used as the directions origin instead of a second pin.
//   • Not interactive beyond what the embed allows.
// Upgrade path: swap the iframe for @vis.gl/react-google-maps with the
// restricted EXPO_PUBLIC_GOOGLE_MAPS_API_KEY if multi-pin maps are needed.

import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';

type LatLng = { latitude: number; longitude: number };

export const PROVIDER_GOOGLE = 'google';

type MarkerProps = { coordinate: LatLng; title?: string; pinColor?: string };

// Markers are read by MapView below; they render nothing on their own.
export function Marker(_props: MarkerProps) {
  return null;
}

type MapViewProps = {
  style?: any;
  provider?: string;
  initialRegion?: LatLng & { latitudeDelta?: number; longitudeDelta?: number };
  children?: React.ReactNode;
};

function zoomFor(delta?: number) {
  if (!delta) return 16;
  // Rough mapping from region delta to Google zoom level.
  const z = Math.round(Math.log2(360 / delta));
  return Math.max(12, Math.min(18, z));
}

export default function MapView({ style, initialRegion, children }: MapViewProps) {
  const markers: MarkerProps[] = [];
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && (child.props as any)?.coordinate) {
      markers.push(child.props as MarkerProps);
    }
  });

  const target = markers[0]?.coordinate ?? initialRegion;
  if (!target) return <View style={style} />;

  const origin = markers[1]?.coordinate;
  const zoom = zoomFor(initialRegion?.latitudeDelta);
  const q = `${target.latitude},${target.longitude}`;
  const src = `https://maps.google.com/maps?q=${q}&z=${zoom}&output=embed`;
  const directions =
    `https://www.google.com/maps/dir/?api=1&destination=${q}` +
    (origin ? `&origin=${origin.latitude},${origin.longitude}` : '');

  return (
    <View style={[style, styles.wrap]}>
      {React.createElement('iframe', {
        src,
        title: markers[0]?.title ?? 'Map',
        loading: 'lazy',
        referrerPolicy: 'no-referrer-when-downgrade',
        style: { border: 0, width: '100%', height: '100%', display: 'block' },
      })}
      <Pressable
        accessibilityRole="link"
        onPress={() => Linking.openURL(directions)}
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.btnText}>Get directions</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden' },
  btn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: '#1F4E79', // indigo (T.color.cerulean)
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});
