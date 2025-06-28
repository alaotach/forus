import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Flame, PenTool, MessageCircle, Users, Calendar, Heart, Sparkles } from 'lucide-react-native';
import { useCouple } from '@/hooks/useCouple';
import { useRouter } from 'expo-router';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { getTodaysPrompt } from '@/services/prompts';

const { width } = Dimensions.get('window');

interface StreakData {
  appStreak: number;
  paragraphStreak: number;
  lastAppOpen: string;
  lastParagraphDate: string;
  longestAppStreak: number;
  longestParagraphStreak: number;
}

export default function HomeScreen() {
  const { coupleData, isConnected, isLoading } = useCouple();
  const router = useRouter();
  const mounted = useRef(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  
  const [streakData, setStreakData] = useState<StreakData>({
    appStreak: 0,
    paragraphStreak: 0,
    lastAppOpen: '',
    lastParagraphDate: '',
    longestAppStreak: 0,
    longestParagraphStreak: 0,
  });
  const [todaysParagraph, setTodaysParagraph] = useState<any>(null);
  const [dailyPrompt, setDailyPrompt] = useState('');
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);

  useEffect(() => {
    mounted.current = true;
    
    // Wait for loading to complete
    if (isLoading) {
      return;
    }

    // Check connection status
    console.log('Home screen - isConnected:', isConnected, 'coupleData:', coupleData);
    
    if (!isConnected || !coupleData) {
      console.log('Not connected, redirecting to pairing');
      router.replace('/pairing');
      return;
    }

    updateAppStreak();
    loadTodaysParagraph();

    // Animate in
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

    return () => {
      mounted.current = false;
    };
  }, [isConnected, isLoading, coupleData]);

  const updateAppStreak = async () => {
    if (!coupleData || !mounted.current) return;

    try {
      const today = new Date().toDateString();
      const streakRef = doc(db, 'streaks', coupleData.coupleCode);
      const streakDoc = await getDoc(streakRef);

      if (!mounted.current) return;

      if (streakDoc.exists()) {
        const data = streakDoc.data() as StreakData;
        const lastOpen = data.lastAppOpen;
        
        let newAppStreak = data.appStreak;
        if (lastOpen !== today) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          
          if (lastOpen === yesterday.toDateString()) {
            newAppStreak += 1;
          } else if (lastOpen !== today) {
            newAppStreak = 1;
          }

          const longestAppStreak = Math.max(data.longestAppStreak || 0, newAppStreak);

          await updateDoc(streakRef, {
            appStreak: newAppStreak,
            lastAppOpen: today,
            longestAppStreak,
          });

          if (mounted.current) {
            setStreakData({ ...data, appStreak: newAppStreak, lastAppOpen: today, longestAppStreak });
          }
        } else {
          if (mounted.current) {
            setStreakData(data);
          }
        }
      } else {
        const initialData = {
          appStreak: 1,
          paragraphStreak: 0,
          lastAppOpen: today,
          lastParagraphDate: '',
          longestAppStreak: 1,
          longestParagraphStreak: 0,
        };
        await setDoc(streakRef, initialData);
        if (mounted.current) {
          setStreakData(initialData);
        }
      }
    } catch (error) {
      console.error('Error updating app streak:', error);
    }
  };

  const loadTodaysParagraph = async () => {
    if (!coupleData || !mounted.current) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const paragraphRef = doc(db, 'dailyParagraphs', coupleData.coupleCode, today, coupleData.nickname);
      const paragraphDoc = await getDoc(paragraphRef);

      if (!mounted.current) return;

      if (paragraphDoc.exists()) {
        setTodaysParagraph(paragraphDoc.data());
      } else {
        if (mounted.current) {
          setIsLoadingPrompt(true);
        }
        
        // Get partner nickname for context
        const coupleRef = doc(db, 'couples', coupleData.coupleCode);
        const coupleDoc = await getDoc(coupleRef);
        let partnerNickname = '';
        
        if (coupleDoc.exists()) {
          const users = coupleDoc.data().users || {};
          partnerNickname = Object.keys(users).find(name => name !== coupleData.nickname) || '';
        }

        const prompt = await getTodaysPrompt({
          nickname: coupleData.nickname,
          partnerNickname,
        });
        
        if (mounted.current) {
          setDailyPrompt(prompt);
          setIsLoadingPrompt(false);
        }
      }
    } catch (error) {
      console.error('Error loading paragraph:', error);
      if (mounted.current) {
        setIsLoadingPrompt(false);
      }
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Show loading state while checking connection
  if (isLoading) {
    return (
      <LinearGradient colors={['#ff9a9e', '#fecfef', '#fecfef']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Heart size={48} color="#ffffff" />
            <Text style={styles.loadingText}>Loading your love space...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Don't render anything if not connected (will redirect)
  if (!isConnected || !coupleData) {
    return null;
  }

  return (
    <LinearGradient colors={['#ff9a9e', '#fecfef', '#fecfef']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <Animated.View 
            style={[
              styles.header,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Text style={styles.greeting}>{getGreeting()}, {coupleData?.nickname}! 💕</Text>
            <Text style={styles.subtitle}>Ready to connect with your love?</Text>
          </Animated.View>

          <Animated.View 
            style={[
              styles.streakCard,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <LinearGradient
              colors={['#ff6b9d', '#c44569']}
              style={styles.streakGradient}
            >
              <View style={styles.streakContent}>
                <Flame size={36} color="#ffffff" />
                <View style={styles.streakInfo}>
                  <Text style={styles.streakNumber}>{streakData.appStreak}</Text>
                  <Text style={styles.streakLabel}>Day Streak</Text>
                </View>
                <View style={styles.streakStats}>
                  <Text style={styles.streakStat}>Best: {streakData.longestAppStreak}</Text>
                  <Text style={styles.streakStat}>Writing: {streakData.paragraphStreak}</Text>
                </View>
              </View>
              <Text style={styles.streakSubtext}>Keep the love alive daily! 🔥</Text>
            </LinearGradient>
          </Animated.View>

          <Animated.View 
            style={[
              styles.actionsContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <TouchableOpacity 
              style={styles.actionCard} 
              onPress={() => router.push('/paragraph')}
            >
              <LinearGradient
                colors={['#a29bfe', '#6c5ce7']}
                style={styles.actionGradient}
              >
                <PenTool size={28} color="#ffffff" />
                <Text style={styles.actionTitle}>Daily Paragraph</Text>
                <Text style={styles.actionSubtitle}>
                  {todaysParagraph ? 'View today\'s writing' : 'Write your heart out'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionCard}
              onPress={() => router.push('/chat')}
            >
              <LinearGradient
                colors={['#00b894', '#00a085']}
                style={styles.actionGradient}
              >
                <MessageCircle size={28} color="#ffffff" />
                <Text style={styles.actionTitle}>Chat</Text>
                <Text style={styles.actionSubtitle}>Send love messages</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {!todaysParagraph && dailyPrompt && (
            <Animated.View 
              style={[
                styles.promptCard,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.promptHeader}>
                <Sparkles size={20} color="#ff6b9d" />
                <Text style={styles.promptTitle}>Today's AI Writing Prompt 💭</Text>
              </View>
              {isLoadingPrompt ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Generating your personalized prompt...</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.promptText}>{dailyPrompt}</Text>
                  <TouchableOpacity 
                    style={styles.writeButton}
                    onPress={() => router.push('/paragraph')}
                  >
                    <Text style={styles.writeButtonText}>Start Writing</Text>
                  </TouchableOpacity>
                </>
              )}
            </Animated.View>
          )}

          <Animated.View 
            style={[
              styles.quickActions,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <TouchableOpacity 
              style={styles.quickAction}
              onPress={() => router.push('/vault')}
            >
              <LinearGradient
                colors={['#fd79a8', '#fdcb6e']}
                style={styles.quickActionGradient}
              >
                <Text style={styles.quickActionEmoji}>💝</Text>
                <Text style={styles.quickActionText}>Vault</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.quickAction}
              onPress={() => router.push('/echo')}
            >
              <LinearGradient
                colors={['#74b9ff', '#0984e3']}
                style={styles.quickActionGradient}
              >
                <Text style={styles.quickActionEmoji}>🤖</Text>
                <Text style={styles.quickActionText}>Echo AI</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.quickAction}
              onPress={() => router.push('/deep-talk')}
            >
              <LinearGradient
                colors={['#e17055', '#d63031']}
                style={styles.quickActionGradient}
              >
                <Text style={styles.quickActionEmoji}>💭</Text>
                <Text style={styles.quickActionText}>Deep Talk</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.bottomSpacing} />
        </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    marginTop: 16,
    opacity: 0.9,
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 28,
    fontFamily: 'Playfair-Bold',
    color: '#ffffff',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    opacity: 0.9,
  },
  streakCard: {
    marginBottom: 24,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  streakGradient: {
    padding: 24,
  },
  streakContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  streakInfo: {
    marginLeft: 16,
    flex: 1,
  },
  streakNumber: {
    fontSize: 36,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
  },
  streakLabel: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    opacity: 0.9,
  },
  streakStats: {
    alignItems: 'flex-end',
  },
  streakStat: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
    opacity: 0.8,
  },
  streakSubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    opacity: 0.8,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    marginHorizontal: 6,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  actionGradient: {
    padding: 20,
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
    marginTop: 12,
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    opacity: 0.9,
    textAlign: 'center',
  },
  promptCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  promptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  promptTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#ff6b9d',
    marginLeft: 8,
  },
  promptText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#333',
    lineHeight: 24,
    marginBottom: 16,
  },
  writeButton: {
    backgroundColor: '#ff6b9d',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'flex-start',
  },
  writeButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  quickAction: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  quickActionGradient: {
    alignItems: 'center',
    padding: 16,
  },
  quickActionEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  quickActionText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  bottomSpacing: {
    height: 100,
  },
});