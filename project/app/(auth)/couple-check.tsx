import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getCurrentUser, getUserProfile, isCoupleConnected, refreshCurrentUser } from '@/services/auth';
import { useCouple } from '@/hooks/useCouple';

export default function CoupleCheckScreen() {
  const router = useRouter();
  const { saveCoupleData } = useCouple();
  const [loading, setLoading] = useState(true);
  const [coupled, setCoupled] = useState(false);
  const user = getCurrentUser();

  useEffect(() => {
    checkCoupleStatus();
  }, []);

  const checkCoupleStatus = async () => {
    if (!user) {
      // @ts-ignore
      router.replace('/(auth)/auth');
      return;
    }

    const refreshedUser = await refreshCurrentUser();
    if (!refreshedUser?.emailVerified) {
      // @ts-ignore
      router.replace('/(auth)/verify-email');
      return;
    }

    try {
      const profile = await getUserProfile(user.uid);
      const isConnected = await isCoupleConnected(user.uid);
      setCoupled(isConnected);

      if (isConnected) {
        // Save couple data locally for returning users
        if (profile?.nickname && profile?.coupleCode) {
          await saveCoupleData({
            nickname: profile.nickname,
            coupleCode: profile.coupleCode,
          });
          console.log('Saved existing couple data for returning user');
        }
        
        // Couple is connected, go to app
        setTimeout(() => {
          router.replace('/(tabs)');
        }, 500);
      } else {
        // Check if user has a couple code (first user) or needs to join (second user)
        if (profile?.coupleCode && !profile?.partnerUid) {
          // First user - show couple code screen
          // @ts-ignore
          router.replace('/(auth)/couple-code');
        } else if (!profile?.coupleCode && !profile?.partnerUid) {
          // No couple code set - show join option
          // @ts-ignore
          router.replace('/(auth)/couple-options');
        } else {
          // In some edge case, show waiting
          // @ts-ignore
          router.replace('/(auth)/waiting-for-partner');
        }
      }
    } catch (error) {
      console.error('Error checking couple status:', error);
      Alert.alert('Error', 'Failed to check couple status');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.loadingText}>Checking your account...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>ForUs</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100%',
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#999',
  },
});
