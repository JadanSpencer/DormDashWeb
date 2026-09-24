// app/(student)/_layout.tsx
// Wraps the entire student section.
// Slots in the tabs navigator below.
import { Stack } from 'expo-router';
export default function StudentLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}