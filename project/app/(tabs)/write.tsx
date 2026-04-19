import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PenTool, Calendar, Heart, Sparkles, BookOpen } from 'lucide-react-native';
import { useCouple } from '@/hooks/useCouple';
import { useRouter } from 'expo-router';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { DailyParagraph } from '@/types/app';
import { getTodaysPrompt } from '@/services/prompts';

const { width } = Dimensions.get('window');

export default function WriteScreen() {
  const { coupleData, isConnected, isLoading } = useCouple();
  const router = useRouter();
  const [recentParagraphs, setRecentParagraphs] = useState<DailyParagraph[]>([]);
  const [todaysParagraph, setTodaysParagraph] = useState<DailyParagraph | null>(null);
  const [todaysPrompt, setTodaysPrompt] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // Wait for loading to complete
    if (isLoading) {
      return;
    }

    if (!isConnected) {
      router.replace('/(auth)/auth');
      return;
    }

    const unsubRecent = loadRecentParagraphs();
    const unsubTodayPromise = checkTodaysParagraph();

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
      if (unsubRecent) unsubRecent();
      if (unsubTodayPromise && typeof unsubTodayPromise.then === 'function') {
        unsubTodayPromise.then((unsub: (() => void) | undefined) => {
          if (unsub) unsub();
        });
      }
    };
  }, [isConnected, isLoading]);

  const loadRecentParagraphs = () => {
    if (!coupleData) return;

    const paragraphsRef = collection(db, 'dailyParagraphs');
    const q = query(paragraphsRef, where('coupleCode', '==', coupleData.coupleCode), orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const paragraphs: DailyParagraph[] = [];
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.nickname === coupleData.nickname && data.coupleCode === coupleData.coupleCode) {
          paragraphs.push({
            id: doc.id,
            ...data
          } as DailyParagraph);
        }
      });
      
      setRecentParagraphs(paragraphs.slice(0, 10));
    });

    return () => unsubscribe();
  };

  const checkTodaysParagraph = async () => {
    if (!coupleData) return;

    const today = new Date().toISOString().split('T')[0];
    const todayRef = collection(db, 'dailyParagraphs');
    const q = query(
      todayRef, 
      where('coupleCode', '==', coupleData.coupleCode),
      where('nickname', '==', coupleData.nickname),
      where('date', '==', today)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        setTodaysParagraph({
          id: doc.id,
          ...doc.data()
        } as DailyParagraph);
        setTodaysPrompt('');
      } else {
        setTodaysParagraph(null);
        try {
          const prompt = await getTodaysPrompt({
            nickname: coupleData.nickname,
            coupleCode: coupleData.coupleCode
          });
          const cleaned = prompt?.trim() || '';
          setTodaysPrompt(cleaned);
        } catch (error) {
          console.error('Error loading prompt:', error);
          setTodaysPrompt('');
        }
      }
    });

    return () => unsubscribe();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).length;
  };

  if (isLoading || !isConnected) {
    return null;
  }

  return (
    <LinearGradient colors={['#a29bfe', '#6c5ce7']} style={styles.container}>
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
          <PenTool size={24} color="#ffffff" />
          <Text style={styles.headerTitle}>Daily Writing 📝</Text>
        </Animated.View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Today's Writing Section */}
          <Animated.View 
            style={[
              styles.todaySection,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {todaysParagraph ? (
              <View style={styles.completedCard}>
                <LinearGradient
                  colors={['#00b894', '#00a085']}
                  style={styles.completedGradient}
                >
                  <View style={styles.completedHeader}>
                    <Heart size={24} color="#ffffff" />
                    <Text style={styles.completedTitle}>Today's Writing Complete!</Text>
                  </View>
                  <Text style={styles.completedSubtitle}>
                    {getWordCount(todaysParagraph.content)} words • {todaysParagraph.mood || 'Reflective'}
                  </Text>
                  <TouchableOpacity 
                    style={styles.viewButton}
                    onPress={() => router.push('/paragraph')}
                  >
                    <Text style={styles.viewButtonText}>View & Edit</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            ) : (
              <View style={styles.promptCard}>
                <View style={styles.promptHeader}>
                  <Sparkles size={20} color="#6c5ce7" />
                  <Text style={styles.promptTitle}>Today's Prompt</Text>
                </View>
                <Text style={styles.promptText}>{todaysPrompt}</Text>
                <TouchableOpacity 
                  style={styles.writeButton}
                  onPress={() => router.push('/paragraph')}
                >
                  <LinearGradient
                    colors={['#6c5ce7', '#a29bfe']}
                    style={styles.writeButtonGradient}
                  >
                    <PenTool size={18} color="#ffffff" />
                    <Text style={styles.writeButtonText}>Start Writing</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>

          {/* Shared Diary Section */}
          <Animated.View 
            style={[
              styles.sharedDiarySection,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <TouchableOpacity 
              style={styles.sharedDiaryCard}
              onPress={() => router.push('/shared-diary')}
            >
              <LinearGradient
                colors={['#ff9a9e', '#fecfef']}
                style={styles.sharedDiaryGradient}
              >
                <View style={styles.sharedDiaryHeader}>
                  <Heart size={20} color="#ffffff" />
                  <Text style={styles.sharedDiaryTitle}>Shared Diary</Text>
                </View>
                <Text style={styles.sharedDiarySubtitle}>
                  Create memories together with photos, voice & text
                </Text>
                <View style={styles.sharedDiaryFeatures}>
                  <Text style={styles.featureText}>📝 Text</Text>
                  <Text style={styles.featureText}>📸 Photos</Text>
                  <Text style={styles.featureText}>🎤 Voice</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Writing Stats */}
          <Animated.View 
            style={[
              styles.statsContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{recentParagraphs.length}</Text>
              <Text style={styles.statLabel}>Total Entries</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {recentParagraphs.reduce((total, p) => total + (p.wordCount || 0), 0)}
              </Text>
              <Text style={styles.statLabel}>Total Words</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {recentParagraphs.length > 0 ? 
                  Math.round(recentParagraphs.reduce((total, p) => total + (p.wordCount || 0), 0) / recentParagraphs.length) : 0}
              </Text>
              <Text style={styles.statLabel}>Avg Words</Text>
            </View>
          </Animated.View>

          {/* Recent Writings */}
          <Animated.View 
            style={[
              styles.recentSection,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <BookOpen size={20} color="#333" />
              <Text style={styles.sectionTitle}>Recent Writings</Text>
            </View>

            {recentParagraphs.length === 0 ? (
              <View style={styles.emptyState}>
                <PenTool size={48} color="#6c5ce7" />
                <Text style={styles.emptyStateTitle}>No writings yet</Text>
                <Text style={styles.emptyStateText}>
                  Start your daily writing journey and create beautiful memories together
                </Text>
              </View>
            ) : (
              recentParagraphs.map((paragraph, index) => (
                <Animated.View 
                  key={paragraph.id} 
                  style={[
                    styles.paragraphCard,
                    {
                      opacity: fadeAnim,
                      transform: [{
                        translateY: slideAnim.interpolate({
                          inputRange: [0, 50],
                          outputRange: [0, 50 + index * 10],
                        }),
                      }],
                    },
                  ]}
                >
                  <View style={styles.paragraphHeader}>
                    <View>
                      <Text style={styles.paragraphDate}>{formatDate(paragraph.date)}</Text>
                      <Text style={styles.paragraphMeta}>
                        {paragraph.wordCount || getWordCount(paragraph.content)} words
                        {paragraph.mood && ` • ${paragraph.mood}`}
                      </Text>
                    </View>
                    <View style={styles.moodIndicator}>
                      <Text style={styles.moodEmoji}>
                        {paragraph.mood === 'Happy' ? '😊' : 
                         paragraph.mood === 'Romantic' ? '💕' : 
                         paragraph.mood === 'Grateful' ? '🙏' : 
                         paragraph.mood === 'Reflective' ? '🤔' : '💭'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.paragraphPreview} numberOfLines={3}>
                    {paragraph.content}
                  </Text>
                  <TouchableOpacity 
                    style={styles.readMoreButton}
                    onPress={() => router.push(`/paragraph?date=${paragraph.date}`)}
                  >
                    <Text style={styles.readMoreText}>Read More</Text>
                  </TouchableOpacity>
                </Animated.View>
              ))
            )}
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
    paddingBottom: 100,
  },
  todaySection: {
    marginBottom: 24,
  },
  completedCard: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  completedGradient: {
    padding: 24,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  completedTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
    marginLeft: 8,
  },
  completedSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    opacity: 0.9,
    marginBottom: 16,
  },
  viewButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignSelf: 'flex-start',
  },
  viewButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  promptCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
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
    color: '#6c5ce7',
    marginLeft: 8,
  },
  promptText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#333',
    lineHeight: 24,
    marginBottom: 20,
  },
  writeButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#6c5ce7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  writeButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  writeButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginLeft: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statNumber: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#6c5ce7',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textAlign: 'center',
  },
  recentSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  paragraphCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  paragraphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  paragraphDate: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    marginBottom: 2,
  },
  paragraphMeta: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#666',
  },
  moodIndicator: {
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodEmoji: {
    fontSize: 18,
  },
  paragraphPreview: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#555',
    lineHeight: 20,
    marginBottom: 12,
  },
  readMoreButton: {
    alignSelf: 'flex-start',
  },
  readMoreText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#6c5ce7',
  },
  bottomSpacing: {
    height: 100,
  },
  sharedDiarySection: {
    marginBottom: 24,
  },
  sharedDiaryCard: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  sharedDiaryGradient: {
    padding: 20,
  },
  sharedDiaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sharedDiaryTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
    marginLeft: 8,
  },
  sharedDiarySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    opacity: 0.9,
    marginBottom: 12,
  },
  sharedDiaryFeatures: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  featureText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
});