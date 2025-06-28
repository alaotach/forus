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
import { ArrowLeft, Heart, Sparkles, Lock, Clock as Unlock } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCouple } from '@/hooks/useCouple';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { getTodaysDeepQuestion } from '@/services/prompts';
import { DeepTalk } from '@/types/app';

export default function DeepTalkScreen() {
  const router = useRouter();
  const { coupleData } = useCouple();
  const [todaysQuestion, setTodaysQuestion] = useState('');
  const [myAnswer, setMyAnswer] = useState('');
  const [deepTalk, setDeepTalk] = useState<DeepTalk | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [partnerNickname, setPartnerNickname] = useState('');
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    loadTodaysDeepTalk();
    getPartnerNickname();

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
  }, []);

  const getPartnerNickname = async () => {
    if (!coupleData) return;

    try {
      const coupleRef = doc(db, 'couples', coupleData.coupleCode);
      const coupleDoc = await getDoc(coupleRef);
      
      if (coupleDoc.exists()) {
        const users = coupleDoc.data().users || {};
        const partner = Object.keys(users).find(name => name !== coupleData.nickname);
        if (partner) {
          setPartnerNickname(partner);
        }
      }
    } catch (error) {
      console.error('Error getting partner nickname:', error);
    }
  };

  const loadTodaysDeepTalk = async () => {
    if (!coupleData) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const deepTalkRef = doc(db, 'deepTalks', coupleData.coupleCode, today);
      const deepTalkDoc = await getDoc(deepTalkRef);

      if (deepTalkDoc.exists()) {
        const data = deepTalkDoc.data() as DeepTalk;
        setDeepTalk(data);
        setTodaysQuestion(data.question);
        
        if (data.responses[coupleData.nickname]) {
          setMyAnswer(data.responses[coupleData.nickname].answer);
        }
      } else {
        setIsLoadingQuestion(true);
        // Get partner nickname for context
        const coupleRef = doc(db, 'couples', coupleData.coupleCode);
        const coupleDoc = await getDoc(coupleRef);
        let partnerNickname = '';
        
        if (coupleDoc.exists()) {
          const users = coupleDoc.data().users || {};
          partnerNickname = Object.keys(users).find(name => name !== coupleData.nickname) || '';
        }

        const question = await getTodaysDeepQuestion({
          nickname: coupleData.nickname,
          partnerNickname,
        });
        setTodaysQuestion(question);
        setIsLoadingQuestion(false);
        
        // Create new deep talk entry
        const newDeepTalk: DeepTalk = {
          id: today,
          date: today,
          question,
          responses: {},
          unlocked: false,
        };
        
        await setDoc(deepTalkRef, newDeepTalk);
        setDeepTalk(newDeepTalk);
      }
    } catch (error) {
      console.error('Error loading deep talk:', error);
      setIsLoadingQuestion(false);
    }
  };

  const saveAnswer = async () => {
    if (!myAnswer.trim() || !coupleData || !deepTalk) {
      Alert.alert('Empty Answer', 'Please write your answer before saving');
      return;
    }

    setIsSaving(true);

    try {
      const today = new Date().toISOString().split('T')[0];
      const deepTalkRef = doc(db, 'deepTalks', coupleData.coupleCode, today);

      const updatedResponses = {
        ...deepTalk.responses,
        [coupleData.nickname]: {
          answer: myAnswer.trim(),
          timestamp: serverTimestamp(),
        }
      };

      // Check if both partners have answered
      const bothAnswered = Object.keys(updatedResponses).length === 2;

      await updateDoc(deepTalkRef, {
        responses: updatedResponses,
        unlocked: bothAnswered,
      });

      setDeepTalk(prev => prev ? {
        ...prev,
        responses: updatedResponses,
        unlocked: bothAnswered,
      } : null);

      if (bothAnswered) {
        Alert.alert(
          'Unlocked! 🔓',
          'Both of you have answered! You can now see each other\'s responses.',
          [{ text: 'View Responses', onPress: () => {} }]
        );
      } else {
        Alert.alert(
          'Saved! 💕',
          'Your answer has been saved. You\'ll see your partner\'s response once they answer too.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error saving answer:', error);
      Alert.alert('Error', 'Failed to save your answer');
    } finally {
      setIsSaving(false);
    }
  };

  const hasAnswered = deepTalk?.responses[coupleData?.nickname || ''];
  const partnerHasAnswered = deepTalk?.responses[partnerNickname];
  const isUnlocked = deepTalk?.unlocked;

  return (
    <LinearGradient colors={['#e17055', '#d63031']} style={styles.container}>
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
          <Text style={styles.headerTitle}>Deep Questions 💭</Text>
          <View style={styles.headerSpacer} />
        </Animated.View>

        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            <Animated.View 
              style={[
                styles.questionCard,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.questionHeader}>
                <Sparkles size={24} color="#e17055" />
                <Text style={styles.questionTitle}>Today's AI Deep Question</Text>
              </View>
              {isLoadingQuestion ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Generating your personalized question...</Text>
                </View>
              ) : (
                <Text style={styles.questionText}>{todaysQuestion}</Text>
              )}
            </Animated.View>

            <Animated.View 
              style={[
                styles.statusCard,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.statusRow}>
                <View style={styles.statusItem}>
                  <Text style={styles.statusLabel}>You</Text>
                  <View style={[styles.statusIndicator, hasAnswered && styles.statusComplete]}>
                    {hasAnswered ? (
                      <Heart size={16} color="#ffffff" />
                    ) : (
                      <View style={styles.statusEmpty} />
                    )}
                  </View>
                </View>
                
                <View style={styles.statusItem}>
                  <Text style={styles.statusLabel}>{partnerNickname || 'Partner'}</Text>
                  <View style={[styles.statusIndicator, partnerHasAnswered && styles.statusComplete]}>
                    {partnerHasAnswered ? (
                      <Heart size={16} color="#ffffff" />
                    ) : (
                      <View style={styles.statusEmpty} />
                    )}
                  </View>
                </View>
              </View>
              
              <View style={styles.unlockStatus}>
                {isUnlocked ? (
                  <>
                    <Unlock size={20} color="#00b894" />
                    <Text style={styles.unlockedText}>Responses Unlocked! 🔓</Text>
                  </>
                ) : (
                  <>
                    <Lock size={20} color="#666" />
                    <Text style={styles.lockedText}>
                      {hasAnswered ? 'Waiting for your partner...' : 'Both must answer to unlock'}
                    </Text>
                  </>
                )}
              </View>
            </Animated.View>

            <Animated.View 
              style={[
                styles.answerSection,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <Text style={styles.sectionTitle}>Your Answer</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Share your deepest thoughts..."
                  placeholderTextColor="#a0a0a0"
                  value={myAnswer}
                  onChangeText={setMyAnswer}
                  multiline
                  textAlignVertical="top"
                  editable={!hasAnswered}
                />
              </View>
              
              {!hasAnswered && (
                <TouchableOpacity
                  style={[styles.saveButton, (!myAnswer.trim() || isSaving) && styles.saveButtonDisabled]}
                  onPress={saveAnswer}
                  disabled={!myAnswer.trim() || isSaving}
                >
                  <LinearGradient
                    colors={['#d63031', '#e17055']}
                    style={styles.saveButtonGradient}
                  >
                    <Heart size={18} color="#ffffff" />
                    <Text style={styles.saveButtonText}>
                      {isSaving ? 'Saving...' : 'Save Answer'} 💕
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </Animated.View>

            {isUnlocked && partnerHasAnswered && (
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
                  <Text style={styles.partnerTitle}>{partnerNickname}'s Answer</Text>
                </View>
                <View style={styles.partnerCard}>
                  <Text style={styles.partnerAnswer}>
                    {deepTalk?.responses[partnerNickname]?.answer}
                  </Text>
                </View>
              </Animated.View>
            )}

            <Animated.View 
              style={[
                styles.tipsCard,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <Text style={styles.tipsTitle}>💡 Tips for Deep Conversations:</Text>
              <View style={styles.tipsList}>
                <Text style={styles.tipItem}>• Be vulnerable and authentic</Text>
                <Text style={styles.tipItem}>• Listen without judgment</Text>
                <Text style={styles.tipItem}>• Ask follow-up questions</Text>
                <Text style={styles.tipItem}>• Share your own experiences</Text>
                <Text style={styles.tipItem}>• Create a safe space for honesty</Text>
              </View>
            </Animated.View>
          </ScrollView>
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
  questionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  questionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#e17055',
    marginLeft: 12,
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
  questionText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#333',
    lineHeight: 24,
  },
  statusCard: {
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
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statusItem: {
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#666',
    marginBottom: 8,
  },
  statusIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f3f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusComplete: {
    backgroundColor: '#00b894',
  },
  statusEmpty: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ddd',
  },
  unlockStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
  },
  unlockedText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#00b894',
    marginLeft: 8,
  },
  lockedText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
    marginLeft: 8,
  },
  answerSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginBottom: 12,
  },
  inputContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    minHeight: 150,
    marginBottom: 16,
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
  saveButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#e17055',
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
  partnerAnswer: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: '#333',
    lineHeight: 22,
  },
  tipsCard: {
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
  tipsTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginBottom: 12,
  },
  tipsList: {
    marginLeft: 8,
  },
  tipItem: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
    lineHeight: 20,
    marginBottom: 4,
  },
});