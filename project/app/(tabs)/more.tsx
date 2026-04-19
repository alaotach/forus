import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Modal,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles, Smile, MessageSquare, Calendar, Bot, Settings, LogOut, Target, Heart, Circle as HelpCircle, X, Crown } from 'lucide-react-native';
import { useCouple } from '@/hooks/useCouple';
import { useRouter } from 'expo-router';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { logoutUser } from '@/services/auth';
import { AdBanner } from '@/components/AdBanner';
import { getSubscription, shouldShowAds, SubscriptionData } from '@/services/subscriptions';

type FeatureCard = {
  id: string;
  title: string;
  subtitle: string;
  icon: any;
  emoji: string;
  colors: [string, string];
  route?: string;
};

export default function MoreScreen() {
  const { coupleData, isConnected, clearCoupleData } = useCouple();
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [isSubmittingMood, setIsSubmittingMood] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [showAdBanner, setShowAdBanner] = useState(true);

  const moods = [
    { emoji: '😊', label: 'Happy', color: '#fdcb6e' },
    { emoji: '💕', label: 'Romantic', color: '#fd79a8' },
    { emoji: '🙏', label: 'Grateful', color: '#00b894' },
    { emoji: '😔', label: 'Sad', color: '#74b9ff' },
    { emoji: '😤', label: 'Angry', color: '#e17055' },
    { emoji: '🥺', label: 'Nostalgic', color: '#a29bfe' },
  ];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Load subscription
    if (coupleData) {
      loadSubscription();
    }
  }, [coupleData]);

  const performLogout = async () => {
    try {
      await clearCoupleData();
      await logoutUser();
      router.replace('/(auth)/auth');
    } catch (error) {
      console.error('Logout failed:', error);
      Alert.alert('Error', 'Unable to log out right now.');
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const proceed = typeof globalThis.confirm === 'function'
        ? globalThis.confirm('Are you sure you want to disconnect from your couple space?')
        : true;
      if (proceed) {
        performLogout();
      }
      return;
    }

    Alert.alert(
      'Disconnect',
      'Are you sure you want to disconnect from your couple space?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: performLogout,
        }
      ]
    );
  };

  const loadSubscription = async () => {
    if (!coupleData) return;
    
    try {
      const sub = await getSubscription(coupleData.coupleCode);
      setSubscription(sub);
      setShowAdBanner(shouldShowAds(sub));
    } catch (error) {
      console.error('Error loading subscription:', error);
    }
  };

  const handleFeature = (feature: string, route?: string) => {
    if (feature === 'Mood Check-In') {
      setShowMoodModal(true);
      setSelectedMood(null);
    } else if (route) {
      router.push(route as any);
    } else {
      Alert.alert('Coming Soon', `${feature} will be implemented soon! 💕`);
    }
  };

  const submitMood = async () => {
    if (!selectedMood || !coupleData) return;

    try {
      setIsSubmittingMood(true);
      const moodoChecksRef = collection(db, 'couples', coupleData.coupleCode, 'moodChecks');
      await addDoc(moodoChecksRef, {
        mood: selectedMood,
        user: coupleData.nickname,
        timestamp: serverTimestamp(),
      });

      try {
        const moodEmoji = moods.find((item) => item.label === selectedMood)?.emoji || '😊';
        const { notifyMoodChanged } = await import('@/services/notifications');
        await notifyMoodChanged(
          coupleData.coupleCode,
          coupleData.nickname,
          selectedMood,
          moodEmoji
        );
      } catch (error) {
        console.warn('Mood notification error:', error);
      }

      setShowMoodModal(false);
      setSelectedMood(null);
      Alert.alert('Mood recorded', `${selectedMood} mood saved! 💭`);
    } catch (error) {
      console.error('Error saving mood:', error);
      Alert.alert('Error', 'Failed to save mood');
    } finally {
      setIsSubmittingMood(false);
    }
  };

  if (!isConnected) {
    return null;
  }

  const features: FeatureCard[] = [
    {
      id: 'goals',
      title: 'Shared Goals',
      subtitle: 'Set and achieve goals together',
      icon: Target,
      emoji: '🎯',
      colors: ['#00b894', '#00a085'],
      route: '/goals'
    },
    {
      id: 'mood',
      title: 'Mood Check-In',
      subtitle: 'Share how you\'re feeling today',
      icon: Smile,
      emoji: '😊',
      colors: ['#a29bfe', '#6c5ce7']
    },
    {
      id: 'conflict',
      title: 'Conflict Helper',
      subtitle: 'Work through challenges together',
      icon: MessageSquare,
      emoji: '🤝',
      colors: ['#fd79a8', '#e84393'],
      route: '/conflict'
    },
    {
      id: 'milestones',
      title: 'Milestones',
      subtitle: 'Track important dates & countdowns',
      icon: Calendar,
      emoji: '📅',
      colors: ['#fdcb6e', '#e17055'],
      route: '/milestones'
    },
    {
      id: 'echo',
      title: 'Echo (AI Companion)',
      subtitle: 'Chat with your memory keeper',
      icon: Bot,
      emoji: '🤖',
      colors: ['#74b9ff', '#0984e3'],
      route: '/echo'
    },
    {
      id: 'questions',
      title: 'Deep Questions',
      subtitle: 'Daily questions to grow closer',
      icon: Sparkles,
      emoji: '💭',
      colors: ['#e17055', '#d63031'],
      route: '/deep-talk'
    },
    {
      id: 'live-widget',
      title: 'Shared Live Widget',
      subtitle: 'Photo + doodle + caption synced for both',
      icon: Sparkles,
      emoji: '🖼️',
      colors: ['#ff8fab', '#ffb86c'],
      route: '/live-widget'
    }
  ];

  return (
    <LinearGradient colors={['#fd79a8', '#fdcb6e']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.View 
          style={[
            styles.header,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Sparkles size={24} color="#ffffff" />
          <Text style={styles.headerTitle}>More Features ✨</Text>
        </Animated.View>

        <View style={styles.content}>
          <Animated.View 
            style={[
              styles.profileCard,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.9)', 'rgba(255, 255, 255, 0.8)']}
              style={styles.profileGradient}
            >
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>Hey {coupleData?.nickname}! 👋</Text>
                <Text style={styles.profileCode}>Couple Code: {coupleData?.coupleCode}</Text>
              </View>
              <Heart size={24} color="#fd79a8" />
            </LinearGradient>
          </Animated.View>

          <ScrollView style={styles.featuresList} showsVerticalScrollIndicator={false}>
            <AdBanner 
              visible={showAdBanner} 
              onClose={() => setShowAdBanner(false)}
            />

            {features.map((feature, index) => (
              <Animated.View 
                key={feature.id}
                style={[
                  {
                    opacity: fadeAnim,
                    transform: [{
                      translateY: slideAnim.interpolate({
                        inputRange: [0, 50],
                        outputRange: [0, 50 + index * 20],
                      }),
                    }],
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.featureCard}
                  onPress={() => handleFeature(feature.title, feature.route)}
                >
                  <LinearGradient
                    colors={feature.colors}
                    style={styles.featureGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <View style={styles.featureContent}>
                      <View style={styles.featureIcon}>
                        <Text style={styles.featureEmoji}>{feature.emoji}</Text>
                      </View>
                      <View style={styles.featureInfo}>
                        <Text style={styles.featureTitle}>{feature.title}</Text>
                        <Text style={styles.featureSubtitle}>{feature.subtitle}</Text>
                      </View>
                      <feature.icon size={20} color="#ffffff" style={styles.featureArrow} />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            ))}

            <Animated.View 
              style={[
                styles.settingsSection,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <Text style={styles.sectionTitle}>Settings</Text>
              
              <TouchableOpacity 
                style={styles.settingsItem}
                onPress={() => router.push('/settings')}
              >
                <Settings size={20} color="#666" />
                <Text style={styles.settingsText}>App Settings</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.settingsItem}
                onPress={() => router.push('/support')}
              >
                <HelpCircle size={20} color="#666" />
                <Text style={styles.settingsText}>Help & Support</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.settingsItem}
                onPress={() => router.push('/mood-history')}
              >
                <Smile size={20} color="#666" />
                <Text style={styles.settingsText}>Mood History</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.settingsItem}
                onPress={handleLogout}
              >
                <LogOut size={20} color="#ff6b6b" />
                <Text style={[styles.settingsText, styles.logoutText]}>Disconnect</Text>
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
                Made with 💕 for couples who want to stay connected
              </Text>
            </Animated.View>
          </ScrollView>
        </View>

        {/* Mood Modal */}
        <Modal 
          visible={showMoodModal}
          animationType="fade"
          transparent={true}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.moodModalContent}>
              <View style={styles.moodModalHeader}>
                <Text style={styles.moodModalTitle}>How are you feeling today? 💭</Text>
                <TouchableOpacity 
                  onPress={() => setShowMoodModal(false)}
                  style={styles.moodCloseButton}
                >
                  <X size={24} color="#333" />
                </TouchableOpacity>
              </View>

              <View style={styles.moodsGrid}>
                {moods.map((mood) => (
                  <TouchableOpacity
                    key={mood.label}
                    style={[
                      styles.moodOption,
                      selectedMood === mood.label && styles.moodOptionSelected,
                    ]}
                    onPress={() => setSelectedMood(mood.label)}
                  >
                    <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                    <Text style={styles.moodLabel}>{mood.label}</Text>
                    {selectedMood === mood.label && (
                      <View style={[styles.moodCheckmark, { backgroundColor: mood.color }]} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.moodSubmitButton,
                  !selectedMood && styles.moodSubmitButtonDisabled,
                ]}
                onPress={submitMood}
                disabled={!selectedMood || isSubmittingMood}
              >
                <LinearGradient
                  colors={['#a29bfe', '#6c5ce7']}
                  style={styles.moodSubmitGradient}
                >
                  <Text style={styles.moodSubmitText}>
                    {isSubmittingMood ? 'Saving...' : 'Share My Mood'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Playfair-Bold',
    color: '#ffffff',
    marginLeft: 8,
  },
  content: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  profileCard: {
    borderRadius: 20,
    marginBottom: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  profileGradient: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginBottom: 4,
  },
  profileCode: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
  },
  featuresList: {
    flex: 1,
    paddingBottom: 100,
  },
  featureCard: {
    borderRadius: 20,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  featureGradient: {
    padding: 20,
  },
  featureContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  featureEmoji: {
    fontSize: 20,
  },
  featureInfo: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
    marginBottom: 2,
  },
  featureSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    opacity: 0.9,
  },
  featureArrow: {
    opacity: 0.8,
  },
  settingsSection: {
    marginTop: 32,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginBottom: 16,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  settingsText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#333',
    marginLeft: 12,
  },
  logoutText: {
    color: '#ff6b6b',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  moodModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  moodModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  moodModalTitle: {
    fontSize: 18,
    fontFamily: 'Playfair-Bold',
    color: '#333',
    flex: 1,
  },
  moodCloseButton: {
    padding: 4,
  },
  moodsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  moodOption: {
    width: '32%',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#f8f9fa',
    marginBottom: 12,
  },
  moodOptionSelected: {
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: '#a29bfe',
  },
  moodEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  moodLabel: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
  },
  moodCheckmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  moodSubmitButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  moodSubmitButtonDisabled: {
    opacity: 0.5,
  },
  moodSubmitGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodSubmitText: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
  },
});