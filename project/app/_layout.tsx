import { useEffect, useState } from 'react';
import { Stack, useSegments, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_400Regular, PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChange, isCoupleConnected } from '@/services/auth';
import { User } from 'firebase/auth';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();
  const segments = useSegments();
  const router = useRouter();
  
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

  useEffect(() => {
    if (authLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    
    if (!user) {
      if (!inAuthGroup) {
        router.replace('/(auth)/auth');
      }
    } else if (!coupleConnected) {
      // Allow them to navigate through the connection flow, but don't allow them in tabs yet.
      if (!inAuthGroup) {
        router.replace('/(auth)/couple-check');
      }
    } else {
      // Connected, if they are stuck in auth, push them to tabs
      if (inAuthGroup) {
        router.replace('/(tabs)');
      }
    }
  }, [user, coupleConnected, authLoading, segments]);

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ animationEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ animationEnabled: false }} />
        <Stack.Screen name="paragraph" />
        <Stack.Screen name="shared-diary" />
        <Stack.Screen name="echo" />
        <Stack.Screen name="conflict" />
        <Stack.Screen name="deep-talk" />
        <Stack.Screen name="subscriptions" />
        <Stack.Screen name="milestones" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="support" />
        <Stack.Screen name="mood-history" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}