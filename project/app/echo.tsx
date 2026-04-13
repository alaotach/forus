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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Send, Bot, Heart } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCouple } from '@/hooks/useCouple';
import { generateEchoResponse, CoupleContext } from '@/services/openai';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';

interface EchoMessage {
  id: string;
  content: string;
  isEcho: boolean;
  timestamp: Date;
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
  const [conversationHistory, setConversationHistory] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [coupleContext, setCoupleContext] = useState<CoupleContext>({
    nickname: coupleData?.nickname || '',
  });
  const flatListRef = useRef<FlatList>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadCoupleContext();
    loadEchoMessages();

    // Animate in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  const loadCoupleContext = async () => {
    if (!coupleData) return;

    try {
      // Get partner nickname
      const coupleRef = doc(db, 'couples', coupleData.coupleCode);
      const coupleDoc = await getDoc(coupleRef);
      let partnerNickname = '';
      
      if (coupleDoc.exists()) {
        const users = coupleDoc.data().users || {};
        partnerNickname = Object.keys(users).find(name => name !== coupleData.nickname) || '';
      }

      // Get recent chat messages
      const messagesRef = collection(db, 'couples', coupleData.coupleCode, 'chat');
      const messagesQuery = query(messagesRef, orderBy('timestamp', 'desc'), limit(10));
      const messagesSnapshot = await getDocs(messagesQuery);
      const recentMessages = messagesSnapshot.docs.map(doc => doc.data().message);

      // Get recent paragraphs
      const today = new Date();
      const recentDates = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        recentDates.push(date.toISOString().split('T')[0]);
      }

      const recentParagraphs: string[] = [];
      for (const date of recentDates) {
        try {
          const paragraphRef = doc(db, 'dailyParagraphs', coupleData.coupleCode, date, coupleData.nickname);
          const paragraphDoc = await getDoc(paragraphRef);
          if (paragraphDoc.exists()) {
            recentParagraphs.push(paragraphDoc.data().content);
          }
        } catch (error) {
          // Continue if paragraph doesn't exist
        }
      }

      setCoupleContext({
        nickname: coupleData.nickname,
        partnerNickname,
        recentMessages: recentMessages.slice(0, 5),
        recentParagraphs: recentParagraphs.slice(0, 3),
      });
    } catch (error) {
      console.error('Error loading couple context:', error);
    }
  };

  const loadEchoMessages = async () => {
    if (!coupleData) return;

    try {
      const echoChatsRef = collection(db, 'couples', coupleData.coupleCode, 'echoChats');
      const echoChatsQuery = query(echoChatsRef, orderBy('timestamp', 'asc'));
      const echoChatsSnapshot = await getDocs(echoChatsQuery);
      
      const loadedMessages: EchoMessage[] = echoChatsSnapshot.docs.map(doc => ({
        id: doc.id,
        content: doc.data().content,
        isEcho: doc.data().isEcho,
        timestamp: doc.data().timestamp?.toDate() || new Date(),
      }));

      if (loadedMessages.length === 0) {
        // Show welcome message if no previous chats
        const welcomeMessage: EchoMessage = {
          id: 'welcome',
          content: `Hello ${coupleData?.nickname}! I'm Echo, your AI memory keeper. I've been learning about your relationship through your chats, writings, and shared moments. Ask me about your memories, or just chat about how you're feeling! 💕`,
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
        content: `Hello ${coupleData?.nickname}! I'm Echo, your AI memory keeper. I've been learning about your relationship through your chats, writings, and shared moments. Ask me about your memories, or just chat about how you're feeling! 💕`,
        isEcho: true,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !coupleData) return;

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

    try {
      // Save user message to Firestore
      const echoChatsRef = collection(db, 'couples', coupleData.coupleCode, 'echoChats');
      await addDoc(echoChatsRef, {
        content: currentInput,
        isEcho: false,
        timestamp: serverTimestamp(),
      });

      const echoResponseContent = await generateEchoResponse(currentInput, coupleContext, newHistory);
      
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
        timestamp: serverTimestamp(),
      });
      
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error generating Echo response:', error);
      const fallbackResponse: EchoMessage = {
        id: (Date.now() + 1).toString(),
        content: "I'm having trouble connecting right now, but I'm still here for you. Your feelings and thoughts are always important to me. 💕",
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Bot size={24} color="#ffffff" />
            <Text style={styles.headerTitle}>Echo AI 🤖</Text>
          </View>
          <View style={styles.headerSpacer} />
        </Animated.View>

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
                disabled={!inputText.trim() || isTyping}
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