import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Save, Heart, Sparkles } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCouple } from '@/hooks/useCouple';
import { doc, setDoc, getDoc, serverTimestamp, updateDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { getTodaysPrompt } from '@/services/prompts';

export default function ParagraphScreen() {
  const router = useRouter();
  const { date } = useLocalSearchParams();
  const { coupleData } = useCouple();
  const [content, setContent] = useState('');
  const [prompt, setPrompt] = useState('');
  const [mood, setMood] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [partnerNickname, setPartnerNickname] = useState<string>('your partner');
  const [partnerParagraph, setPartnerParagraph] = useState<any>(null);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  const targetDate = date ? date as string : new Date().toISOString().split('T')[0];
  const isToday = targetDate === new Date().toISOString().split('T')[0];

  const moods = [
    { emoji: '😊', label: 'Happy' },
    { emoji: '💕', label: 'Romantic' },
    { emoji: '🙏', label: 'Grateful' },
    { emoji: '🤔', label: 'Reflective' },
    { emoji: '🥺', label: 'Nostalgic' },
    { emoji: '💭', label: 'Thoughtful' },
  ];

  useEffect(() => {
    if (!coupleData) return;
    loadParagraph();
    let unsubscribePartner: (() => void) | undefined;

    loadPartnerParagraph().then(unsub => {
      if (unsub && typeof unsub === 'function') {
        unsubscribePartner = unsub;
      }
    });

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
      if (unsubscribePartner) {
        unsubscribePartner();
      }
    };
  }, [targetDate, coupleData?.coupleCode, coupleData?.nickname]);

  const loadParagraph = async () => {
    if (!coupleData) return;

    try {
      const paragraphsRef = collection(db, 'dailyParagraphs');
      const paragraphQuery = query(
        paragraphsRef,
        where('coupleCode', '==', coupleData.coupleCode),
        where('nickname', '==', coupleData.nickname),
        where('date', '==', targetDate)
      );
      const paragraphSnapshot = await getDocs(paragraphQuery);

      const resolvePrompt = async () => {
        const coupleRef = doc(db, 'couples', coupleData.coupleCode);
        const coupleDoc = await getDoc(coupleRef);
        let partnerNickname = '';
        if (coupleDoc.exists()) {
          const users = coupleDoc.data().users || {};
          partnerNickname = Object.keys(users).find(name => name !== coupleData.nickname) || '';
        }
        const generated = await getTodaysPrompt({
          nickname: coupleData.nickname,
          partnerNickname,
          coupleCode: coupleData.coupleCode,
        });
        const cleaned = generated?.trim();
        if (!cleaned) {
          throw new Error('Prompt generation returned empty');
        }
        return cleaned;
      };

      if (!paragraphSnapshot.empty) {
        const data = paragraphSnapshot.docs[0].data();
        const existingDocId = paragraphSnapshot.docs[0].id;
        setContent(data.content || '');
        const existingPrompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
        if (existingPrompt) {
          setPrompt(existingPrompt);
        } else {
          const repairedPrompt = await resolvePrompt();
          setPrompt(repairedPrompt);
          await updateDoc(doc(db, 'dailyParagraphs', existingDocId), {
            prompt: repairedPrompt,
          });
        }
        setMood(data.mood || '');
        setIsEditing(true);
      } else {
        setIsLoadingPrompt(true);
        const generatedPrompt = await resolvePrompt();
        setPrompt(generatedPrompt);
        setIsLoadingPrompt(false);
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error loading paragraph:', error);
      setPrompt('');
      Alert.alert('Prompt unavailable', 'Could not load today\'s prompt. Please try again.');
      setIsLoadingPrompt(false);
    }
  };

  const loadPartnerParagraph = async () => {
    if (!coupleData) return;

    try {
      const coupleRef = doc(db, 'couples', coupleData.coupleCode);
      const coupleDoc = await getDoc(coupleRef);
      
      if (coupleDoc.exists()) {
        const users = coupleDoc.data().users || {};
        const partnerNicknameFound = Object.keys(users).find(name => name !== coupleData.nickname);
        if (partnerNicknameFound) {
          setPartnerNickname(partnerNicknameFound);
        }
      }

      const paragraphsRef = collection(db, 'dailyParagraphs');
      const partnerQuery = query(
        paragraphsRef,
        where('coupleCode', '==', coupleData.coupleCode),
        where('date', '==', targetDate)
      );

      return onSnapshot(partnerQuery, (snapshot) => {
        const partnerDoc = snapshot.docs.find(d => d.data().nickname !== coupleData.nickname);
        if (partnerDoc) {
          const data = partnerDoc.data();
          if (data.nickname) {
            setPartnerNickname(data.nickname);
          }
          setPartnerParagraph({
            id: partnerDoc.id,
            ...data
          });
        } else {
          setPartnerParagraph(null);
        }
      });
    } catch (error) {
      console.error('Error loading partner paragraph:', error);
    }
  };

  const saveParagraph = async () => {
    if (!content.trim() || !coupleData) {
      Alert.alert('Empty Content', 'Please write something before saving');
      return;
    }

    if (!mood) {
      Alert.alert('Select Mood', 'Please select how you\'re feeling');
      return;
    }

    setIsSaving(true);

    try {
      const paragraphRef = doc(db, 'dailyParagraphs', `${coupleData.coupleCode}_${targetDate}_${coupleData.nickname}`);
      const wordCount = content.trim().split(/\s+/).length;

      const paragraphData = {
        content: content.trim(),
        prompt,
        mood,
        wordCount,
        coupleCode: coupleData.coupleCode,
        nickname: coupleData.nickname,
        date: targetDate,
        timestamp: serverTimestamp(),
      };

      if (isEditing) {
        await updateDoc(paragraphRef, paragraphData);
      } else {
        await setDoc(paragraphRef, paragraphData);
        
        // Update paragraph streak
        const streakRef = doc(db, 'streaks', coupleData.coupleCode);
        const streakDoc = await getDoc(streakRef);
        
        if (streakDoc.exists()) {
          const streakData = streakDoc.data();
          const today = new Date().toDateString();
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          
          let newParagraphStreak = 1;
          if (streakData.lastParagraphDate === yesterday.toDateString()) {
            newParagraphStreak = (streakData.paragraphStreak || 0) + 1;
          }
          
          const longestParagraphStreak = Math.max(
            streakData.longestParagraphStreak || 0, 
            newParagraphStreak
          );

          await updateDoc(streakRef, {
            paragraphStreak: newParagraphStreak,
            lastParagraphDate: today,
            longestParagraphStreak,
          });
        }

        // Send notification to partner
        try {
          const { notifyDailyParagraph } = await import('@/services/notifications');
          await notifyDailyParagraph(coupleData.coupleCode, partnerNickname);
        } catch (error) {
          console.log('Notification error:', error);
        }
      }

      setIsEditing(true);

      Alert.alert('Saved!', 'Your paragraph has been saved 💕', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      console.error('Error saving paragraph:', error);
      Alert.alert('Error', 'Failed to save paragraph');
    } finally {
      setIsSaving(false);
    }
  };

  const getWordCount = () => {
    return content.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

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
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isToday ? 'Today\'s Writing' : `Writing for ${new Date(targetDate).toLocaleDateString()}`}
          </Text>
          <View style={styles.headerSpacer} />
        </Animated.View>

        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
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
                <Sparkles size={20} color="#6c5ce7" />
                <Text style={styles.promptTitle}>AI Writing Prompt</Text>
              </View>
              {isLoadingPrompt ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Generating your personalized prompt...</Text>
                </View>
              ) : (
                <Text style={styles.promptText}>{prompt}</Text>
              )}
            </Animated.View>

            <Animated.View 
              style={[
                styles.moodSection,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <Text style={styles.sectionTitle}>How are you feeling?</Text>
              <View style={styles.moodGrid}>
                {moods.map((moodOption) => (
                  <TouchableOpacity
                    key={moodOption.label}
                    style={[
                      styles.moodButton,
                      mood === moodOption.label && styles.selectedMood
                    ]}
                    onPress={() => setMood(moodOption.label)}
                  >
                    <Text style={styles.moodEmoji}>{moodOption.emoji}</Text>
                    <Text style={[
                      styles.moodLabel,
                      mood === moodOption.label && styles.selectedMoodLabel
                    ]}>
                      {moodOption.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>

            <Animated.View 
              style={[
                styles.writingSection,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.writingHeader}>
                <Text style={styles.sectionTitle}>Your Writing</Text>
                <Text style={styles.wordCount}>{getWordCount()} words</Text>
              </View>
              <View style={styles.textInputContainer}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Pour your heart out here..."
                  placeholderTextColor="#a0a0a0"
                  value={content}
                  onChangeText={setContent}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </Animated.View>

            <Animated.View 
              style={[
                styles.partnerSection,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.partnerHeader}>
                <Heart size={20} color="#fd79a8" />
                <Text style={styles.partnerTitle}>{partnerNickname}'s Writing</Text>
              </View>
              
              {isEditing || !isToday ? (
                partnerParagraph ? (
                  <View style={styles.partnerCard}>
                    <Text style={styles.partnerMood}>
                      {partnerParagraph.mood === 'Happy' ? '😊' : 
                       partnerParagraph.mood === 'Romantic' ? '💕' : 
                       partnerParagraph.mood === 'Grateful' ? '🙏' : 
                       partnerParagraph.mood === 'Reflective' ? '🤔' : 
                       partnerParagraph.mood === 'Nostalgic' ? '🥺' : '💭'} {partnerParagraph.mood}
                    </Text>
                    <Text style={styles.partnerContent}>{partnerParagraph.content}</Text>
                    <Text style={styles.partnerMeta}>
                      {partnerParagraph.wordCount || 0} words
                    </Text>
                  </View>
                ) : (
                  <View style={styles.partnerCardWaiting}>
                    <Text style={styles.partnerContentWaiting}>Waiting for {partnerNickname} to share...</Text>
                  </View>
                )
              ) : (
                <View style={styles.partnerCardWaiting}>
                  <Text style={styles.partnerContentWaitingLocked}>Share your writing to unlock {partnerNickname}'s!</Text>
                </View>
              )}
            </Animated.View>
          </ScrollView>

          <Animated.View 
            style={[
              styles.saveSection,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.saveButton, (!content.trim() || !mood || isSaving) && styles.saveButtonDisabled]}
              onPress={saveParagraph}
              disabled={!content.trim() || !mood || isSaving}
            >
              <LinearGradient
                colors={['#6c5ce7', '#a29bfe']}
                style={styles.saveButtonGradient}
              >
                <Save size={18} color="#ffffff" />
                <Text style={styles.saveButtonText}>
                  {isSaving ? 'Saving...' : isEditing ? 'Update' : 'Save'} 💕
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
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
    padding: 20,
    paddingBottom: 10,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'Playfair-Bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  promptCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  promptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  promptTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#6c5ce7',
    marginLeft: 8,
  },
  loadingContainer: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
    fontStyle: 'italic',
  },
  promptText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: '#333',
    lineHeight: 22,
  },
  moodSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginBottom: 12,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  moodButton: {
    width: '30%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedMood: {
    borderColor: '#6c5ce7',
    backgroundColor: '#f8f7ff',
  },
  moodEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  moodLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#666',
  },
  selectedMoodLabel: {
    color: '#6c5ce7',
  },
  writingSection: {
    marginBottom: 20,
  },
  writingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  wordCount: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
  },
  textInputContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    minHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#333',
    lineHeight: 24,
  },
  partnerSection: {
    marginBottom: 20,
  },
  partnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  partnerTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#fd79a8',
    marginLeft: 8,
  },
  partnerCard: {
    backgroundColor: '#fff5f8',
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#fd79a8',
  },
  partnerMood: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#666',
    marginBottom: 8,
  },
  partnerContent: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },
  partnerMeta: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#999',
  },
  partnerCardWaiting: {
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  partnerContentWaiting: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#999',
    fontStyle: 'italic',
  },
  partnerContentWaitingLocked: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#fd79a8',
  },
  saveSection: {
    padding: 20,
    paddingTop: 10,
  },
  saveButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#6c5ce7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
    marginLeft: 8,
  },
});