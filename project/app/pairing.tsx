import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, Users, Sparkles } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCouple } from '@/hooks/useCouple';
import { doc, setDoc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';

const { width, height } = Dimensions.get('window');

export default function PairingScreen() {
  const [nickname, setNickname] = useState('');
  const [coupleCode, setCoupleCode] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const router = useRouter();
  const { saveCoupleData, isConnected } = useCouple();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // If already connected, redirect to home
    if (isConnected) {
      router.replace('/(tabs)');
      return;
    }

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isConnected]);

  const generateRandomCode = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setCoupleCode(code);
  };

  const handleConnect = async () => {
    if (!nickname.trim() || !coupleCode.trim()) {
      Alert.alert('Missing Information', 'Please enter both nickname and couple code');
      return;
    }

    if (coupleCode.length !== 6 || !/^\d+$/.test(coupleCode)) {
      Alert.alert('Invalid Code', 'Couple code must be exactly 6 digits');
      return;
    }

    setIsConnecting(true);

    try {
      const coupleRef = doc(db, 'couples', coupleCode);
      const coupleDoc = await getDoc(coupleRef);

      const userData = {
        nickname: nickname.trim(),
        coupleCode,
        lastSeen: serverTimestamp(),
        joinedAt: serverTimestamp(),
      };

      if (!coupleDoc.exists()) {
        // Create new couple space
        await setDoc(coupleRef, {
          createdAt: serverTimestamp(),
          users: {
            [nickname.trim()]: userData
          }
        });
        console.log('Created new couple space');
      } else {
        // Join existing couple space
        const existingData = coupleDoc.data();
        const users = existingData.users || {};
        
        if (users[nickname.trim()]) {
          Alert.alert('Nickname Taken', 'This nickname is already used in this couple. Try another one.');
          setIsConnecting(false);
          return;
        }

        if (Object.keys(users).length >= 2) {
          Alert.alert('Couple Full', 'This couple space already has 2 members. Please use a different code.');
          setIsConnecting(false);
          return;
        }

        await updateDoc(coupleRef, {
          [`users.${nickname.trim()}`]: userData
        });
        console.log('Joined existing couple space');
      }

      // Save couple data locally
      const coupleData = { nickname: nickname.trim(), coupleCode };
      await saveCoupleData(coupleData);
      console.log('Saved couple data locally:', coupleData);

      // Small delay to ensure data is saved
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 500);

    } catch (error) {
      console.error('Connection error:', error);
      Alert.alert('Connection Failed', 'Please check your internet connection and try again');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <LinearGradient
        colors={['#ff9a9e', '#fecfef', '#fecfef']}
        style={styles.container}
      >
        <View style={styles.content}>
          <Animated.View 
            style={[
              styles.header,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.iconContainer}>
              <Heart size={48} color="#ffffff" fill="#ffffff" />
              <Sparkles size={24} color="#ffffff" style={styles.sparkle1} />
              <Sparkles size={16} color="#ffffff" style={styles.sparkle2} />
            </View>
            <Text style={styles.title}>Hearts Connected</Text>
            <Text style={styles.subtitle}>Create your private space together</Text>
          </Animated.View>

          <Animated.View 
            style={[
              styles.form,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.inputContainer}>
              <Users size={20} color="#ff6b9d" />
              <TextInput
                style={styles.input}
                placeholder="Your nickname"
                value={nickname}
                onChangeText={setNickname}
                placeholderTextColor="#c7a3d0"
                autoCapitalize="words"
                maxLength={20}
                editable={!isConnecting}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.codeIcon}>💕</Text>
              <TextInput
                style={styles.input}
                placeholder="6-digit couple code"
                value={coupleCode}
                onChangeText={setCoupleCode}
                placeholderTextColor="#c7a3d0"
                keyboardType="numeric"
                maxLength={6}
                editable={!isConnecting}
              />
              <TouchableOpacity 
                onPress={generateRandomCode} 
                style={styles.generateButton}
                disabled={isConnecting}
              >
                <Text style={styles.generateText}>Generate</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
              onPress={handleConnect}
              disabled={isConnecting}
            >
              <LinearGradient
                colors={['#ff6b9d', '#c44569']}
                style={styles.buttonGradient}
              >
                <Text style={styles.connectButtonText}>
                  {isConnecting ? 'Connecting Hearts...' : 'Connect 💖'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View 
            style={[
              styles.footer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Text style={styles.footerText}>
              Create a unique 6-digit code to share with your partner, or use an existing one to join their space. 
              This creates your private, intimate connection that only you two can access.
            </Text>
          </Animated.View>
        </View>
      </LinearGradient>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  iconContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  sparkle1: {
    position: 'absolute',
    top: -10,
    right: -15,
  },
  sparkle2: {
    position: 'absolute',
    bottom: -5,
    left: -20,
  },
  title: {
    fontSize: 36,
    fontFamily: 'Playfair-Bold',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 18,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.9,
  },
  form: {
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  codeIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginLeft: 12,
    color: '#333',
  },
  generateButton: {
    backgroundColor: '#ff6b9d',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  generateText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  connectButton: {
    borderRadius: 20,
    marginTop: 8,
    shadowColor: '#ff6b9d',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  connectButtonDisabled: {
    opacity: 0.7,
  },
  buttonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    borderRadius: 20,
  },
  connectButtonText: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.8,
    lineHeight: 22,
  },
});