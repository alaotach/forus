import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_400Regular, PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChange, isCoupleConnected } from '@/services/auth';
import { useRouter } from 'expo-router';
import { User } from 'firebase/auth';
import { ActivityIndicator, View } from 'react-native';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();
  const [user, setUser] = useState<User | null>(null);
  const [coupleConnected, setCoupleConnected] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
    'Playfair-Regular': PlayfairDisplay_400Regular,
    'Playfair-Bold': PlayfairDisplay_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (authUser) => {
      setUser(authUser);

      if (authUser) {
        try {
          const connected = await isCoupleConnected(authUser.uid);
          setCoupleConnected(connected);
        } catch (error) {
          console.error('Error checking couple connection:', error);
          setCoupleConnected(false);
        }
      }

      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  if (authLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#FF6B6B" />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        {!user ? (
          // Auth Stack - Show when user is not logged in
          <>
            <Stack.Screen name="(auth)/auth" options={{ animationEnabled: false }} />
            <Stack.Screen name="(auth)/nickname" />
            <Stack.Screen name="(auth)/couple-code" />
            <Stack.Screen name="(auth)/couple-check" />
            <Stack.Screen name="(auth)/couple-options" />
            <Stack.Screen name="(auth)/join-couple" />
            <Stack.Screen name="(auth)/waiting-for-partner" />
          </>
        ) : !coupleConnected ? (
          // Couple Setup Stack - Show when user is logged in but couple not connected
          <>
            <Stack.Screen name="(auth)/couple-check" options={{ animationEnabled: false }} />
            <Stack.Screen name="(auth)/couple-code" />
            <Stack.Screen name="(auth)/couple-options" />
            <Stack.Screen name="(auth)/join-couple" />
            <Stack.Screen name="(auth)/waiting-for-partner" />
          </>
        ) : (
          // App Stack - Show when couple is fully connected
          <>
            <Stack.Screen name="(tabs)" options={{ animationEnabled: false }} />
            <Stack.Screen name="paragraph" />
            <Stack.Screen name="shared-diary" />
            <Stack.Screen name="echo" />
            <Stack.Screen name="conflict" />
            <Stack.Screen name="deep-talk" />
            <Stack.Screen name="goals" />
            <Stack.Screen name="subscriptions" />
            <Stack.Screen name="milestones" />
            <Stack.Screen name="+not-found" />
          </>
        )}
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}