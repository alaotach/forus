import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'default',
      }}
    >
      <Stack.Screen name="auth" />
      <Stack.Screen name="verify-email" />
      <Stack.Screen name="couple-check" />
      <Stack.Screen name="couple-code" />
      <Stack.Screen name="couple-options" />
      <Stack.Screen name="join-couple" />
      <Stack.Screen name="nickname" />
      <Stack.Screen name="waiting-for-partner" />
    </Stack>
  );
}
