import React, { useState, useRef, useEffect } from 'react';
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
import { ArrowLeft, Heart, Send, MessageSquare } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCouple } from '@/hooks/useCouple';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { getRandomConflictPrompt } from '@/services/prompts';

export default function ConflictScreen() {
  const router = useRouter();
  const { coupleData } = useCouple();
  const [currentStep, setCurrentStep] = useState(0);
  const [feeling, setFeeling] = useState('');
  const [wishPartnerKnew, setWishPartnerKnew] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  const steps = [
    {
      title: "What are you feeling?",
      subtitle: "Take a moment to identify your emotions",
      placeholder: "I'm feeling...",
      value: feeling,
      setValue: setFeeling,
    },
    {
      title: "What do you wish your partner knew?",
      subtitle: "Express what's in your heart",
      placeholder: "I wish you knew that...",
      value: wishPartnerKnew,
      setValue: setWishPartnerKnew,
    }
  ];

  const currentStepData = steps[currentStep];

  useEffect(() => {
    loadPrompt();
    
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
  }, [currentStep]);

  const loadPrompt = async () => {
    try {
      const prompt = await getRandomConflictPrompt();
      setCurrentPrompt(prompt);
    } catch (error) {
      console.error('Error loading conflict prompt:', error);
      setCurrentPrompt('Take a deep breath and express your feelings honestly.');
    }
  };

  const handleNext = () => {
    if (!currentStepData.value.trim()) {
      Alert.alert('Please complete this step', 'Your thoughts are important to us');
      return;
    }

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSave();
    }
  };

  const handleSave = async () => {
    if (!coupleData) return;

    setIsSaving(true);

    try {
      const conflictRef = collection(db, 'conflicts', coupleData.coupleCode, 'entries');
      await addDoc(conflictRef, {
        nickname: coupleData.nickname,
        feeling: feeling.trim(),
        wishPartnerKnew: wishPartnerKnew.trim(),
        timestamp: serverTimestamp(),
        resolved: false,
      });

      Alert.alert(
        'Saved 💕',
        'Your feelings have been saved. Would you like to send this as a message to your partner?',
        [
          { text: 'Just Save', onPress: () => router.back() },
          { text: 'Send Message', onPress: sendAsMessage }
        ]
      );
    } catch (error) {
      console.error('Error saving conflict entry:', error);
      Alert.alert('Error', 'Failed to save your thoughts');
    } finally {
      setIsSaving(false);
    }
  };

  const sendAsMessage = async () => {
    if (!coupleData) return;

    try {
      const messagesRef = collection(db, 'couples', coupleData.coupleCode, 'chat');
      const message = `💕 From the Conflict Helper:\n\nI'm feeling: ${feeling}\n\nI wish you knew: ${wishPartnerKnew}`;
      
      await addDoc(messagesRef, {
        sender: coupleData.nickname,
        message,
        timestamp: serverTimestamp(),
        reactions: {},
        type: 'text'
      });

      Alert.alert('Sent! 💕', 'Your message has been sent to your partner', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else {
      router.back();
    }
  };

  return (
    <LinearGradient colors={['#fd79a8', '#e84393']} style={styles.container}>
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
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ArrowLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Conflict Helper 🤝</Text>
          <View style={styles.headerSpacer} />
        </Animated.View>

        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            <Animated.View 
              style={[
                styles.progressContainer,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${((currentStep + 1) / steps.length) * 100}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                Step {currentStep + 1} of {steps.length}
              </Text>
            </Animated.View>

            <Animated.View 
              style={[
                styles.stepCard,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.stepHeader}>
                <MessageSquare size={24} color="#fd79a8" />
                <Text style={styles.stepTitle}>{currentStepData.title}</Text>
              </View>
              <Text style={styles.stepSubtitle}>{currentStepData.subtitle}</Text>
              
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.textInput}
                  placeholder={currentStepData.placeholder}
                  placeholderTextColor="#a0a0a0"
                  value={currentStepData.value}
                  onChangeText={currentStepData.setValue}
                  multiline
                  textAlignVertical="top"
                  autoFocus
                />
              </View>

              <View style={styles.promptContainer}>
                <Text style={styles.promptTitle}>💭 AI guidance:</Text>
                <Text style={styles.promptText}>{currentPrompt}</Text>
              </View>
            </Animated.View>

            <Animated.View 
              style={[
                styles.tipsCard,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <Text style={styles.tipsTitle}>💡 Remember:</Text>
              <View style={styles.tipsList}>
                <Text style={styles.tipItem}>• Use "I" statements instead of "you" statements</Text>
                <Text style={styles.tipItem}>• Focus on feelings, not blame</Text>
                <Text style={styles.tipItem}>• Be honest but gentle</Text>
                <Text style={styles.tipItem}>• Your partner loves you and wants to understand</Text>
              </View>
            </Animated.View>
          </ScrollView>

          <Animated.View 
            style={[
              styles.buttonContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.nextButton,
                (!currentStepData.value.trim() || isSaving) && styles.nextButtonDisabled
              ]}
              onPress={handleNext}
              disabled={!currentStepData.value.trim() || isSaving}
            >
              <LinearGradient
                colors={['#e84393', '#fd79a8']}
                style={styles.nextButtonGradient}
              >
                {currentStep === steps.length - 1 ? (
                  <>
                    <Heart size={18} color="#ffffff" />
                    <Text style={styles.nextButtonText}>
                      {isSaving ? 'Saving...' : 'Save Thoughts'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.nextButtonText}>Next Step</Text>
                    <ArrowLeft size={18} color="#ffffff" style={{ transform: [{ rotate: '180deg' }] }} />
                  </>
                )}
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
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#f1f3f4',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fd79a8',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#666',
    textAlign: 'center',
  },
  stepCard: {
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
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  stepSubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#666',
    marginBottom: 20,
    lineHeight: 22,
  },
  inputContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 16,
    minHeight: 120,
    marginBottom: 20,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#333',
    lineHeight: 24,
  },
  promptContainer: {
    backgroundColor: '#fff5f8',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#fd79a8',
  },
  promptTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#fd79a8',
    marginBottom: 8,
  },
  promptText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
    lineHeight: 20,
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
  buttonContainer: {
    padding: 20,
    paddingTop: 10,
  },
  nextButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#fd79a8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  nextButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
    marginHorizontal: 8,
  },
});