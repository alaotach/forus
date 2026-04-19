import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Send, Bot, Heart, Settings } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCouple } from '@/hooks/useCouple';
import { generateEchoResponse, CoupleContext, checkBackendHealth } from '@/services/openai';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, addDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';

interface EchoMessage {
  id: string;
  content: string;
  isEcho: boolean;
  timestamp: Date;
}

interface EchoConfig {
  echoDisplayName: string;
  partnerStyle: string;
  questionFocus: string;
  avoidTopics: string;
}

function safeSnippet(value: unknown, maxLen: number = 180): string {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}...` : cleaned;
}

function toMillis(value: any): number {
  if (value?.toDate && typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

const DEFAULT_ECHO_CONFIG: EchoConfig = {
  echoDisplayName: 'Echo',
  partnerStyle: '',
  questionFocus: '',
  avoidTopics: '',
};

function isEchoConfigComplete(config: EchoConfig): boolean {
  return config.partnerStyle.trim().length > 0 && config.questionFocus.trim().length > 0;
}

const TypingIndicator = () => {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateDot = (dot: Animated.Value) => {
      return Animated.sequence([
        Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true })
      ]);
    };

    Animated.loop(
      Animated.stagger(150, [
        animateDot(dot1),
        animateDot(dot2),
        animateDot(dot3),
      ])
    ).start();
  }, []);

  return (
    <View style={{ flexDirection: 'row', marginLeft: 8, alignItems: 'center' }}>
      <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#74b9ff', marginHorizontal: 2, opacity: dot1 }} />
      <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#74b9ff', marginHorizontal: 2, opacity: dot2 }} />
      <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#74b9ff', marginHorizontal: 2, opacity: dot3 }} />
    </View>
  );
};

export default function EchoScreen() {
  const router = useRouter();
  const { coupleData } = useCouple();
  const [messages, setMessages] = useState<EchoMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isConfigModalVisible, setIsConfigModalVisible] = useState(false);
  const [echoConfig, setEchoConfig] = useState<EchoConfig>(DEFAULT_ECHO_CONFIG);
  const [draftEchoConfig, setDraftEchoConfig] = useState<EchoConfig>(DEFAULT_ECHO_CONFIG);
  const [conversationHistory, setConversationHistory] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [coupleContext, setCoupleContext] = useState<CoupleContext>({
    nickname: coupleData?.nickname || '',
  });
  const flatListRef = useRef<FlatList>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const hasAutoOpenedConfigRef = useRef(false);
  const configIdentityRef = useRef('');

  useEffect(() => {
    if (!coupleData?.coupleCode || !coupleData?.nickname) return;

    const identityKey = `${coupleData.coupleCode}:${coupleData.nickname}`;
    if (configIdentityRef.current !== identityKey) {
      configIdentityRef.current = identityKey;
      hasAutoOpenedConfigRef.current = false;
    }

    loadEchoConfig();
    loadCoupleContext();
    loadEchoMessages();

    // Animate in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [coupleData?.coupleCode, coupleData?.nickname]);

  const loadEchoConfig = async () => {
    if (!coupleData) return;

    try {
      setIsLoadingConfig(true);
      const configRef = doc(db, 'couples', coupleData.coupleCode, 'echoSettings', coupleData.nickname);
      const configSnap = await getDoc(configRef);

      const loadedConfig: EchoConfig = configSnap.exists()
        ? {
            echoDisplayName: String(configSnap.data().echoDisplayName || 'Echo'),
            partnerStyle: String(configSnap.data().partnerStyle || ''),
            questionFocus: String(configSnap.data().questionFocus || ''),
            avoidTopics: String(configSnap.data().avoidTopics || ''),
          }
        : { ...DEFAULT_ECHO_CONFIG };

      setEchoConfig(loadedConfig);
      setDraftEchoConfig(loadedConfig);

      if (!isEchoConfigComplete(loadedConfig) && !hasAutoOpenedConfigRef.current) {
        hasAutoOpenedConfigRef.current = true;
        setIsConfigModalVisible(true);
      }
    } catch (error) {
      console.error('Error loading Echo config:', error);
      const fallbackConfig = { ...DEFAULT_ECHO_CONFIG };
      setEchoConfig(fallbackConfig);
      setDraftEchoConfig(fallbackConfig);
      if (!hasAutoOpenedConfigRef.current) {
        hasAutoOpenedConfigRef.current = true;
        setIsConfigModalVisible(true);
      }
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const saveEchoConfig = async () => {
    if (!coupleData) return;

    const normalizedConfig: EchoConfig = {
      echoDisplayName: draftEchoConfig.echoDisplayName.trim() || 'Echo',
      partnerStyle: draftEchoConfig.partnerStyle.trim(),
      questionFocus: draftEchoConfig.questionFocus.trim(),
      avoidTopics: draftEchoConfig.avoidTopics.trim(),
    };

    if (!isEchoConfigComplete(normalizedConfig)) {
      Alert.alert('More details needed', 'Please fill in partner style and what Echo should ask about.');
      return;
    }

    try {
      setIsSavingConfig(true);
      const configRef = doc(db, 'couples', coupleData.coupleCode, 'echoSettings', coupleData.nickname);
      await setDoc(configRef, {
        ...normalizedConfig,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      hasAutoOpenedConfigRef.current = true;
      setEchoConfig(normalizedConfig);
      setDraftEchoConfig(normalizedConfig);
      setIsConfigModalVisible(false);
    } catch (error) {
      console.error('Error saving Echo config:', error);
      Alert.alert('Error', 'Could not save Echo settings. Please try again.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const loadCoupleContext = async () => {
    if (!coupleData) return;

    try {
      const coupleRef = doc(db, 'couples', coupleData.coupleCode);
      const coupleDoc = await getDoc(coupleRef);
      let partnerNickname = '';

      if (coupleDoc.exists()) {
        const users = coupleDoc.data().users || {};
        partnerNickname = Object.keys(users).find(name => name !== coupleData.nickname) || '';
      }

      const messagesRef = collection(db, 'couples', coupleData.coupleCode, 'chat');
      const messagesQuery = query(messagesRef, orderBy('timestamp', 'desc'), limit(10));
      const messagesSnapshot = await getDocs(messagesQuery);
      const recentMessages = messagesSnapshot.docs
        .map((snapshotDoc) => safeSnippet(snapshotDoc.data().message, 120))
        .filter(Boolean)
        .slice(0, 5);

      const paragraphsRef = collection(db, 'dailyParagraphs');
      const paragraphsQuery = query(
        paragraphsRef,
        where('coupleCode', '==', coupleData.coupleCode),
        where('nickname', '==', coupleData.nickname)
      );
      const paragraphsSnapshot = await getDocs(paragraphsQuery);
      const sortedParagraphDocs = [...paragraphsSnapshot.docs].sort(
        (a, b) => toMillis(b.data().timestamp) - toMillis(a.data().timestamp)
      );

      const recentDailyWritingAnswers = sortedParagraphDocs
        .map((snapshotDoc) => {
          const data = snapshotDoc.data();
          const promptSnippet = safeSnippet(data.prompt, 80);
          const answerSnippet = safeSnippet(data.content, 180);
          if (!answerSnippet) return '';
          return promptSnippet ? `Prompt: ${promptSnippet} | Answer: ${answerSnippet}` : answerSnippet;
        })
        .filter(Boolean)
        .slice(0, 4);

      const deepTalkRef = collection(db, 'deepTalks', coupleData.coupleCode, 'items');
      const deepTalkQuery = query(deepTalkRef, orderBy('date', 'desc'), limit(8));
      const deepTalkSnapshot = await getDocs(deepTalkQuery);
      const recentDeepTalkAnswers = deepTalkSnapshot.docs
        .map((snapshotDoc) => {
          const data = snapshotDoc.data() as any;
          const question = safeSnippet(data?.question, 100);
          const myAnswer = safeSnippet(data?.responses?.[coupleData.nickname]?.answer, 160);
          const partnerAnswer = safeSnippet(
            Object.keys(data?.responses || {})
              .filter((key) => key !== coupleData.nickname)
              .map((key) => data?.responses?.[key]?.answer)
              .find((answer) => typeof answer === 'string' && answer.trim().length > 0),
            120
          );

          if (!myAnswer && !partnerAnswer) return '';
          if (question && myAnswer) return `Q: ${question} | My answer: ${myAnswer}`;
          if (question && partnerAnswer) return `Q: ${question} | Partner answer: ${partnerAnswer}`;
          return myAnswer || partnerAnswer || '';
        })
        .filter(Boolean)
        .slice(0, 3);

      const vaultRef = collection(db, 'vault', coupleData.coupleCode, 'items');
      const vaultQuery = query(vaultRef, orderBy('timestamp', 'desc'), limit(40));
      const vaultSnapshot = await getDocs(vaultQuery);
      const recentVaultLetters = vaultSnapshot.docs
        .map((snapshotDoc) => snapshotDoc.data())
        .filter((item: any) => item?.type === 'letter' && typeof item?.content === 'string')
        .map((item: any) => {
          const title = safeSnippet(item.title, 60);
          const body = safeSnippet(item.content, 170);
          if (!body) return '';
          return title ? `${title}: ${body}` : body;
        })
        .filter(Boolean)
        .slice(0, 3);

      const sharedDiaryRef = collection(db, 'sharedDiary');
      const sharedDiaryQuery = query(
        sharedDiaryRef,
        where('coupleCode', '==', coupleData.coupleCode),
        orderBy('timestamp', 'desc'),
        limit(40)
      );
      const sharedDiarySnapshot = await getDocs(sharedDiaryQuery);
      const recentSharedDiaryTexts = sharedDiarySnapshot.docs
        .map((snapshotDoc) => snapshotDoc.data())
        .filter((entry: any) => entry?.type === 'text' && typeof entry?.content === 'string')
        .map((entry: any) => {
          const author = safeSnippet(entry.author, 30);
          const text = safeSnippet(entry.content, 170);
          if (!text) return '';
          return author ? `${author}: ${text}` : text;
        })
        .filter(Boolean)
        .slice(0, 4);

      setCoupleContext({
        nickname: coupleData.nickname,
        partnerNickname,
        coupleCode: coupleData.coupleCode,
        recentMessages,
        recentParagraphs: recentDailyWritingAnswers.slice(0, 3),
        recentDailyWritingAnswers,
        recentDeepTalkAnswers,
        recentVaultLetters,
        recentSharedDiaryTexts,
      });
    } catch (error) {
      console.error('Error loading couple context:', error);
    }
  };

  const loadEchoMessages = async () => {
    if (!coupleData) return;

    try {
      const echoChatsRef = collection(db, 'couples', coupleData.coupleCode, 'echoChats');
      const echoChatsQuery = query(
        echoChatsRef,
        where('ownerNickname', '==', coupleData.nickname)
      );
      const echoChatsSnapshot = await getDocs(echoChatsQuery);
      
      const loadedMessages: EchoMessage[] = echoChatsSnapshot.docs.map(doc => ({
        id: doc.id,
        content: doc.data().content,
        isEcho: doc.data().isEcho,
        timestamp: doc.data().timestamp?.toDate() || new Date(),
      })).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      if (loadedMessages.length === 0) {
        // Show welcome message if no previous chats
        const welcomeMessage: EchoMessage = {
          id: 'welcome',
          content: `Hello ${coupleData?.nickname}! I'm ${echoConfig.echoDisplayName || 'Echo'}, your AI memory keeper. I've been learning about your relationship through your chats, writings, and shared moments. Ask me about your memories, or just chat about how you're feeling! 💕`,
          isEcho: true,
          timestamp: new Date(),
        };
        setMessages([welcomeMessage]);
      } else {
        setMessages(loadedMessages);
      }

      // Restore conversation history from loaded messages
      const history = loadedMessages.map(msg => ({
        role: (msg.isEcho ? 'assistant' : 'user') as 'user' | 'assistant',
        content: msg.content,
      }));
      setConversationHistory(history);
    } catch (error) {
      console.error('Error loading Echo messages:', error);
      // Show welcome message as fallback
      const welcomeMessage: EchoMessage = {
        id: 'welcome',
        content: `Hello ${coupleData?.nickname}! I'm ${echoConfig.echoDisplayName || 'Echo'}, your AI memory keeper. I've been learning about your relationship through your chats, writings, and shared moments. Ask me about your memories, or just chat about how you're feeling! 💕`,
        isEcho: true,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !coupleData) return;

    if (!isEchoConfigComplete(echoConfig)) {
      setDraftEchoConfig(echoConfig);
      setIsConfigModalVisible(true);
      return;
    }

    const userMessage: EchoMessage = {
      id: Date.now().toString(),
      content: inputText.trim(),
      isEcho: false,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputText.trim();
    setInputText('');
    setIsTyping(true);

    // Add to conversation history
    const newHistory = [...conversationHistory, { role: 'user' as const, content: currentInput }];
    const requestContext: CoupleContext = {
      ...coupleContext,
      nickname: coupleData.nickname,
      coupleCode: coupleData.coupleCode,
      echoDisplayName: echoConfig.echoDisplayName,
      echoStyle: echoConfig.partnerStyle,
      echoFocus: echoConfig.questionFocus,
      echoBoundaries: echoConfig.avoidTopics,
    };

    try {
      // Save user message to Firestore
      const echoChatsRef = collection(db, 'couples', coupleData.coupleCode, 'echoChats');
      await addDoc(echoChatsRef, {
        content: currentInput,
        isEcho: false,
        ownerNickname: coupleData.nickname,
        timestamp: serverTimestamp(),
      });

      const echoResponseContent = await generateEchoResponse(currentInput, requestContext, newHistory);
      
      const echoResponse: EchoMessage = {
        id: (Date.now() + 1).toString(),
        content: echoResponseContent,
        isEcho: true,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, echoResponse]);
      setConversationHistory([...newHistory, { role: 'assistant', content: echoResponseContent }]);
      
      // Save Echo response to Firestore
      await addDoc(echoChatsRef, {
        content: echoResponseContent,
        isEcho: true,
        ownerNickname: coupleData.nickname,
        timestamp: serverTimestamp(),
      });
      
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error generating Echo response:', error);
      const health = await checkBackendHealth();
      console.error('Echo backend connectivity diagnostics:', health);
      const fallbackResponse: EchoMessage = {
        id: (Date.now() + 1).toString(),
        content: health.ok
          ? "I'm having trouble processing that request right now, but I'm still here for you. Your feelings and thoughts are always important to me. 💕"
          : `I can't reach the server right now (${health.error || 'network issue'}). I'll still stay with you here. 💕`,
        isEcho: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, fallbackResponse]);
    } finally {
      setIsTyping(false);
    }
  };

  const renderMessage = ({ item, index }: { item: EchoMessage; index: number }) => {
    return (
      <Animated.View 
        style={[
          styles.messageContainer,
          item.isEcho ? styles.echoMessageContainer : styles.userMessageContainer,
          {
            opacity: fadeAnim,
            transform: [{
              translateX: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [item.isEcho ? -50 : 50, 0],
              }),
            }],
          },
        ]}
      >
        <View style={[
          styles.messageBubble,
          item.isEcho ? styles.echoMessage : styles.userMessage
        ]}>
          {item.isEcho && (
            <View style={styles.echoHeader}>
              <Bot size={16} color="#ffffff" />
              <Text style={styles.echoName}>Echo</Text>
            </View>
          )}
          <Text style={[
            styles.messageText,
            item.isEcho ? styles.echoMessageText : styles.userMessageText
          ]}>
            {item.content}
          </Text>
          <Text style={[
            styles.messageTime,
            item.isEcho ? styles.echoMessageTime : styles.userMessageTime
          ]}>
            {item.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </Text>
        </View>
      </Animated.View>
    );
  };

  return (
    <LinearGradient colors={['#74b9ff', '#0984e3']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.View 
          style={[
            styles.header,
            {
              opacity: fadeAnim,
              transform: [{ translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0],
              })}],
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={styles.backButton}
          >
            <ArrowLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Bot size={24} color="#ffffff" />
            <Text style={styles.headerTitle}>{echoConfig.echoDisplayName || 'Echo'} AI 🤖</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => {
              setDraftEchoConfig(echoConfig);
              setIsConfigModalVisible(true);
            }}
          >
            <Settings size={20} color="#ffffff" />
          </TouchableOpacity>
        </Animated.View>

        <Modal visible={isConfigModalVisible} animationType="slide" transparent>
          <View style={styles.configModalOverlay}>
            <View style={styles.configModalCard}>
              <Text style={styles.configTitle}>Customize Your Echo</Text>
              <Text style={styles.configSubtitle}>Set how Echo should act like your partner and what it should ask.</Text>

              <TextInput
                style={styles.configInput}
                placeholder="Echo name (optional)"
                placeholderTextColor="#999"
                value={draftEchoConfig.echoDisplayName}
                onChangeText={(text) => setDraftEchoConfig((prev) => ({ ...prev, echoDisplayName: text }))}
                maxLength={40}
              />
              <TextInput
                style={styles.configInput}
                placeholder="How should Echo act? (required)"
                placeholderTextColor="#999"
                value={draftEchoConfig.partnerStyle}
                onChangeText={(text) => setDraftEchoConfig((prev) => ({ ...prev, partnerStyle: text }))}
                maxLength={180}
              />
              <TextInput
                style={styles.configInput}
                placeholder="What should Echo ask about often? (required)"
                placeholderTextColor="#999"
                value={draftEchoConfig.questionFocus}
                onChangeText={(text) => setDraftEchoConfig((prev) => ({ ...prev, questionFocus: text }))}
                maxLength={200}
              />
              <TextInput
                style={[styles.configInput, styles.configInputMultiline]}
                placeholder="Anything Echo should avoid? (optional)"
                placeholderTextColor="#999"
                value={draftEchoConfig.avoidTopics}
                onChangeText={(text) => setDraftEchoConfig((prev) => ({ ...prev, avoidTopics: text }))}
                multiline
                maxLength={240}
              />

              <View style={styles.configActions}>
                <TouchableOpacity
                  style={[styles.configActionButton, styles.configCancelButton]}
                  onPress={() => {
                    if (!isEchoConfigComplete(echoConfig)) return;
                    setIsConfigModalVisible(false);
                  }}
                  disabled={isSavingConfig || !isEchoConfigComplete(echoConfig)}
                >
                  <Text style={styles.configCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.configActionButton, styles.configSaveButton]}
                  onPress={saveEchoConfig}
                  disabled={isSavingConfig}
                >
                  {isSavingConfig ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.configSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <KeyboardAvoidingView
          style={styles.chatContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.messagesContainer}>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item) => item.id}
              style={styles.messagesList}
              contentContainerStyle={styles.messagesContent}
              showsVerticalScrollIndicator={false}
            />
            
            {isTyping && (
              <Animated.View 
                style={[
                  styles.typingContainer,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateX: fadeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-50, 0],
                    })}],
                  },
                ]}
              >
                <View style={styles.typingBubble}>
                  <Bot size={16} color="#74b9ff" />
                  <Text style={styles.typingText}>Echo is thinking</Text>
                  <TypingIndicator />
                </View>
              </Animated.View>
            )}
          </View>

          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                placeholder="Ask Echo about your memories..."
                placeholderTextColor="#a0a0a0"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
                onPress={sendMessage}
                disabled={!inputText.trim() || isTyping || isLoadingConfig}
              >
                <LinearGradient
                  colors={['#74b9ff', '#0984e3']}
                  style={styles.sendButtonGradient}
                >
                  <Send size={18} color="#ffffff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
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
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Playfair-Bold',
    color: '#ffffff',
    marginLeft: 8,
  },
  headerSpacer: {
    width: 32,
  },
  settingsButton: {
    padding: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  configModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  configModalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
  },
  configTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#1f2937',
  },
  configSubtitle: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#6b7280',
    lineHeight: 18,
  },
  configInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#111827',
    marginBottom: 10,
  },
  configInputMultiline: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  configActions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  configActionButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  configCancelButton: {
    backgroundColor: '#f3f4f6',
  },
  configSaveButton: {
    backgroundColor: '#2563eb',
  },
  configCancelText: {
    color: '#374151',
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  configSaveText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  chatContainer: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 20,
  },
  messageContainer: {
    marginBottom: 16,
  },
  userMessageContainer: {
    alignItems: 'flex-end',
  },
  echoMessageContainer: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 20,
    padding: 16,
  },
  userMessage: {
    backgroundColor: '#74b9ff',
  },
  echoMessage: {
    backgroundColor: '#f1f3f4',
  },
  echoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#74b9ff',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  echoName: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginLeft: 4,
  },
  messageText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
  userMessageText: {
    color: '#ffffff',
  },
  echoMessageText: {
    color: '#333',
  },
  messageTime: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 6,
  },
  userMessageTime: {
    color: '#ffffff',
    opacity: 0.7,
  },
  echoMessageTime: {
    color: '#666',
  },
  typingContainer: {
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f3f4',
    borderRadius: 20,
    padding: 16,
    maxWidth: '85%',
  },
  typingText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
    marginLeft: 8,
    marginRight: 8,
  },
  typingDots: {
    flexDirection: 'row',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#74b9ff',
    marginHorizontal: 1,
  },
  dot1: {
    opacity: 0.4,
  },
  dot2: {
    opacity: 0.7,
  },
  dot3: {
    opacity: 1,
  },
  inputContainer: {
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#f8f9fa',
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    maxHeight: 100,
    paddingVertical: 12,
    color: '#333',
  },
  sendButton: {
    borderRadius: 20,
    margin: 4,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});