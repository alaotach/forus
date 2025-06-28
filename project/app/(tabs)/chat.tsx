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
  Image,
  Animated,
  Alert,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, Heart, Smile, Camera, Mic, X, Play, Pause, Square } from 'lucide-react-native';
import { useCouple } from '@/hooks/useCouple';
import { useRouter, useFocusEffect } from 'expo-router';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/services/firebase';
import { ChatMessage } from '@/types/app';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useAudioPlayer, useAudioRecorder, AudioSource } from 'expo-audio';

export default function ChatScreen() {
  const { coupleData, isConnected, isLoading } = useCouple();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraType, setCameraType] = useState<CameraType>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingAudio, setPlayingAudio] = useState<{ [key: string]: any }>({});
  const [currentRecordingUri, setCurrentRecordingUri] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const mounted = useRef(true);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  const cameraRef = useRef<CameraView>(null);
  
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [audioPermission, setAudioPermission] = useState<boolean>(false);

  // Audio recorder setup with modern Expo Audio
  const recorder = useAudioRecorder({
    android: {
      extension: '.m4a',
      outputFormat: 'mpeg4',
      audioEncoder: 'aac',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
    },
    ios: {
      extension: '.m4a',
      outputFormat: 'mpeg4aac',
      audioQuality: 'max',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000,
    },
  });

  // Handle screen focus for proper navigation
  useFocusEffect(
    React.useCallback(() => {
      setIsScreenFocused(true);
      return () => setIsScreenFocused(false);
    }, [])
  );

  useEffect(() => {
    mounted.current = true;
    requestAudioPermission();

    // Wait for loading to complete
    if (isLoading) {
      return;
    }

    // Check connection and redirect if needed
    if (!isConnected || !coupleData) {
      console.log('Chat: Not connected, redirecting to pairing');
      router.replace('/pairing');
      return;
    }

    // Only set up chat if screen is focused and connected
    if (isScreenFocused) {
      setupChat();
    }

    return () => {
      mounted.current = false;
      stopAllAudio();
    };
  }, [isConnected, isLoading, coupleData, isScreenFocused]);

  const requestAudioPermission = async () => {
    try {
      if (recorder && recorder.requestPermissionsAsync) {
        const permission = await recorder.requestPermissionsAsync();
        setAudioPermission(permission.granted);
      } else {
        console.warn('Audio recorder not available');
        setAudioPermission(false);
      }
    } catch (error) {
      console.error('Error requesting audio permission:', error);
      setAudioPermission(false);
    }
  };

  const setupChat = () => {
    if (!coupleData || !mounted.current) return;

    console.log('Setting up chat for couple:', coupleData.coupleCode);

    const messagesRef = collection(db, 'couples', coupleData.coupleCode, 'chat');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!mounted.current) return;

      const messagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      
      console.log('Loaded messages:', messagesData.length);
      setMessages(messagesData);
      
      // Show notification for new messages (except your own)
      if (messagesData.length > 0) {
        const lastMessage = messagesData[messagesData.length - 1];
        if (lastMessage.sender !== coupleData.nickname && isScreenFocused) {
          showMessageNotification(lastMessage);
        }
      }
      
      setTimeout(() => {
        if (mounted.current) {
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      }, 100);
    }, (error) => {
      console.error('Error listening to messages:', error);
      if (mounted.current) {
        Alert.alert('Connection Error', 'Unable to load messages. Please check your connection.');
      }
    });

    // Animate in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    return () => unsubscribe();
  };

  const showMessageNotification = (message: ChatMessage) => {
    // Simple in-app notification
    if (Platform.OS === 'web') {
      // Web notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`💕 ${message.sender}`, {
          body: message.type === 'image' ? 'Sent a photo' : 
                message.type === 'audio' ? 'Sent a voice message' : 
                message.message,
          icon: '/icon.png',
        });
      }
    } else {
      // Mobile: You could integrate with expo-notifications here
      console.log('New message notification:', message.sender, message.message);
    }
  };

  const requestNotificationPermission = async () => {
    if (Platform.OS === 'web' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          Alert.alert('Notifications Enabled', 'You\'ll now receive notifications for new messages! 💕');
        }
      }
    }
  };

  const sendMessage = async (messageText?: string, mediaUrl?: string, mediaType?: 'image' | 'audio') => {
    const content = messageText || inputText.trim();
    if (!content && !mediaUrl) return;
    if (!coupleData) return;

    try {
      const messagesRef = collection(db, 'couples', coupleData.coupleCode, 'chat');
      await addDoc(messagesRef, {
        sender: coupleData.nickname,
        message: content,
        timestamp: serverTimestamp(),
        reactions: {},
        type: mediaType || 'text',
        mediaUrl: mediaUrl || undefined
      });

      if (!mediaUrl) {
        setInputText('');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Send Failed', 'Unable to send message. Please try again.');
    }
  };

  const addReaction = async (messageId: string, emoji: string) => {
    if (!coupleData) return;

    try {
      const messageRef = doc(db, 'couples', coupleData.coupleCode, 'chat', messageId);
      await updateDoc(messageRef, {
        [`reactions.${emoji}`]: arrayUnion(coupleData.nickname)
      });
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert('Camera Permission', 'Camera access is needed to take photos');
        return;
      }
    }
    setShowCamera(true);
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
      });

      setShowCamera(false);
      await uploadAndSendMedia(photo.uri, 'image');
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Error', 'Failed to take picture');
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAndSendMedia(result.assets[0].uri, 'image');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const startRecording = async () => {
    if (!audioPermission) {
      Alert.alert('Microphone Permission', 'Microphone access is needed to record voice messages');
      return;
    }

    try {
      if (recorder && recorder.prepareAsync && recorder.startAsync) {
        await recorder.prepareAsync();
        await recorder.startAsync();
        setIsRecording(true);
        setRecordingDuration(0);

        // Start timer
        recordingTimer.current = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);
      } else {
        Alert.alert('Error', 'Audio recording not available on this platform');
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recorder || !recorder.isRecording) return;

    try {
      setIsRecording(false);
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }

      const uri = await recorder.stopAsync();
      setRecordingDuration(0);

      if (uri) {
        setCurrentRecordingUri(uri);
        await uploadAndSendMedia(uri, 'audio');
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const uploadAndSendMedia = async (uri: string, type: 'image' | 'audio') => {
    if (!coupleData) return;

    try {
      // Create a blob from the URI
      const response = await fetch(uri);
      const blob = await response.blob();

      // Create a reference to the file in Firebase Storage
      const timestamp = Date.now();
      const fileName = `${type}s/${coupleData.coupleCode}/${timestamp}.${type === 'image' ? 'jpg' : 'm4a'}`;
      const storageRef = ref(storage, fileName);

      // Upload the file
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      // Send the message with media URL
      await sendMessage(
        type === 'image' ? '📸 Photo' : '🎵 Voice message',
        downloadURL,
        type
      );
    } catch (error) {
      console.error('Error uploading media:', error);
      Alert.alert('Upload Failed', 'Failed to upload media. Please try again.');
    }
  };

  const playAudio = async (messageId: string, audioUrl: string) => {
    try {
      // Stop any currently playing audio
      if (playingAudio[messageId]) {
        playingAudio[messageId].pause();
        setPlayingAudio(prev => {
          const newState = { ...prev };
          delete newState[messageId];
          return newState;
        });
        return;
      }

      // Stop all other audio
      await stopAllAudio();

      // Create and play new audio using modern Expo Audio
      const player = useAudioPlayer({ uri: audioUrl } as AudioSource);
      setPlayingAudio(prev => ({ ...prev, [messageId]: player }));

      // Handle playback completion
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingAudio(prev => {
            const newState = { ...prev };
            delete newState[messageId];
            return newState;
          });
        }
      });

      player.play();

      return () => subscription?.remove();
    } catch (error) {
      console.error('Error playing audio:', error);
      Alert.alert('Error', 'Failed to play audio');
    }
  };

  const stopAllAudio = async () => {
    try {
      for (const player of Object.values(playingAudio)) {
        if (player && player.pause) {
          player.pause();
        }
      }
      setPlayingAudio({});
    } catch (error) {
      console.error('Error stopping audio:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isMyMessage = item.sender === coupleData?.nickname;
    const isPlaying = !!playingAudio[item.id];
    
    return (
      <Animated.View 
        style={[
          styles.messageContainer,
          isMyMessage ? styles.myMessageContainer : styles.theirMessageContainer,
          {
            opacity: fadeAnim,
            transform: [{
              translateX: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [isMyMessage ? 50 : -50, 0],
              }),
            }],
          },
        ]}
      >
        <View style={[
          styles.messageBubble,
          isMyMessage ? styles.myMessage : styles.theirMessage
        ]}>
          {item.type === 'image' && item.mediaUrl && (
            <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} />
          )}
          
          {item.type === 'audio' && item.mediaUrl && (
            <View style={styles.audioMessage}>
              <TouchableOpacity
                style={styles.audioPlayButton}
                onPress={() => playAudio(item.id, item.mediaUrl!)}
              >
                {isPlaying ? (
                  <Pause size={20} color={isMyMessage ? "#ffffff" : "#ff6b9d"} />
                ) : (
                  <Play size={20} color={isMyMessage ? "#ffffff" : "#ff6b9d"} />
                )}
              </TouchableOpacity>
              <View style={styles.audioWaveform}>
                {[...Array(8)].map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.audioBar,
                      {
                        height: Math.random() * 20 + 10,
                        backgroundColor: isMyMessage ? "#ffffff" : "#ff6b9d",
                        opacity: isPlaying ? 0.8 : 0.4,
                      }
                    ]}
                  />
                ))}
              </View>
            </View>
          )}
          
          {item.type === 'text' && (
            <Text style={[
              styles.messageText,
              isMyMessage ? styles.myMessageText : styles.theirMessageText
            ]}>
              {item.message}
            </Text>
          )}
          
          <View style={styles.messageFooter}>
            <Text style={[
              styles.messageTime,
              isMyMessage ? styles.myMessageTime : styles.theirMessageTime
            ]}>
              {item.timestamp ? new Date(item.timestamp.toDate()).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              }) : ''}
            </Text>
          </View>
        </View>

        <View style={styles.reactionButtons}>
          <TouchableOpacity
            style={styles.reactionButton}
            onPress={() => addReaction(item.id, '❤️')}
          >
            <Text style={styles.reactionEmoji}>❤️</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.reactionButton}
            onPress={() => addReaction(item.id, '😍')}
          >
            <Text style={styles.reactionEmoji}>😍</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.reactionButton}
            onPress={() => addReaction(item.id, '🥰')}
          >
            <Text style={styles.reactionEmoji}>🥰</Text>
          </TouchableOpacity>
        </View>

        {item.reactions && Object.keys(item.reactions).length > 0 && (
          <View style={styles.reactionsContainer}>
            {Object.entries(item.reactions).map(([emoji, users]) => (
              users.length > 0 && (
                <View key={emoji} style={styles.reactionItem}>
                  <Text style={styles.reactionText}>{emoji} {users.length}</Text>
                </View>
              )
            ))}
          </View>
        )}
      </Animated.View>
    );
  };

  // Show loading state while checking connection
  if (isLoading) {
    return (
      <LinearGradient colors={['#ff9a9e', '#fecfef']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Heart size={48} color="#ffffff" />
            <Text style={styles.loadingText}>Loading your chat...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Don't render if not connected (will redirect)
  if (!isConnected || !coupleData) {
    return null;
  }

  return (
    <LinearGradient colors={['#ff9a9e', '#fecfef']} style={styles.container}>
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
          <Heart size={24} color="#ffffff" />
          <Text style={styles.headerTitle}>Our Chat 💕</Text>
          <TouchableOpacity 
            onPress={requestNotificationPermission}
            style={styles.notificationButton}
          >
            <Text style={styles.notificationText}>🔔</Text>
          </TouchableOpacity>
        </Animated.View>

        <KeyboardAvoidingView
          style={styles.chatContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.messagesContainer}>
            {messages.length === 0 ? (
              <Animated.View 
                style={[
                  styles.emptyState,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: fadeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [50, 0],
                    })}],
                  },
                ]}
              >
                <Heart size={64} color="#ff6b9d" />
                <Text style={styles.emptyStateTitle}>Start Your Conversation</Text>
                <Text style={styles.emptyStateText}>
                  Send your first love message, photo, or voice note to begin your chat history together 💕
                </Text>
              </Animated.View>
            ) : (
              <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={(item) => item.id}
                style={styles.messagesList}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>

          <Animated.View 
            style={[
              styles.inputContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [50, 0],
                })}],
              },
            ]}
          >
            {isRecording && (
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>Recording... {formatDuration(recordingDuration)}</Text>
                <TouchableOpacity onPress={stopRecording} style={styles.stopRecordingButton}>
                  <Square size={16} color="#ff6b6b" fill="#ff6b6b" />
                </TouchableOpacity>
              </View>
            )}
            
            <View style={styles.inputWrapper}>
              <TouchableOpacity style={styles.mediaButton} onPress={pickImage}>
                <Camera size={20} color="#ff6b9d" />
              </TouchableOpacity>
              
              <TextInput
                style={styles.textInput}
                placeholder="Type your love message..."
                placeholderTextColor="#a0a0a0"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
                editable={!isRecording}
              />
              
              <TouchableOpacity 
                style={styles.mediaButton} 
                onPress={isRecording ? stopRecording : startRecording}
                onLongPress={startRecording}
              >
                <Mic size={20} color={isRecording ? "#ff6b6b" : "#ff6b9d"} />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
                onPress={() => sendMessage()}
                disabled={!inputText.trim() || isRecording}
              >
                <LinearGradient
                  colors={['#ff6b9d', '#c44569']}
                  style={styles.sendButtonGradient}
                >
                  <Send size={18} color="#ffffff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>

        {/* Camera Modal */}
        <Modal visible={showCamera} animationType="slide">
          <View style={styles.cameraContainer}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing={cameraType}
            >
              <View style={styles.cameraOverlay}>
                <TouchableOpacity
                  style={styles.cameraCloseButton}
                  onPress={() => setShowCamera(false)}
                >
                  <X size={24} color="#ffffff" />
                </TouchableOpacity>
                
                <View style={styles.cameraControls}>
                  <TouchableOpacity
                    style={styles.cameraFlipButton}
                    onPress={() => setCameraType(current => current === 'back' ? 'front' : 'back')}
                  >
                    <Text style={styles.cameraButtonText}>Flip</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.cameraCaptureButton}
                    onPress={takePicture}
                  >
                    <View style={styles.cameraCaptureInner} />
                  </TouchableOpacity>
                  
                  <View style={styles.cameraPlaceholder} />
                </View>
              </View>
            </CameraView>
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
    flex: 1,
    textAlign: 'center',
  },
  notificationButton: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
  },
  notificationText: {
    fontSize: 16,
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
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontFamily: 'Playfair-Bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
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
  myMessageContainer: {
    alignItems: 'flex-end',
  },
  theirMessageContainer: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 20,
    padding: 16,
    paddingHorizontal: 20,
  },
  myMessage: {
    backgroundColor: '#ff6b9d',
  },
  theirMessage: {
    backgroundColor: '#f1f3f4',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
  },
  audioMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  audioPlayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  audioWaveform: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  audioBar: {
    width: 3,
    marginHorizontal: 1,
    borderRadius: 1.5,
  },
  messageText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
  myMessageText: {
    color: '#ffffff',
  },
  theirMessageText: {
    color: '#333',
  },
  messageFooter: {
    marginTop: 6,
  },
  messageTime: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  myMessageTime: {
    color: '#ffffff',
    opacity: 0.7,
  },
  theirMessageTime: {
    color: '#666',
  },
  reactionButtons: {
    flexDirection: 'row',
    marginTop: 6,
    opacity: 0.7,
  },
  reactionButton: {
    marginHorizontal: 2,
    padding: 4,
  },
  reactionEmoji: {
    fontSize: 16,
  },
  reactionsContainer: {
    flexDirection: 'row',
    marginTop: 6,
  },
  reactionItem: {
    backgroundColor: '#f1f3f4',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 4,
  },
  reactionText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  inputContainer: {
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff5f5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff6b6b',
    marginRight: 8,
  },
  recordingText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#ff6b6b',
  },
  stopRecordingButton: {
    padding: 4,
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
  mediaButton: {
    padding: 8,
    marginHorizontal: 4,
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
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
  },
  cameraCloseButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 8,
  },
  cameraControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  cameraFlipButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cameraButtonText: {
    color: '#ffffff',
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
  },
  cameraCaptureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraCaptureInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ffffff',
  },
  cameraPlaceholder: {
    width: 60,
  },
});