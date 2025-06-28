import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles, Smile, MessageSquare, Calendar, Bot, Settings, LogOut, Target, Heart, Circle as HelpCircle } from 'lucide-react-native';
import { useCouple } from '@/hooks/useCouple';
import { useRouter } from 'expo-router';

export default function MoreScreen() {
  const { coupleData, isConnected, clearCoupleData } = useCouple();
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

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
  }, []);

  const handleLogout = () => {
    Alert.alert(
      'Disconnect',
      'Are you sure you want to disconnect from your couple space?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await clearCoupleData();
            router.replace('/pairing');
          }
        }
      ]
    );
  };

  const handleFeature = (feature: string, route?: string) => {
    if (route) {
      router.push(route as any);
    } else {
      Alert.alert('Coming Soon', `${feature} will be implemented soon! 💕`);
    }
  };

  if (!isConnected) {
    return null;
  }

  const features = [
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
      colors: ['#fdcb6e', '#e17055']
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
                onPress={() => handleFeature('Settings')}
              >
                <Settings size={20} color="#666" />
                <Text style={styles.settingsText}>App Settings</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.settingsItem}
                onPress={() => handleFeature('Help & Support')}
              >
                <HelpCircle size={20} color="#666" />
                <Text style={styles.settingsText}>Help & Support</Text>
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
});