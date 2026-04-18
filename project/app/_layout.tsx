import { useEffect, useState } from 'react';
import { Stack, useSegments, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_400Regular, PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChange, isCoupleConnected } from '@/services/auth';
import { User } from 'firebase/auth';
import { ActivityIndicator, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { requestForusWidgetUpdate, syncWidgetCacheFromFirestore } from '@/services/androidWidget';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();
  const segments = useSegments();
  const router = useRouter();
  
  const [user, setUser] = useState<User | null>(null);
  const [coupleConnected, setCoupleConnected] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [widgetSyncIdentity, setWidgetSyncIdentity] = useState<{ coupleCode: string; nickname: string } | null>(null);

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
    if (!user?.uid) {
      setCoupleConnected(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        if (!snapshot.exists()) {
          setCoupleConnected(false);
          setWidgetSyncIdentity(null);
          return;
        }

        const data = snapshot.data() as any;
        const connected = Boolean(data?.coupleCode && data?.partnerUid && data?.nickname);
        setCoupleConnected(connected);
        if (connected) {
          setWidgetSyncIdentity({
            coupleCode: String(data.coupleCode),
            nickname: String(data.nickname),
          });
        } else {
          setWidgetSyncIdentity(null);
        }
      },
      (error) => {
        console.error('Error listening to couple connection state:', error);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!coupleConnected || !widgetSyncIdentity?.coupleCode || !widgetSyncIdentity?.nickname) return;

    const widgetDocRef = doc(db, 'couples', widgetSyncIdentity.coupleCode, 'widget', 'shared');
    const unsubscribe = onSnapshot(
      widgetDocRef,
      async () => {
        try {
          await syncWidgetCacheFromFirestore(widgetSyncIdentity);
          await requestForusWidgetUpdate(widgetSyncIdentity.coupleCode);
        } catch (error) {
          console.error('Global widget sync failed:', error);
        }
      },
      (error) => {
        console.error('Global widget listener failed:', error);
      }
    );

    return () => unsubscribe();
  }, [coupleConnected, widgetSyncIdentity]);

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
        <Stack.Screen name="live-widget" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}