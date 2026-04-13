import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Copy, Share2, Heart, ArrowRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { getCurrentUser, getUserProfile } from '@/services/auth';
import * as Clipboard from 'expo-clipboard';
import { useCouple } from '@/hooks/useCouple';

export default function CoupleCodeScreen() {
  const router = useRouter();
  const { saveCoupleData } = useCouple();
  const [coupleCode, setCoupleCode] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const user = getCurrentUser();

  useEffect(() => {
    loadCoupleCode();
  }, []);

  const loadCoupleCode = async () => {
    if (!user) {
      // @ts-ignore
      router.replace('/(auth)/auth');
      return;
    }

    try {
      const profile = await getUserProfile(user.uid);
      if (profile && profile.coupleCode) {
        setCoupleCode(profile.coupleCode);
        setNickname(profile.nickname);
      }
    } catch (error) {
      console.error('Error loading couple code:', error);
      Alert.alert('Error', 'Failed to load couple code');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!coupleCode) return;
    
    await Clipboard.setStringAsync(coupleCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareCode = async () => {
    if (!coupleCode) return;

    try {
      await Share.share({
        message: `My ForUs couple code: ${coupleCode}\n\nDownload the app and enter this code to connect with me!`,
        title: 'ForUs Couple Code',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleWaitForPartner = async () => {
    if (!coupleCode || !nickname) return;
    
    // Save couple data locally before navigating
    await saveCoupleData({
      nickname,
      coupleCode,
    });
    
    // Go to waiting screen
    // @ts-ignore
    router.replace('/(auth)/waiting-for-partner');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LinearGradient colors={['#ff6b9d', '#c44569']} style={styles.gradient}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={['#ff6b9d', '#c44569']} style={styles.gradient}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Heart size={48} color="#ffffff" fill="#ffffff" />
            </View>
            <Text style={styles.title}>Your Couple Code</Text>
            <Text style={styles.subtitle}>
              Share this code with your partner to connect
            </Text>
          </View>

          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>YOUR CODE</Text>
            <Text style={styles.code}>{coupleCode}</Text>
            <View style={styles.codeBadge}>
              <Text style={styles.codeBadgeText}>6-digit code</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleShareCode}
            >
              <Share2 size={20} color="#ff6b9d" style={styles.buttonIcon} />
              <Text style={styles.primaryButtonText}>Share Code</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleCopyCode}
            >
              {copied ? (
                <Text style={styles.secondaryButtonText}>✓ Copied!</Text>
              ) : (
                <>
                  <Copy size={20} color="#ffffff" style={styles.buttonIcon} />
                  <Text style={styles.secondaryButtonText}>Copy Code</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>💡 Next Steps</Text>
            <Text style={styles.infoText}>
              Your partner needs to register, then enter your couple code to connect with you.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.waitButton}
            onPress={handleWaitForPartner}
          >
            <Text style={styles.waitButtonText}>Continue</Text>
            <ArrowRight size={20} color="#ffffff" />
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
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
    opacity: 0.95,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 24,
  },
  codeBox: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ff6b9d',
    marginBottom: 12,
    letterSpacing: 2,
  },
  code: {
    fontSize: 52,
    fontWeight: 'bold',
    color: '#ff6b9d',
    letterSpacing: 8,
    marginBottom: 16,
  },
  codeBadge: {
    backgroundColor: '#fff0f5',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  codeBadgeText: {
    fontSize: 12,
    color: '#ff6b9d',
    fontWeight: '600',
  },
  actions: {
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  buttonIcon: {
    marginRight: 8,
  },
  primaryButtonText: {
    color: '#ff6b9d',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 20,
    opacity: 0.9,
  },
  waitButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  waitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
});
