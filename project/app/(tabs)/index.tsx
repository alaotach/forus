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
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { getTodaysPrompt } from '@/services/prompts';
import { checkAndDeleteExpiredFreeItems, checkAndDowngradeExpiredSubscription } from '@/services/subscriptions';

const { width } = Dimensions.get('window');

interface StreakData {
  appStreak: number;
  paragraphStreak: number;
  lastAppOpen: string;
  lastParagraphDate: string;
  longestAppStreak: number;
  longestParagraphStreak: number;
}

const MOOD_OPTIONS = [
  { label: 'Happy', emoji: '😊' },
  { label: 'Romantic', emoji: '💕' },
  { label: 'Grateful', emoji: '🙏' },
  { label: 'Reflective', emoji: '🤔' },
  { label: 'Nostalgic', emoji: '🥺' },
  { label: 'Thoughtful', emoji: '💭' },
];

const getMoodEmoji = (mood: string) => {
  const found = MOOD_OPTIONS.find(option => option.label === mood);
  return found?.emoji || '😐';
};

export default function HomeScreen() {
  const { coupleData, isConnected, isLoading } = useCouple();
  const router = useRouter();
  const mounted = useRef(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  
  // Initialize push notifications
  usePushNotifications();
  
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
  const [notifications, setNotifications] = useState<any[]>([]);
  const [myMood, setMyMood] = useState('Neutral');
  const [partnerMood, setPartnerMood] = useState('Neutral');
  const [partnerNickname, setPartnerNickname] = useState('Partner');
  const [isSavingMood, setIsSavingMood] = useState(false);

  useEffect(() => {
    mounted.current = true;
    
    // Wait for loading to complete
    if (isLoading) {
      return;
    }

    // Check connection status
    console.log('Home screen - isConnected:', isConnected, 'coupleData:', coupleData);
    
    if (!isConnected || !coupleData) {
      console.log('Not connected, redirecting to auth');
      router.replace('/(auth)/auth');
      return;
    }

    updateAppStreak();
    loadTodaysParagraph();
    loadPartnerNickname();
    const unsubscribeMood = subscribeToTodaysMoods();
    
    // Cleanup expired vault items for free plan users
    if (coupleData) {
      checkAndDeleteExpiredFreeItems(coupleData.coupleCode).catch(error => 
        console.error('Error cleaning up expired items:', error)
      );
      
      // Check if subscription expired and downgrade if needed
      checkAndDowngradeExpiredSubscription(coupleData.coupleCode).catch(error =>
        console.error('Error checking subscription expiry:', error)
      );
      
      // Setup real-time notification listener
      setupNotificationListener(coupleData.coupleCode);
    }

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
      if (unsubscribeMood) unsubscribeMood();
      mounted.current = false;
    };
  }, [isConnected, isLoading, coupleData]);

  const loadPartnerNickname = async () => {
    if (!coupleData || !mounted.current) return;
    try {
      const coupleRef = doc(db, 'couples', coupleData.coupleCode);
      const coupleDoc = await getDoc(coupleRef);
      if (!coupleDoc.exists() || !mounted.current) return;
      const users = coupleDoc.data().users || {};
      const partner = Object.keys(users).find(name => name !== coupleData.nickname);
      if (partner) {
        setPartnerNickname(partner);
      }
    } catch (error) {
      console.error('Error loading partner nickname:', error);
    }
  };

  const subscribeToTodaysMoods = () => {
    if (!coupleData || !mounted.current) return;
    const today = new Date().toISOString().split('T')[0];
    const moodRef = collection(db, 'couples', coupleData.coupleCode, 'moodChecks');

    return onSnapshot(moodRef, (snapshot) => {
      if (!mounted.current) return;
      const todaysMoods = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() } as any))
        .filter((item) => item.date === today || item.timestamp?.toDate?.().toISOString?.().split('T')[0] === today);

      const myEntry = todaysMoods.find((item) => item.user === coupleData.nickname);
      const partnerEntry = todaysMoods.find((item) => item.user !== coupleData.nickname);

      setMyMood(myEntry?.mood || 'Neutral');
      setPartnerMood(partnerEntry?.mood || 'Neutral');
      if (partnerEntry?.user) {
        setPartnerNickname(partnerEntry.user);
      }
    });
  };

  const saveMood = async (mood: string) => {
    if (!coupleData || isSavingMood) return;

    const previousMood = myMood;
    const today = new Date().toISOString().split('T')[0];
    const moodId = `${today}_${coupleData.nickname}`;
    setMyMood(mood);

    try {
      setIsSavingMood(true);
      const moodRef = doc(db, 'couples', coupleData.coupleCode, 'moodChecks', moodId);
      await setDoc(moodRef, {
        mood,
        user: coupleData.nickname,
        date: today,
        timestamp: serverTimestamp(),
      });

      // Notify partner if mood changed (skip if same mood re-selected)
      if (mood !== previousMood) {
        const moodEmoji = getMoodEmoji(mood);
        const { notifyMoodChanged } = await import('@/services/notifications');
        notifyMoodChanged(
          coupleData.coupleCode,
          coupleData.nickname,
          mood,
          moodEmoji
        ).catch(err => console.warn('Mood notification failed:', err));
      }
    } catch (error) {
      console.error('Error saving mood:', error);
      setMyMood(previousMood);
    } finally {
      setIsSavingMood(false);
    }
  };

  const updateAppStreak = async () => {
    if (!coupleData || !mounted.current) return;

    try {
      const today = new Date().toDateString();
      const streakRef = doc(db, 'streaks', coupleData.coupleCode);
      const streakDoc = await getDoc(streakRef);

      // Also check couple data to verify both users
      const coupleRef = doc(db, 'couples', coupleData.coupleCode);
      const coupleDoc = await getDoc(coupleRef);

      if (!mounted.current) return;

      // Track today's login for this user
      const userLogins = (coupleDoc.data()?.logins || {}) as { [key: string]: string };
      userLogins[coupleData.nickname] = today;

      // Actually save the login unconditionally so partner's login is recorded
      await setDoc(coupleRef, { logins: userLogins }, { merge: true });

      // Check if both users logged in today. Since a couple has exactly 2 members,
      // we check if we have 2 distinct nicknames logged in today.
      const allUsersLoggedInToday = Object.keys(userLogins).length === 2 &&
        Object.values(userLogins).every(loginDate => loginDate === today);

      if (streakDoc.exists()) {
        const data = streakDoc.data() as StreakData;
        const lastOpen = data.lastAppOpen;

        let newAppStreak = data.appStreak;
        let longestAppStreak = data.longestAppStreak || 0;
        let shouldIncreaseStreak = false;
        let needsDbUpdate = false;
        let newLastAppOpen = lastOpen;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();

        if (lastOpen === today) {
          // Already successfully checked and updated today by both users
          if (mounted.current) {
            setStreakData(data);
          }
        } else {
          // Both users logged in today, time to advance or reset the streak
          if (allUsersLoggedInToday) {
            if (lastOpen === yesterdayStr) {
               newAppStreak += 1;
            } else {
               newAppStreak = 1; // It was broken
            }
            shouldIncreaseStreak = true;
            needsDbUpdate = true;
            newLastAppOpen = today;
          } 
          // Not both logged in today yet. What if it's completely broken from days past?
          else if (lastOpen !== yesterdayStr && lastOpen !== today) {
            if (newAppStreak !== 0) {
               newAppStreak = 0; // Streak is visibly broken
               needsDbUpdate = true;
               // DO NOT set newLastAppOpen to today. 
               // This way when the second person logs in later today, 
               // they will see allUsersLoggedInToday and start the streak at 1.
            }
          }

          if (needsDbUpdate) {
            longestAppStreak = Math.max(longestAppStreak, newAppStreak);
            
            await updateDoc(streakRef, {
              appStreak: newAppStreak,
              lastAppOpen: newLastAppOpen,
              longestAppStreak,
            });

            if (mounted.current) {
              setStreakData({ ...data, appStreak: newAppStreak, lastAppOpen: newLastAppOpen, longestAppStreak });
            }

            // Send streak notification if milestone
            if (shouldIncreaseStreak && newAppStreak > 0 && newAppStreak % 7 === 0) {
              try {
                const { notifyStreakMilestone } = await import('@/services/notifications');
                notifyStreakMilestone(coupleData.coupleCode, newAppStreak, 'app');
              } catch (e) { console.log(e); }
            }
          } else {
            if (mounted.current) {
              setStreakData({ ...data, appStreak: newAppStreak, lastAppOpen: newLastAppOpen });
            }
          }
        }
      } else {
        // Initial setup - only set streak to 1 if both users are here
        const initialStreak = allUsersLoggedInToday ? 1 : 0;
        const initialLastOpen = allUsersLoggedInToday ? today : '';
        const initialData = {
          appStreak: initialStreak,
          paragraphStreak: 0,
          lastAppOpen: initialLastOpen,
          lastParagraphDate: '',
          longestAppStreak: initialStreak,
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
      
      const paragraphsRef = collection(db, 'dailyParagraphs');
      const q = query(
        paragraphsRef,
        where('coupleCode', '==', coupleData.coupleCode),
        where('nickname', '==', coupleData.nickname),
        where('date', '==', today)
      );
      
      const snapshot = await getDocs(q);

      if (!mounted.current) return;

      if (!snapshot.empty) {
        setTodaysParagraph(snapshot.docs[0].data());
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
          coupleCode: coupleData.coupleCode,
        });
        
        if (mounted.current) {
          setDailyPrompt(prompt?.trim() || '');
          setIsLoadingPrompt(false);
        }
      }
    } catch (error) {
      console.error('Error loading paragraph:', error);
      if (mounted.current) {
        setDailyPrompt('');
        setIsLoadingPrompt(false);
      }
    }
  };

  const setupNotificationListener = (coupleCode: string) => {
    try {
      const { subscribeToNotifications } = require('@/services/notifications');
      
      const unsubscribe = subscribeToNotifications(coupleCode, (notification: any) => {
        if (mounted.current && !notification.read) {
          setNotifications(prev => {
            // Check if we already have it
            if (prev.some(n => n.id === notification.id)) return prev;
            return [notification, ...prev];
          });
          
          console.log('New notification:', notification);
        }
      }, coupleData?.nickname);

      // Cleanup listener on unmount
      return unsubscribe;
    } catch (error) {
      console.error('Error setting up notification listener:', error);
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

          <Animated.View
            style={[
              styles.moodCard,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.moodHeader}>
              <Text style={styles.moodTitle}>Daily Mood Check-In</Text>
              <Text style={styles.moodSubtitle}>Set yours and see your partner's vibe</Text>
            </View>
            <View style={styles.moodStatusRow}>
              <View style={styles.moodStatusBox}>
                <Text style={styles.moodStatusLabel}>You</Text>
                <Text style={styles.moodStatusValue}>{getMoodEmoji(myMood)} {myMood}</Text>
              </View>
              <View style={styles.moodStatusBox}>
                <Text style={styles.moodStatusLabel}>{partnerNickname}</Text>
                <Text style={styles.moodStatusValue}>{getMoodEmoji(partnerMood)} {partnerMood}</Text>
              </View>
            </View>
            <View style={styles.moodOptionsRow}>
              {MOOD_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.label}
                  style={[
                    styles.moodOptionChip,
                    myMood === option.label && styles.moodOptionChipSelected,
                  ]}
                  onPress={() => saveMood(option.label)}
                  disabled={isSavingMood}
                >
                  <Text style={styles.moodOptionEmoji}>{option.emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
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
    paddingBottom: 100,
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
  moodCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 18,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  moodHeader: {
    marginBottom: 12,
  },
  moodTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#ff6b9d',
  },
  moodSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#666',
    marginTop: 2,
  },
  moodStatusRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  moodStatusBox: {
    flex: 1,
    backgroundColor: '#fff5fa',
    borderRadius: 12,
    padding: 10,
  },
  moodStatusLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#777',
    marginBottom: 4,
  },
  moodStatusValue: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
  },
  moodOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  moodOptionChip: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  moodOptionChipSelected: {
    backgroundColor: '#ffd9ea',
    borderWidth: 1,
    borderColor: '#ff6b9d',
  },
  moodOptionEmoji: {
    fontSize: 20,
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