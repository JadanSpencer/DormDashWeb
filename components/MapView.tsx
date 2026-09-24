// components/MapView.tsx
// Native build: straight re-export of react-native-maps.
// The web build resolves components/MapView.web.tsx instead, because
// react-native-maps imports native-only internals and breaks the web bundle.
// Screens import from here — never from 'react-native-maps' directly.

export { default, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
