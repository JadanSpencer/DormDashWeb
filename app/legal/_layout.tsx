// app/legal/_layout.tsx
// Public pages: open to everyone, signed in or not (see RouteGuard in
// app/_layout.tsx, which skips the "legal" segment).
import { Stack } from 'expo-router';
export default function LegalLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
