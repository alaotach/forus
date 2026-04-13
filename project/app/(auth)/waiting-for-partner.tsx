import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Heart, Users, CheckCircle2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { getCurrentUser, getUserProfile, isCoupleConnected } from '@/services/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useCouple } from '@/hooks/useCouple';

export default function WaitingForPartnerScreen() {
  const router = useRouter();
  const { saveCoupleData } = useCouple();
  const [partnerNickname, setPartnerNickname] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const user = getCurrentUser();
  
  // Animated pulse for hearts
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Start pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    if (!user) {
      // @ts-ignore
      router.replace('/(auth)/auth');
      return;
    }

    // Setup real-time listener for user document
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          
          // Check if couple is now connected (partnerUid exists)
          if (data.partnerUid) {
            try {
              const partnerProfile = await getUserProfile(data.partnerUid);
              if (partnerProfile) {
                // Save couple data locally
                await saveCoupleData({
                  nickname: data.nickname,
                  coupleCode: data.coupleCode,
                });
                
                // Show success and navigate
                Alert.alert(
                  'Partner Connected! 🎉',
                  `${partnerProfile.nickname} has joined!`,
                  [
                    {
                      text: "Let's Go!",
                      onPress: () => {
                        router.replace('/(tabs)');
                      },
                    },
                  ]
                );
              }
            } catch (error) {
              console.error('Error getting partner profile:', error);
            }
          }
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to user:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleCancel = () => {
    Alert.alert(
      'Cancel Waiting?',
      'You can share your couple code again later',
      [
        { text: 'Keep Waiting', style: 'cancel' },
        {
          text: 'Go Back',
          style: 'destructive',
          onPress: () => {            // @ts-ignore            router.replace('/(auth)/couple-code');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={['#ff6b9d', '#c44569']} style={styles.gradient}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Animated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
              <Heart size={56} color="#ffffff" fill="#ffffff" />
            </Animated.View>
            <Text style={styles.title}>Waiting for Partner...</Text>
            <Text style={styles.subtitle}>
              We'll notify you when they connect
            </Text>
          </View>

          <View style={styles.stepsContainer}>
            <Text style={styles.stepsTitle}>📱 What Your Partner Should Do</Text>
            
            <View style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <CheckCircle2 size={20} color="#ffffff" />
              </View>
              <Text style={styles.stepText}>Download the ForUs app</Text>
            </View>

            <View style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <Users size={20} color="#ffffff" />
              </View>
              <Text style={styles.stepText}>Register with email & password</Text>
            </View>

            <View style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <Heart size={20} color="#ffffff" />
              </View>
              <Text style={styles.stepText}>Enter your couple code to connect</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
          >
            <Text style={styles.cancelButtonText}>Go Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 100,
    justifyContent: 'center',
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.95,
    paddingHorizontal: 20,
  },
  stepsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 32,
  },
  stepsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 20,
    textAlign: 'center',
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  stepNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: '#ffffff',
    lineHeight: 22,
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
