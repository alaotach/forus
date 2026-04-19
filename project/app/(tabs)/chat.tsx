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
  ActivityIndicator,
  PermissionsAndroid,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, Heart, Camera, Mic, X, Play, Pause, Square, MoreVertical, CheckCheck, Check, Pin, Reply, Copy, Pencil, Trash2, Download } from 'lucide-react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useCouple } from '@/hooks/useCouple';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { ChatMessage } from '@/types/app';
import { uploadPhotoMedia, uploadAudioMedia } from '@/services/mediaUpload';
import { streamAndCacheMedia, getCachedFile } from '@/services/media';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useAudioPlayer, useAudioRecorder, AudioSource } from 'expo-audio';
import * as Audio from 'expo-audio';
import EmojiSelector from 'react-native-emoji-selector';

const CHAT_OFFLINE_CACHE_PREFIX = 'chat_offline_v1:';
const CHAT_PENDING_RETRY_PREFIX = 'chat_pending_retry_v1:';

type PendingChatMessage = ChatMessage & {
  _sending?: boolean;
  _failed?: boolean;
  _tempId?: string;
  _retryUpload?: boolean;
  _localMediaUri?: string;
  _mediaType?: 'image' | 'audio';
};

function toTimestampLike(ms?: number) {
  const safeMs = Number.isFinite(ms) ? Number(ms) : Date.now();
  return {
    toDate: () => new Date(safeMs),
    seconds: Math.floor(safeMs / 1000),
    nanoseconds: 0,
  } as any;
}

function toMillis(input: any): number {
  try {
    if (input?.toDate) {
      return new Date(input.toDate()).getTime();
    }
    if (typeof input?.seconds === 'number') {
      return input.seconds * 1000;
    }
    if (typeof input === 'string' || typeof input === 'number') {
      const parsed = new Date(input).getTime();
      if (!Number.isNaN(parsed)) return parsed;
    }
  } catch {
    // fallback below
  }
  return Date.now();
}

function serializeMessagesForOffline(messages: ChatMessage[]) {
  return messages.map((message) => ({
    ...message,
    timestampMs: toMillis((message as any).timestamp),
    replyTo: message.replyTo
      ? {
          ...message.replyTo,
        }
      : message.replyTo,
    readAtMs: (message as any).readAt ? toMillis((message as any).readAt) : undefined,
  }));
}

function deserializeMessagesFromOffline(raw: any[]): ChatMessage[] {
  return (raw || []).map((message) => {
    const restored: any = {
      ...message,
      timestamp: toTimestampLike(message.timestampMs),
    };

    if (message.readAtMs) {
      restored.readAt = toTimestampLike(message.readAtMs);
    }

    delete restored.timestampMs;
    delete restored.readAtMs;

    return restored as ChatMessage;
  });
}

export default function ChatScreen() {
  const { coupleData, isConnected, isLoading } = useCouple();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [selectedImageMessage, setSelectedImageMessage] = useState<ChatMessage | null>(null);
  const [imageReplyText, setImageReplyText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingAudio, setPlayingAudio] = useState<{ [key: string]: any }>({});
  const [currentRecordingUri, setCurrentRecordingUri] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [downloadingMediaByMessageId, setDownloadingMediaByMessageId] = useState<Record<string, boolean>>({});
  const [unavailableMediaByMessageId, setUnavailableMediaByMessageId] = useState<Record<string, boolean>>({});
  const [uploadingMediaKind, setUploadingMediaKind] = useState<'image' | 'audio' | null>(null);
  const [pendingMessages, setPendingMessages] = useState<PendingChatMessage[]>([]);
  const tempIdCounter = useRef(0);
  const uploadedLocalMediaPathByFileKeyRef = useRef<Record<string, string>>({});
  const autoRetryInProgressRef = useRef<Set<string>>(new Set());
  const flatListRef = useRef<FlatList>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const mounted = useRef(true);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [audioPermission, setAudioPermission] = useState<boolean>(false);
  const QUICK_REACTIONS = ['❤️', '😍', '😂', '😮', '😢', '🙏'];
  const isUploadingOutgoingMedia = uploadingMediaKind !== null;

  const recordingOptions = {
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
  };

  // Audio recorder setup with explicit options to avoid undefined web defaults.
  const recorder = useAudioRecorder(recordingOptions as any);

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
      console.log('Chat: Not connected, redirecting to auth');
      router.replace('/(auth)/auth');
      return;
    }

    // Only set up chat if screen is focused and connected
    let unsubscribe: (() => void) | undefined;
    if (isScreenFocused) {
      unsubscribe = setupChat();
    }

    return () => {
      mounted.current = false;
      if (unsubscribe) unsubscribe();
      stopAllAudio();
    };
  }, [isConnected, isLoading, coupleData, isScreenFocused]);

  const requestAudioPermission = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        const androidPermission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'Forus needs microphone access to record voice messages.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );

        if (androidPermission !== PermissionsAndroid.RESULTS.GRANTED) {
          setAudioPermission(false);
          return false;
        }
      }

      const requestRecordingPermissions =
        (Audio as any)?.requestRecordingPermissionsAsync ||
        (Audio as any)?.requestPermissionsAsync;

      if (typeof requestRecordingPermissions === 'function') {
        const permission = await requestRecordingPermissions();
        const granted = permission?.granted === true || permission?.status === 'granted';
        if (!granted) {
          setAudioPermission(false);
          return false;
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      setAudioPermission(true);
      return true;
    } catch (error) {
      console.error('Error setting audio mode:', error);
      setAudioPermission(false);
      return false;
    }
  };

  const serializePendingForOffline = (items: PendingChatMessage[]) => {
    return items
      .filter((item) => item._failed || item._sending)
      .map((item) => ({
        id: item.id,
        _tempId: item._tempId,
        _failed: true,
        _sending: false,
        _retryUpload: item._retryUpload || false,
        _localMediaUri: item._localMediaUri || null,
        _mediaType: item._mediaType || null,
        sender: item.sender,
        message: item.message,
        timestampMs: toMillis(item.timestamp),
        reactions: item.reactions || {},
        readBy: Array.isArray(item.readBy) ? item.readBy : [],
        type: item.type,
        media: item.media || null,
        mediaUrl: item.mediaUrl || null,
      }));
  };

  const deserializePendingFromOffline = (raw: any[]): PendingChatMessage[] => {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => ({
      id: String(item.id || `_tmp_${Date.now()}`),
      _tempId: item._tempId ? String(item._tempId) : String(item.id || `_tmp_${Date.now()}`),
      _failed: true,
      _sending: false,
      _retryUpload: Boolean(item._retryUpload),
      _localMediaUri: item._localMediaUri ? String(item._localMediaUri) : undefined,
      _mediaType: item._mediaType === 'audio' ? 'audio' : item._mediaType === 'image' ? 'image' : undefined,
      sender: String(item.sender || ''),
      message: String(item.message || ''),
      timestamp: toTimestampLike(typeof item.timestampMs === 'number' ? item.timestampMs : Date.now()),
      reactions: item.reactions && typeof item.reactions === 'object' ? item.reactions : {},
      readBy: Array.isArray(item.readBy) ? item.readBy : [],
      type: item.type || 'text',
      media: item.media || undefined,
      mediaUrl: item.mediaUrl || undefined,
    })) as PendingChatMessage[];
  };

  useEffect(() => {
    if (!coupleData?.coupleCode) return;
    const pendingCacheKey = `${CHAT_PENDING_RETRY_PREFIX}${coupleData.coupleCode}`;
    const serialized = serializePendingForOffline(pendingMessages);
    if (serialized.length === 0) {
      AsyncStorage.removeItem(pendingCacheKey).catch(() => undefined);
      return;
    }
    AsyncStorage.setItem(pendingCacheKey, JSON.stringify(serialized)).catch(() => undefined);
  }, [pendingMessages, coupleData?.coupleCode]);

  const setupChat = () => {
    if (!coupleData || !mounted.current) return;

    console.log('Setting up chat for couple:', coupleData.coupleCode);
    const offlineCacheKey = `${CHAT_OFFLINE_CACHE_PREFIX}${coupleData.coupleCode}`;
    const pendingCacheKey = `${CHAT_PENDING_RETRY_PREFIX}${coupleData.coupleCode}`;

    // Render cached timeline immediately for cold-start offline behavior.
    AsyncStorage.getItem(offlineCacheKey)
      .then((raw) => {
        if (!raw || !mounted.current) return;
        const parsed = JSON.parse(raw);
        const restored = deserializeMessagesFromOffline(parsed);
        if (restored.length > 0) {
          setMessages(restored);
        }
      })
      .catch((error) => {
        console.log('Chat offline cache read skipped:', error?.message || error);
      });

    AsyncStorage.getItem(pendingCacheKey)
      .then((raw) => {
        if (!raw || !mounted.current) return;
        const parsed = JSON.parse(raw);
        const restored = deserializePendingFromOffline(parsed);
        if (restored.length > 0) {
          setPendingMessages(restored);
        }
      })
      .catch((error) => {
        console.log('Chat pending retry cache read skipped:', error?.message || error);
      });

    const messagesRef = collection(db, 'couples', coupleData.coupleCode, 'chat');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    let isInitialLoad = true;

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (!mounted.current) return;

      const rawMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];

      const messagesData = await Promise.all(
        rawMessages.map(async (message) => {
          const hydrated = { ...message };

          if (message.media?.mediaId) {
            try {
              if (message.media.fileKey) {
                const cachedPath = await getCachedFile(message.media.fileKey);
                if (cachedPath) {
                  hydrated.mediaUrl = cachedPath;
                } else if (message.sender === coupleData.nickname) {
                  const localPath = uploadedLocalMediaPathByFileKeyRef.current[message.media.fileKey];
                  if (localPath) {
                    hydrated.mediaUrl = localPath;
                  }
                }
              }
            } catch {
              hydrated.mediaUrl = message.mediaUrl || null;
            }
          }

          if (message.replyTo?.media?.mediaId) {
            try {
              let replyMediaUrl: string | undefined;

              if (message.replyTo.media.fileKey) {
                const cachedReplyPath = await getCachedFile(message.replyTo.media.fileKey);
                if (cachedReplyPath) {
                  replyMediaUrl = cachedReplyPath;
                }
              }

              hydrated.replyTo = {
                ...message.replyTo,
                mediaUrl: replyMediaUrl,
              };
            } catch {
              hydrated.replyTo = message.replyTo;
            }
          }

          return hydrated;
        })
      );

      console.log('Loaded messages:', messagesData.length);
      setMessages(messagesData);
      AsyncStorage.setItem(offlineCacheKey, JSON.stringify(serializeMessagesForOffline(messagesData))).catch((error) => {
        console.log('Chat offline cache write skipped:', error?.message || error);
      });
      markIncomingMessagesAsRead(messagesData).catch((error) => {
        console.error('Error marking messages as read:', error);
      });

      // Show notification for new messages (except your own)
      if (!isInitialLoad) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const msg = change.doc.data() as ChatMessage;
            if (msg.sender !== coupleData.nickname) {
              showMessageNotification(msg);
            }
          }
        });
      }
      isInitialLoad = false;

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
      // While the user is already on chat, avoid showing interruptive local banners.
      console.log('New message received in active chat:', message.sender);
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

  const sendMessage = async (
    messageText?: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'audio',
    replyTarget?: ChatMessage | null,
    mediaRef?: { mediaId: string; fileKey: string; type: 'image' | 'audio'; ownerId: string; createdAt: string }
  ) => {
    const content = messageText || inputText.trim();
    if (!content && !mediaUrl) return;
    if (!coupleData) return;

    // ── Edit mode (no optimistic needed) ─────────────────────────────────
    if (editingMessage) {
      try {
        const messageRef = doc(db, 'couples', coupleData.coupleCode, 'chat', editingMessage.id);
        await updateDoc(messageRef, { message: content, edited: true });
        setEditingMessage(null);
        setInputText('');
        setReplyingTo(null);
      } catch (error) {
        console.error('Error editing message:', error);
        Alert.alert('Edit Failed', 'Unable to edit message.');
      }
      return;
    }

    // ── Optimistic insert ─────────────────────────────────────────────────
    const activeReply = replyTarget || replyingTo;
    const tempId = `_tmp_${Date.now()}_${++tempIdCounter.current}`;
    const nowMs = Date.now();

    const optimisticMsg: ChatMessage & { _sending: boolean; _tempId: string } = {
      id: tempId,
      _tempId: tempId,
      _sending: true,
      sender: coupleData.nickname,
      message: content,
      timestamp: { toDate: () => new Date(nowMs), seconds: nowMs / 1000, nanoseconds: 0 } as any,
      reactions: {},
      readBy: [coupleData.nickname],
      type: mediaType || 'text',
      ...(mediaRef ? { media: mediaRef } : {}),
      ...(mediaUrl ? { mediaUrl } : {}),
      ...(activeReply ? {
        replyTo: {
          id: activeReply.id,
          sender: activeReply.sender,
          message: activeReply.type === 'text' ? activeReply.message : activeReply.type === 'audio' ? '🎵 Voice message' : '📸 Photo',
          type: activeReply.type || 'text',
          media: activeReply.media || null,
          mediaUrl: activeReply.mediaUrl || null,
        }
      } : {}),
    };

    // Show immediately, clear input
    setPendingMessages(prev => [...prev, optimisticMsg]);
    setInputText('');
    setReplyingTo(null);

    // Scroll to bottom
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    // ── Firestore write ───────────────────────────────────────────────────
    try {
      const messagesRef = collection(db, 'couples', coupleData.coupleCode, 'chat');
      const messageData: any = {
        sender: coupleData.nickname,
        message: content,
        timestamp: serverTimestamp(),
        reactions: {},
        readBy: [coupleData.nickname],
        type: mediaType || 'text',
        ...(activeReply ? {
          replyTo: {
            id: activeReply.id,
            sender: activeReply.sender,
            message: activeReply.type === 'text' ? activeReply.message : activeReply.type === 'audio' ? '🎵 Voice message' : '📸 Photo',
            type: activeReply.type || 'text',
            media: activeReply.media || null,
          }
        } : {}),
      };
      if (mediaRef) messageData.media = mediaRef;

      await addDoc(messagesRef, messageData);

      // Remove the optimistic message (real one arrives via onSnapshot)
      setPendingMessages(prev => prev.filter(m => m._tempId !== tempId));

      // Fire notification silently
      try {
        const { notifyNewMessage } = await import('@/services/notifications');
        const preview = content.length > 50 ? content.substring(0, 50) + '...' : content;
        notifyNewMessage(coupleData.coupleCode, coupleData.nickname, preview);
      } catch { /* non-fatal */ }

    } catch (error) {
      console.error('Error sending message:', error);
      // Mark as failed so user can retry
      setPendingMessages(prev =>
        prev.map(m => m._tempId === tempId ? { ...m, _sending: false, _failed: true } : m)
      );
    }
  };

  const addReaction = async (messageId: string, emoji: string) => {
    if (!coupleData) return;

    try {
      const message = messages.find(msg => msg.id === messageId);
      if (!message) return;
      const hasReacted = message.reactions?.[emoji]?.includes(coupleData.nickname);
      const messageRef = doc(db, 'couples', coupleData.coupleCode, 'chat', messageId);
      await updateDoc(messageRef, {
        [`reactions.${emoji}`]: hasReacted ? arrayRemove(coupleData.nickname) : arrayUnion(coupleData.nickname)
      });
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  const getPartnerNickname = () => {
    const partnerMessage = messages.find(message => message.sender !== coupleData?.nickname);
    return partnerMessage?.sender;
  };

  const markIncomingMessagesAsRead = async (messagesData: ChatMessage[]) => {
    if (!coupleData) return;
    const unreadMessages = messagesData.filter(
      (message) =>
        message.sender !== coupleData.nickname &&
        !message.readBy?.includes(coupleData.nickname)
    );

    if (!unreadMessages.length) return;

    await Promise.all(
      unreadMessages.map((message) => {
        const messageRef = doc(db, 'couples', coupleData.coupleCode, 'chat', message.id);
        return updateDoc(messageRef, {
          readBy: arrayUnion(coupleData.nickname),
          readAt: serverTimestamp(),
        });
      })
    );

    // Keep the tab badge in sync once user has viewed chat.
    try {
      const { markNotificationsAsRead } = await import('@/services/notifications');
      await markNotificationsAsRead(coupleData.coupleCode, coupleData.nickname);
    } catch {
      // non-blocking
    }
  };

  const openMessageSelection = (message: ChatMessage) => {
    setSelectedMessage(message);
    setShowActionMenu(false);
    setShowEmojiPicker(false);
  };

  const clearSelection = () => {
    setSelectedMessage(null);
    setShowActionMenu(false);
    setShowEmojiPicker(false);
  };

  const closeImageViewer = () => {
    setSelectedImageUrl(null);
    setSelectedImageMessage(null);
    setImageReplyText('');
  };

  const sendImageReply = async () => {
    const content = imageReplyText.trim();
    if (!content || !selectedImageMessage) return;
    await sendMessage(content, undefined, undefined, selectedImageMessage);
    closeImageViewer();
  };

  const handleReply = () => {
    if (!selectedMessage) return;
    setReplyingTo(selectedMessage);
    clearSelection();
  };

  const handleCopy = async () => {
    if (!selectedMessage || selectedMessage.type !== 'text') return;
    try {
      const setStringSync = (Clipboard as any).setString;
      if (typeof setStringSync === 'function') {
        setStringSync(selectedMessage.message);
      } else {
        await Clipboard.setStringAsync(selectedMessage.message);
      }
      clearSelection();
    } catch (error) {
      console.error('Error copying message:', error);
      Alert.alert('Copy Failed', 'Unable to copy message right now.');
    }
  };

  const handleEdit = () => {
    if (!selectedMessage || selectedMessage.sender !== coupleData?.nickname || selectedMessage.type !== 'text') return;
    setEditingMessage(selectedMessage);
    setInputText(selectedMessage.message);
    clearSelection();
  };

  const handleDelete = async () => {
    if (!selectedMessage || selectedMessage.sender !== coupleData?.nickname || !coupleData) return;

    try {
      const messageRef = doc(db, 'couples', coupleData.coupleCode, 'chat', selectedMessage.id);
      await updateDoc(messageRef, {
        deleted: true,
        message: 'This message was deleted',
        type: 'text',
        mediaUrl: null,
      });
      clearSelection();
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  const handlePin = async () => {
    if (!selectedMessage || !coupleData) return;

    try {
      const messageRef = doc(db, 'couples', coupleData.coupleCode, 'chat', selectedMessage.id);
      await updateDoc(messageRef, {
        pinned: !selectedMessage.pinned,
      });
      clearSelection();
    } catch (error) {
      console.error('Error pinning message:', error);
    }
  };

  const getMessageStatus = (message: ChatMessage & { _sending?: boolean; _failed?: boolean }) => {
    if (message.sender !== coupleData?.nickname) return null;
    if ((message as any)._failed) return 'Failed';
    if ((message as any)._sending) return 'Sending';
    if (!message.timestamp || !(message.timestamp as any).seconds) return 'Sending';
    const partnerNickname = getPartnerNickname();
    if (!partnerNickname) return 'Sent';
    return message.readBy?.includes(partnerNickname) ? 'Read' : 'Sent';
  };

  const scrollToMessage = (messageId: string) => {
    const index = messages.findIndex(m => m.id === messageId);
    if (index < 0) return;
    try {
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 });
    } catch {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
    // Flash highlight
    setHighlightedMessageId(messageId);
    setTimeout(() => setHighlightedMessageId(null), 1200);
  };

  const launchImagePicker = async (withEditing: boolean) => {
    try {
      let result;
      try {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: withEditing,
          quality: 0.9,
        });
      } catch (pickerError: any) {
        const message = String(pickerError?.message || pickerError || '');
        if (message.includes('ImagePickerOptions') || message.includes('Built-in class kotlin.Any is not found')) {
          result = await ImagePicker.launchImageLibraryAsync();
        } else {
          throw pickerError;
        }
      }

      if (!result.canceled && result.assets[0]) {
        await uploadAndSendMedia(result.assets[0].uri, 'image');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const pickImage = async () => {
    if (isUploadingOutgoingMedia) return;
    Alert.alert(
      'Send Photo',
      'Choose how you want to send this image.',
      [
        {
          text: 'Send original',
          onPress: () => launchImagePicker(false),
        },
        {
          text: 'Edit (crop/draw)',
          onPress: () => launchImagePicker(true),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const startRecording = async () => {
    if (isUploadingOutgoingMedia) return;
    try {
      if (!recorder) {
        Alert.alert('Error', 'Recorder not available');
        return;
      }

      if (isRecording && isRecordingPaused) {
        recorder.record();
        setIsRecordingPaused(false);
        recordingTimer.current = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);
        return;
      }

      if (isRecording) return;

      const hasPermission = audioPermission || await requestAudioPermission();
      if (!hasPermission) {
        Alert.alert('Permission needed', 'Microphone permission is required to record audio.');
        return;
      }

      console.log('Starting chat recording...');
      await recorder.prepareToRecordAsync(recordingOptions as any);
      recorder.record();
      
      setIsRecording(true);
      setIsRecordingPaused(false);
      setCurrentRecordingUri(null);
      setRecordingDuration(0);

      // Start timer
      recordingTimer.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error: any) {
      console.error('Error starting recording:', error);
      Alert.alert('Error', `Failed to start recording: ${error}`);
    }
  };

  const pauseRecording = async () => {
    if (!recorder || !isRecording || isRecordingPaused) return;

    try {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }

      if (typeof (recorder as any).pause === 'function') {
        await (recorder as any).pause();
      } else {
        await recorder.stop();
      }

      setIsRecordingPaused(true);
    } catch (error) {
      console.error('Error pausing recording:', error);
      Alert.alert('Error', `Failed to pause recording: ${error}`);
    }
  };

  const stopRecording = async () => {
    if (!recorder || !isRecording) return;

    try {
      console.log('Stopping chat recording...');
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }

      await recorder.stop();
      
      // Get the recording URI
      const recordingURI = recorder.uri;
      if (recordingURI) {
        setCurrentRecordingUri(recordingURI);
        console.log('Recording saved to:', recordingURI);
      }
      
      setIsRecording(false);
      setIsRecordingPaused(false);
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert('Error', `Failed to stop recording: ${error}`);
      setIsRecording(false);
      setIsRecordingPaused(false);
    }
  };

  const sendRecordedAudio = async () => {
    if (!currentRecordingUri || isUploadingOutgoingMedia) return;

    try {
      await uploadAndSendMedia(currentRecordingUri, 'audio');
      setCurrentRecordingUri(null);
      setRecordingDuration(0);
    } catch (error) {
      console.error('Error sending recorded audio:', error);
      Alert.alert('Error', `Failed to send recording: ${error}`);
    }
  };

  const uploadAndSendMedia = async (uri: string, type: 'image' | 'audio') => {
    if (!coupleData || isUploadingOutgoingMedia) return;

    try {
      setUploadingMediaKind(type);
      let uploadedMedia;
      
      if (type === 'image') {
        uploadedMedia = await uploadPhotoMedia(uri, {
          userId: coupleData.nickname,
          coupleCode: coupleData.coupleCode,
        });
      } else {
        uploadedMedia = await uploadAudioMedia(uri, {
          userId: coupleData.nickname,
          coupleCode: coupleData.coupleCode,
        });
      }

      if (uploadedMedia?.fileKey) {
        uploadedLocalMediaPathByFileKeyRef.current[uploadedMedia.fileKey] = uri;
      }

      // Send the message with media reference only (no persisted URL)
      await sendMessage(
        type === 'image' ? '📸 Photo' : '🎵 Voice message',
        uri,
        type,
        null,
        uploadedMedia
      );
    } catch (error) {
      console.error('Error uploading media:', error);
      const nowMs = Date.now();
      const tempId = `_tmp_${nowMs}_${++tempIdCounter.current}`;
      const failedMediaMessage: PendingChatMessage = {
        id: tempId,
        _tempId: tempId,
        _sending: false,
        _failed: true,
        _retryUpload: true,
        _localMediaUri: uri,
        _mediaType: type,
        sender: coupleData.nickname,
        message: type === 'image' ? '📸 Photo' : '🎵 Voice message',
        timestamp: toTimestampLike(nowMs),
        reactions: {},
        readBy: [coupleData.nickname],
        type,
        mediaUrl: uri,
      };
      setPendingMessages((prev) => [...prev, failedMediaMessage]);
      Alert.alert('Upload Failed', 'Media saved locally. Tap retry on the failed bubble to send again.');
    } finally {
      setUploadingMediaKind(null);
    }
  };

  const retryFailedMessage = async (failedMessage: PendingChatMessage, options?: { silent?: boolean }) => {
    if (!coupleData || !failedMessage._failed) return;

    if (failedMessage._retryUpload && failedMessage._localMediaUri && failedMessage._mediaType) {
      try {
        setPendingMessages((prev) =>
          prev.map((m) =>
            m._tempId === failedMessage._tempId ? { ...m, _failed: false, _sending: true } : m
          )
        );

        setUploadingMediaKind(failedMessage._mediaType);
        const uploadedMedia =
          failedMessage._mediaType === 'image'
            ? await uploadPhotoMedia(failedMessage._localMediaUri, {
                userId: coupleData.nickname,
                coupleCode: coupleData.coupleCode,
              })
            : await uploadAudioMedia(failedMessage._localMediaUri, {
                userId: coupleData.nickname,
                coupleCode: coupleData.coupleCode,
              });

        if (uploadedMedia?.fileKey) {
          uploadedLocalMediaPathByFileKeyRef.current[uploadedMedia.fileKey] = failedMessage._localMediaUri;
        }

        setPendingMessages((prev) => prev.filter((m) => m._tempId !== failedMessage._tempId));
        await sendMessage(
          failedMessage.message,
          failedMessage._localMediaUri,
          failedMessage._mediaType,
          null,
          uploadedMedia
        );
      } catch (error) {
        console.error('Retry upload failed:', error);
        setPendingMessages((prev) =>
          prev.map((m) =>
            m._tempId === failedMessage._tempId ? { ...m, _failed: true, _sending: false } : m
          )
        );
        if (!options?.silent) {
          Alert.alert('Retry Failed', 'Still unable to send this media. Please try again.');
        }
      } finally {
        setUploadingMediaKind(null);
      }
      return;
    }

    setPendingMessages((prev) => prev.filter((m) => m._tempId !== failedMessage._tempId));
    await sendMessage(
      failedMessage.message,
      failedMessage.mediaUrl ?? undefined,
      failedMessage.type as 'image' | 'audio' | undefined,
      null,
      failedMessage.media || undefined
    );
  };

  useEffect(() => {
    if (!isConnected || !coupleData || isUploadingOutgoingMedia) return;

    const failedMine = pendingMessages.filter(
      (item) => item._failed && item.sender === coupleData.nickname
    );
    if (failedMine.length === 0) return;

    let cancelled = false;

    const runAutoRetry = async () => {
      for (const failedMessage of failedMine) {
        if (cancelled || !mounted.current) return;
        const retryKey = failedMessage._tempId || failedMessage.id;
        if (autoRetryInProgressRef.current.has(retryKey)) continue;

        autoRetryInProgressRef.current.add(retryKey);
        try {
          await retryFailedMessage(failedMessage, { silent: true });
        } finally {
          autoRetryInProgressRef.current.delete(retryKey);
        }
      }
    };

    runAutoRetry();

    return () => {
      cancelled = true;
    };
  }, [isConnected, coupleData?.coupleCode, pendingMessages, isUploadingOutgoingMedia]);

  const downloadMessageMedia = async (message: ChatMessage) => {
    if (!coupleData || !message.media?.mediaId) return;

    setDownloadingMediaByMessageId((prev) => ({ ...prev, [message.id]: true }));
    setUnavailableMediaByMessageId((prev) => ({ ...prev, [message.id]: false }));

    try {
      const cached = await streamAndCacheMedia(
        message.media.mediaId,
        coupleData.coupleCode,
        coupleData.nickname
      );

      setMessages((prev) =>
        prev.map((item) =>
          item.id === message.id
            ? { ...item, mediaUrl: cached.localPath }
            : item
        )
      );
    } catch (error) {
      console.error('Error downloading message media:', error);
      setUnavailableMediaByMessageId((prev) => ({ ...prev, [message.id]: true }));
      Alert.alert('Download Failed', 'Media is not available right now.');
    } finally {
      setDownloadingMediaByMessageId((prev) => ({ ...prev, [message.id]: false }));
    }
  };

  const stopAllAudio = async () => {
    try {
      const players = Object.values(playingAudio || {});
      await Promise.all(
        players.map(async (player: any) => {
          try {
            if (player?.pause) {
              await player.pause();
            }
          } catch (error) {
            console.log('Error stopping player:', error);
          }
        })
      );
      setPlayingAudio({});
    } catch (error) {
      console.error('Error stopping all audio:', error);
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

const AudioMessageBubble = ({ item, isMyMessage }: { item: ChatMessage, isMyMessage: boolean }) => {
  const player = useAudioPlayer(item.mediaUrl!);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const waveAnim = useRef(new Animated.Value(0)).current;
  const BAR_COUNT = 28;

  const getProgressFromStatus = (status: any) => {
    const current =
      status?.currentTime ??
      status?.positionMillis ??
      status?.position ??
      0;
    const duration =
      status?.duration ??
      status?.durationMillis ??
      status?.playableDurationMillis ??
      0;
    if (!duration || duration <= 0) return 0;
    return Math.max(0, Math.min(1, current / duration));
  };

  useEffect(() => {
    if (!player) return;

    const subscription = player.addListener('playbackStatusUpdate', (status: any) => {
      const currentlyPlaying = Boolean(status?.isPlaying || player.playing);
      setIsPlaying(currentlyPlaying);
      setPlaybackProgress(getProgressFromStatus(status));
      const current =
        status?.currentTime ??
        (typeof status?.positionMillis === 'number' ? status.positionMillis / 1000 : undefined) ??
        status?.position ??
        0;
      const duration =
        status?.duration ??
        (typeof status?.durationMillis === 'number' ? status.durationMillis / 1000 : undefined) ??
        (typeof status?.playableDurationMillis === 'number' ? status.playableDurationMillis / 1000 : undefined) ??
        0;
      setCurrentSeconds(Number.isFinite(current) ? current : 0);
      if (duration) {
        setDurationSeconds(Number.isFinite(duration) ? duration : 0);
      }
      if (status?.didJustFinish) {
        setIsPlaying(false);
        setPlaybackProgress(1);
      }
    });

    return () => subscription?.remove();
  }, [player]);

  useEffect(() => {
    let animationLoop: Animated.CompositeAnimation | null = null;

    if (isPlaying) {
      animationLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(waveAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      animationLoop.start();
    } else {
      waveAnim.stopAnimation();
      waveAnim.setValue(0);
      if (!player.playing) {
        setPlaybackProgress(0);
      }
    }

    return () => {
      if (animationLoop) animationLoop.stop();
    };
  }, [isPlaying, waveAnim]);

  // Simple string hash to generate consistent waveform heights
  const seededRandom = (seedStr: string, i: number) => {
    let hash = 0;
    for (let c = 0; c < seedStr.length; c++) {
      hash = ((hash << 5) - hash) + seedStr.charCodeAt(c) + i;
      hash |= 0;
    }
    const x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
  };

  const formatAudioTime = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.audioMessage}>
      <TouchableOpacity
        style={styles.audioPlayButton}
        onPress={async () => {
          if (isPlaying) {
            await player.pause();
            setIsPlaying(false);
          } else {
            await player.play();
            setIsPlaying(true);
          }
        }}
      >
        {isPlaying ? (
          <Pause size={20} color={isMyMessage ? "#ffffff" : "#ff6b9d"} />
        ) : (
          <Play size={20} color={isMyMessage ? "#ffffff" : "#ff6b9d"} />
        )}
      </TouchableOpacity>
      <View style={styles.audioWaveformBlock}>
        <View style={styles.audioWaveform}>
          {[...Array(BAR_COUNT)].map((_, i) => {
          const barProgressStart = i / BAR_COUNT;
          const barProgressEnd = (i + 1) / BAR_COUNT;
          const isPlayed = playbackProgress >= barProgressEnd;
          const isCurrent = playbackProgress >= barProgressStart && playbackProgress < barProgressEnd;
          return (
          <Animated.View
            key={i}
            style={[
              styles.audioBar,
              {
                height: seededRandom(item.id, i) * 16 + 8,
                backgroundColor: isPlayed || isCurrent
                  ? (isMyMessage ? '#ffffff' : '#ff6b9d')
                  : (isMyMessage ? 'rgba(255,255,255,0.38)' : 'rgba(255,107,157,0.35)'),
                opacity: isPlaying ? 0.92 : 0.7,
                transform: [{
                  scaleY: isPlaying
                    ? waveAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.92, 1.15],
                      })
                    : 1,
                }],
              }
            ]}
          />
        )})}
        </View>
        <Text style={[styles.audioDurationText, isMyMessage ? styles.myMessageTime : styles.theirMessageTime]}>
          {formatAudioTime(currentSeconds)} / {formatAudioTime(durationSeconds)}
        </Text>
      </View>
    </View>
  );
};

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ── WhatsApp-style elastic swipe-to-reply ────────────────────────────────
  const SwipeableMessage = ({
    children,
    onReply,
    isMyMessage,
  }: {
    children: React.ReactNode;
    onReply: () => void;
    isMyMessage: boolean;
  }) => {
    const translateX = useRef(new Animated.Value(0)).current;
    const iconScale = useRef(new Animated.Value(0)).current;
    const iconOpacity = useRef(new Animated.Value(0)).current;
    const triggered = useRef(false);
    const THRESHOLD = 72; // px before reply triggers
    const MAX_DRAG = 96;  // elastic resistance ceiling

    const onGestureEvent = Animated.event(
      [{ nativeEvent: { translationX: translateX } }],
      {
        useNativeDriver: true,
        listener: (e: any) => {
          const tx = e.nativeEvent.translationX;
          // Only allow left-swipe (negative tx for my msgs, positive for theirs)
          const drag = isMyMessage ? Math.min(0, tx) : Math.max(0, tx);
          const absDrag = Math.abs(drag);

          // Show / scale the icon proportionally
          const progress = Math.min(absDrag / THRESHOLD, 1);
          iconScale.setValue(progress);
          iconOpacity.setValue(progress);

          // Trigger haptic once at threshold
          if (absDrag >= THRESHOLD && !triggered.current) {
            triggered.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          if (absDrag < THRESHOLD) {
            triggered.current = false;
          }
        },
      }
    );

    const onHandlerStateChange = (e: any) => {
      const { state, translationX } = e.nativeEvent;
      if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        const drag = isMyMessage ? Math.min(0, translationX) : Math.max(0, translationX);
        if (Math.abs(drag) >= THRESHOLD) {
          onReply();
        }
        // Spring back
        Animated.parallel([
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 260,
            damping: 22,
            mass: 0.8,
          }),
          Animated.spring(iconScale, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 300,
            damping: 20,
          }),
          Animated.spring(iconOpacity, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 300,
            damping: 20,
          }),
        ]).start(() => { triggered.current = false; });
      }
    };

    // Rubber-band resistance: drag feels elastic past THRESHOLD
    const elasticTranslate = translateX.interpolate({
      inputRange: isMyMessage
        ? [-MAX_DRAG * 2, -THRESHOLD, 0]
        : [0, THRESHOLD, MAX_DRAG * 2],
      outputRange: isMyMessage
        ? [-MAX_DRAG, -THRESHOLD, 0]
        : [0, THRESHOLD, MAX_DRAG],
      extrapolate: 'clamp',
    });

    const iconX = isMyMessage ? MAX_DRAG - 4 : -(MAX_DRAG - 4);

    return (
      <PanGestureHandler
        activeOffsetX={isMyMessage ? [-8, 999] : [-999, 8]}
        failOffsetY={[-10, 10]}
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
      >
        <Animated.View style={{ 
          position: 'relative', 
          width: '100%',
          alignItems: isMyMessage ? 'flex-end' : 'flex-start'
        }}>
          {/* Reply icon that appears behind the bubble */}
          <Animated.View
            style={[
              styles.swipeReplyIcon,
              isMyMessage ? styles.swipeReplyIconRight : styles.swipeReplyIconLeft,
              {
                opacity: iconOpacity,
                transform: [{ scale: iconScale }],
              },
            ]}
          >
            <Reply size={20} color="#ff6b9d" />
          </Animated.View>

          {/* Bubble slides */}
          <Animated.View style={{ transform: [{ translateX: elasticTranslate }] }}>
            {children}
          </Animated.View>
        </Animated.View>
      </PanGestureHandler>
    );
  };
  // ─────────────────────────────────────────────────────────────────────────

  const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isMyMessage = item.sender === coupleData?.nickname;
    const isSelected = selectedMessage?.id === item.id;
    const estimatedWebTextBubbleWidth =
      Platform.OS === 'web' && item.type === 'text'
        ? Math.min(560, Math.max(120, (item.message?.length || 0) * 7 + 34))
        : undefined;
    
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
            borderWidth: isSelected ? 2 : highlightedMessageId === item.id ? 2 : 0,
            borderColor: isSelected ? '#ff6b9d' : '#ffd6e8',
            borderRadius: 16,
            backgroundColor: highlightedMessageId === item.id ? 'rgba(255,107,157,0.08)' : 'transparent',
          },
        ]}
      >
        <SwipeableMessage
          onReply={() => setReplyingTo(item)}
          isMyMessage={isMyMessage}
        >
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => openMessageSelection(item)}
          delayLongPress={240}
          style={[
            styles.messageBubble,
            estimatedWebTextBubbleWidth ? { width: estimatedWebTextBubbleWidth } : null,
            isMyMessage ? styles.myMessage : styles.theirMessage,
            item.type === 'audio' && styles.audioOnlyBubble,
          ]}
        >
            {item.replyTo && (() => {
              // Resolve type & mediaUrl: prefer stored snapshot, fall back to live message lookup
              const allMsgs = [...messages, ...pendingMessages];
              const origMsg = allMsgs.find(m => m.id === item.replyTo!.id);
              const resolvedType = item.replyTo.type || origMsg?.type;
              const resolvedMediaUrl = item.replyTo.mediaUrl || origMsg?.mediaUrl;
              const isImageReply = resolvedType === 'image' && resolvedMediaUrl;

              return (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => scrollToMessage(item.replyTo!.id)}
                  style={[styles.replyPreview, !isMyMessage && styles.theirReplyPreview]}
                >
                  {isImageReply ? (
                    <View style={styles.replyImageRow}>
                      <Image
                        source={{ uri: resolvedMediaUrl as string }}
                        style={styles.replyThumbnail}
                      />
                      <View style={styles.replyImageText}>
                        <Text style={[styles.replySender, !isMyMessage && styles.theirReplySender]}>{item.replyTo.sender}</Text>
                        <Text style={[styles.replyMessage, !isMyMessage && styles.theirReplyMessage]} numberOfLines={1}>📸 Photo</Text>
                      </View>
                    </View>
                  ) : resolvedType === 'audio' ? (
                    <>
                      <Text style={[styles.replySender, !isMyMessage && styles.theirReplySender]}>{item.replyTo.sender}</Text>
                      <Text style={[styles.replyMessage, !isMyMessage && styles.theirReplyMessage]} numberOfLines={1}>🎵 Voice message</Text>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.replySender, !isMyMessage && styles.theirReplySender]}>{item.replyTo.sender}</Text>
                      <Text style={[styles.replyMessage, !isMyMessage && styles.theirReplyMessage]} numberOfLines={1}>{item.replyTo.message}</Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })()}

            {item.pinned && (
              <View style={styles.pinnedRow}>
                <Pin size={12} color={isMyMessage ? '#ffffff' : '#666666'} />
                <Text style={[styles.pinnedLabel, isMyMessage ? styles.myMessageTime : styles.theirMessageTime]}>Pinned</Text>
              </View>
            )}

            {item.type === 'image' && (item.media || item.mediaUrl) && (
              <>
                {item.mediaUrl && !unavailableMediaByMessageId[item.id] ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      setSelectedImageUrl(item.mediaUrl || null);
                      setSelectedImageMessage(item);
                    }}
                  >
                    <Image
                      source={{ uri: item.mediaUrl }}
                      style={styles.messageImage}
                      onError={() => {
                        setUnavailableMediaByMessageId((prev) => ({ ...prev, [item.id]: true }));
                      }}
                    />
                  </TouchableOpacity>
                ) : downloadingMediaByMessageId[item.id] ? (
                  <View style={styles.mediaImagePlaceholder}>
                    <ActivityIndicator
                      size="small"
                      color={isMyMessage ? '#ffffff' : '#ff6b9d'}
                      style={styles.mediaLoadingSpinner}
                    />
                    <Text style={styles.mediaPlaceholderEmoji}>🖼️</Text>
                    <Text style={styles.mediaPlaceholderText}>Downloading image...</Text>
                  </View>
                ) : unavailableMediaByMessageId[item.id] ? (
                  <View style={styles.mediaImagePlaceholder}>
                    <Text style={styles.mediaPlaceholderEmoji}>🖼️</Text>
                    <Text style={styles.notAvailableText}>Not available</Text>
                  </View>
                ) : item.media ? (
                  <View style={styles.mediaImagePlaceholder}>
                    <Text style={styles.mediaPlaceholderEmoji}>🖼️</Text>
                    <Text style={styles.mediaPlaceholderText}>Image not downloaded</Text>
                    <TouchableOpacity
                      style={[
                        styles.mediaOverlayDownloadButton,
                        isMyMessage ? styles.mediaOverlayDownloadButtonMine : styles.mediaOverlayDownloadButtonTheirs,
                      ]}
                      onPress={() => downloadMessageMedia(item)}
                    >
                      <Download size={14} color={isMyMessage ? '#ffffff' : '#ff6b9d'} />
                      <Text style={[styles.mediaOverlayDownloadText, isMyMessage ? styles.myMessageTime : styles.theirMessageTime]}>Download</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.mediaImagePlaceholder}>
                    <Text style={styles.mediaPlaceholderEmoji}>🖼️</Text>
                    <Text style={styles.notAvailableText}>Not available</Text>
                  </View>
                )}
                {/* Footer row for image messages (inside the padded bubble) */}
                <View style={styles.imageMessageFooter}>
                  {item.edited && <Text style={[styles.messageTime, isMyMessage ? styles.myMessageTime : styles.theirMessageTime]}>Edited </Text>}
                  <Text style={[styles.messageTime, isMyMessage ? styles.myMessageTime : styles.theirMessageTime, (item as any)._sending && styles.messageTimeFaded]}>
                    {(item as any)._sending
                      ? new Date((item.timestamp as any).toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : item.timestamp && (item.timestamp as any).seconds
                        ? new Date(item.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : ''}
                  </Text>
                  {isMyMessage && (() => {
                    const st = getMessageStatus(item as any);
                    if (st === 'Sending') return <Text style={styles.sendingClock}>🕐</Text>;
                    if (st === 'Failed') return (
                      <TouchableOpacity style={styles.failedRetryWrap} onPress={() => retryFailedMessage(item as PendingChatMessage)}>
                        <Text style={styles.failedIcon}>⚠️</Text>
                        <Text style={[styles.failedRetryText, isMyMessage ? styles.myMessageTime : styles.theirMessageTime]}>Retry</Text>
                      </TouchableOpacity>
                    );
                    if (st === 'Read') return <CheckCheck size={11} color={isMyMessage ? '#ffffff' : '#888'} />;
                    return <Check size={11} color={isMyMessage ? 'rgba(255,255,255,0.7)' : '#aaa'} />;
                  })()}
                </View>
              </>
            )}
            
            {item.type === 'audio' && (item.media || item.mediaUrl) && (
              item.mediaUrl && !unavailableMediaByMessageId[item.id] ? (
                <AudioMessageBubble item={item} isMyMessage={isMyMessage} />
              ) : downloadingMediaByMessageId[item.id] ? (
                <View style={styles.mediaAudioPlaceholder}>
                  <ActivityIndicator
                    size="small"
                    color={isMyMessage ? '#ffffff' : '#ff6b9d'}
                    style={styles.mediaLoadingSpinner}
                  />
                  <Mic size={18} color={isMyMessage ? '#ffffff' : '#ff6b9d'} />
                  <Text style={styles.mediaPlaceholderText}>Downloading audio...</Text>
                </View>
              ) : unavailableMediaByMessageId[item.id] ? (
                <View style={styles.mediaAudioPlaceholder}>
                  <Mic size={18} color={isMyMessage ? '#ffffff' : '#ff6b9d'} />
                  <Text style={styles.notAvailableText}>Not available</Text>
                </View>
              ) : item.media ? (
                <View style={styles.mediaAudioPlaceholder}>
                  <Mic size={18} color={isMyMessage ? '#ffffff' : '#ff6b9d'} />
                  <Text style={styles.mediaPlaceholderText}>Voice note not downloaded</Text>
                  <TouchableOpacity
                    style={[
                      styles.mediaInlineDownloadButton,
                      isMyMessage ? styles.mediaOverlayDownloadButtonMine : styles.mediaOverlayDownloadButtonTheirs,
                    ]}
                    onPress={() => downloadMessageMedia(item)}
                  >
                    <Download size={14} color={isMyMessage ? '#ffffff' : '#ff6b9d'} />
                    <Text style={[styles.mediaOverlayDownloadText, isMyMessage ? styles.myMessageTime : styles.theirMessageTime]}>Download</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.mediaAudioPlaceholder}>
                  <Mic size={18} color={isMyMessage ? '#ffffff' : '#ff6b9d'} />
                  <Text style={styles.notAvailableText}>Not available</Text>
                </View>
              )
            )}
            
            {item.type === 'text' && (
              <Text style={[
                styles.messageText,
                isMyMessage ? styles.myMessageText : styles.theirMessageText,
                item.deleted && styles.deletedMessageText,
              ]}>
                {item.message}
              </Text>
            )}
            
            {/* Footer: only for text/audio — image messages have their own footer above */}
            {item.type !== 'image' && (
            <View style={styles.messageFooter}>
              {item.edited && (
                <Text style={[styles.messageTime, isMyMessage ? styles.myMessageTime : styles.theirMessageTime]}>
                  Edited
                </Text>
              )}
              <Text style={[
                styles.messageTime,
                isMyMessage ? styles.myMessageTime : styles.theirMessageTime,
                (item as any)._sending && styles.messageTimeFaded,
              ]}>
                {(item as any)._sending
                  ? new Date((item.timestamp as any).toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : item.timestamp && (item.timestamp as any).seconds
                    ? new Date(item.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : ''}
              </Text>
              {isMyMessage && (() => {
                const status = getMessageStatus(item as any);
                if (status === 'Sending') {
                  return (
                    <View style={styles.statusIconWrap}>
                      <Text style={styles.sendingClock}>🕐</Text>
                    </View>
                  );
                }
                if (status === 'Failed') {
                  return (
                    <TouchableOpacity
                      style={[styles.statusIconWrap, styles.failedRetryWrap]}
                      onPress={() => retryFailedMessage(item as PendingChatMessage)}
                    >
                      <Text style={styles.failedIcon}>⚠️</Text>
                      <Text style={[styles.failedRetryText, isMyMessage ? styles.myMessageTime : styles.theirMessageTime]}>Retry</Text>
                    </TouchableOpacity>
                  );
                }
                if (status === 'Read') {
                  return (
                    <View style={styles.statusIconWrap}>
                      <CheckCheck size={12} color="#ffffff" />
                    </View>
                  );
                }
                return (
                  <View style={styles.statusIconWrap}>
                    <Check size={12} color="rgba(255,255,255,0.7)" />
                  </View>
                );
              })()}
            </View>
            )}
          </TouchableOpacity>
        </SwipeableMessage>

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
          {selectedMessage ? (
            <>
              <TouchableOpacity onPress={clearSelection} style={styles.selectionCancelButton}>
                <X size={20} color="#ffffff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>1 selected</Text>
              <TouchableOpacity
                onPress={() => setShowActionMenu(true)}
                style={styles.notificationButton}
              >
                <MoreVertical size={18} color="#ffffff" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Heart size={24} color="#ffffff" />
              <Text style={styles.headerTitle}>Our Chat 💕</Text>
              <TouchableOpacity
                onPress={requestNotificationPermission}
                style={styles.notificationButton}
              >
                <Text style={styles.notificationText}>🔔</Text>
              </TouchableOpacity>
            </>
          )}
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
                data={[...messages, ...pendingMessages.filter(p => !messages.some(m => m.id === p.id))]}
                renderItem={renderMessage}
                keyExtractor={(item) => (item as any)._tempId || item.id}
                style={styles.messagesList}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
                onScrollToIndexFailed={({ index }) => {
                  // Item not yet rendered — scroll to end then retry
                  flatListRef.current?.scrollToEnd({ animated: false });
                  setTimeout(() => {
                    flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 });
                  }, 300);
                }}
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
            {replyingTo && (
              <View style={styles.replyingBanner}>
                {replyingTo.type === 'image' && replyingTo.mediaUrl ? (
                  <Image source={{ uri: replyingTo.mediaUrl }} style={styles.replyingThumbnail} />
                ) : null}
                <View style={styles.replyingTextWrap}>
                  <Text style={styles.replyingTitle}>Replying to {replyingTo.sender}</Text>
                  {replyingTo.type === 'image' ? (
                    <Text style={styles.replyingText} numberOfLines={1}>📸 Photo</Text>
                  ) : replyingTo.type === 'audio' ? (
                    <Text style={styles.replyingText} numberOfLines={1}>🎵 Voice message</Text>
                  ) : (
                    <Text style={styles.replyingText} numberOfLines={1}>{replyingTo.message}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyingClose}>
                  <X size={14} color="#666" />
                </TouchableOpacity>
              </View>
            )}
            {editingMessage && (
              <View style={styles.replyingBanner}>
                <View style={styles.replyingTextWrap}>
                  <Text style={styles.replyingTitle}>Editing message</Text>
                  <Text style={styles.replyingText} numberOfLines={1}>{editingMessage.message}</Text>
                </View>
                <TouchableOpacity onPress={() => { setEditingMessage(null); setInputText(''); }} style={styles.replyingClose}>
                  <X size={14} color="#666" />
                </TouchableOpacity>
              </View>
            )}
            {isRecording && (
              <View style={styles.recordingIndicator}>
                {!isRecordingPaused && <View style={styles.recordingDot} />}
                <Text style={styles.recordingText}>
                  {isRecordingPaused ? 'Paused' : 'Recording...'} {formatDuration(recordingDuration)}
                </Text>
                <TouchableOpacity
                  onPress={isRecordingPaused ? startRecording : pauseRecording}
                  style={styles.pauseResumeButton}
                >
                  {isRecordingPaused ? (
                    <Play size={16} color="#ff6b6b" />
                  ) : (
                    <Pause size={16} color="#ff6b6b" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={stopRecording} style={styles.stopRecordingButton}>
                  <Square size={16} color="#ff6b6b" fill="#ff6b6b" />
                </TouchableOpacity>
              </View>
            )}
            {!isRecording && currentRecordingUri && (
              <View style={styles.recordingIndicator}>
                <Text style={styles.recordingText}>Voice clip ready • {formatDuration(recordingDuration)}</Text>
              </View>
            )}
            {isUploadingOutgoingMedia && (
              <View style={styles.uploadingIndicator}>
                <ActivityIndicator size="small" color="#ff6b9d" />
                <Text style={styles.uploadingText}>
                  {uploadingMediaKind === 'audio' ? 'Sending voice memo...' : 'Sending photo...'}
                </Text>
              </View>
            )}
            
            <View style={styles.inputWrapper}>
              <TouchableOpacity
                style={[styles.mediaButton, isUploadingOutgoingMedia && styles.mediaButtonDisabled]}
                onPress={pickImage}
                disabled={isUploadingOutgoingMedia || isRecording}
              >
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
                editable={!isRecording && !isUploadingOutgoingMedia}
              />
              
              <TouchableOpacity 
                style={[styles.mediaButton, isUploadingOutgoingMedia && styles.mediaButtonDisabled]} 
                onPress={isRecording ? (isRecordingPaused ? startRecording : pauseRecording) : startRecording}
                disabled={isUploadingOutgoingMedia}
              >
                <Mic size={20} color={isRecording ? "#ff6b6b" : "#ff6b9d"} />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.sendButton, !inputText.trim() && !currentRecordingUri && styles.sendButtonDisabled]}
                onPress={() => {
                  if (inputText.trim()) {
                    void sendMessage();
                  } else if (currentRecordingUri) {
                    void sendRecordedAudio();
                  }
                }}
                disabled={(!inputText.trim() && !currentRecordingUri) || isRecording || isUploadingOutgoingMedia}
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

        <Modal
          visible={!!selectedImageUrl}
          transparent
          animationType="fade"
          onRequestClose={closeImageViewer}
        >
          <View style={styles.imageViewerOverlay}>
            <TouchableOpacity
              style={styles.imageViewerClose}
              onPress={closeImageViewer}
            >
              <X size={24} color="#ffffff" />
            </TouchableOpacity>
            {selectedImageUrl && (
              <Image
                source={{ uri: selectedImageUrl }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
            )}
            <View style={styles.imageReplyBar}>
              <TextInput
                style={styles.imageReplyInput}
                placeholder="Reply to this photo..."
                placeholderTextColor="#a0a0a0"
                value={imageReplyText}
                onChangeText={setImageReplyText}
              />
              <TouchableOpacity
                style={[styles.imageReplySend, !imageReplyText.trim() && styles.sendButtonDisabled]}
                onPress={sendImageReply}
                disabled={!imageReplyText.trim()}
              >
                <Send size={16} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {selectedMessage && (
          <Modal transparent animationType="fade" visible={!!selectedMessage} onRequestClose={clearSelection}>
            <TouchableOpacity
              style={styles.reactionModalOverlay}
              activeOpacity={1}
              onPress={clearSelection}
            >
              <View style={styles.reactionModalCard}>
                <View style={styles.quickReactionsRow}>
                  {QUICK_REACTIONS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() => {
                        addReaction(selectedMessage.id, emoji);
                        clearSelection();
                      }}
                      style={styles.quickReactionButton}
                    >
                      <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={styles.quickReactionButton} onPress={() => setShowEmojiPicker(true)}>
                    <Text style={styles.quickReactionEmoji}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        <Modal transparent animationType="slide" visible={showEmojiPicker} onRequestClose={() => setShowEmojiPicker(false)}>
          <View style={styles.emojiSelectorSheet}>
            <View style={styles.emojiSelectorHeader}>
              <Text style={styles.emojiPickerTitle}>Choose reaction</Text>
              <TouchableOpacity onPress={() => setShowEmojiPicker(false)}>
                <Text style={styles.closeSheetText}>Close</Text>
              </TouchableOpacity>
            </View>
            <EmojiSelector
              showSearchBar
              showSectionTitles={false}
              showHistory
              columns={6}
              onEmojiSelected={(emoji: string) => {
                if (selectedMessage) {
                  addReaction(selectedMessage.id, emoji);
                }
                setShowEmojiPicker(false);
                clearSelection();
              }}
            />
          </View>
        </Modal>

        <Modal transparent animationType="fade" visible={showActionMenu} onRequestClose={() => setShowActionMenu(false)}>
          <TouchableOpacity style={styles.reactionModalOverlay} activeOpacity={1} onPress={() => setShowActionMenu(false)}>
            <View style={styles.actionsCard}>
              <TouchableOpacity style={styles.actionRow} onPress={handleReply}>
                <Reply size={16} color="#333" />
                <Text style={styles.actionText}>Reply</Text>
              </TouchableOpacity>
              {selectedMessage?.type === 'text' && (
                <TouchableOpacity style={styles.actionRow} onPress={handleCopy}>
                  <Copy size={16} color="#333" />
                  <Text style={styles.actionText}>Copy</Text>
                </TouchableOpacity>
              )}
              {selectedMessage?.sender === coupleData?.nickname && selectedMessage?.type === 'text' && (
                <TouchableOpacity style={styles.actionRow} onPress={handleEdit}>
                  <Pencil size={16} color="#333" />
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionRow} onPress={handlePin}>
                <Pin size={16} color="#333" />
                <Text style={styles.actionText}>{selectedMessage?.pinned ? 'Unpin' : 'Pin'}</Text>
              </TouchableOpacity>
              {selectedMessage?.sender === coupleData?.nickname && (
                <TouchableOpacity style={styles.actionRow} onPress={handleDelete}>
                  <Trash2 size={16} color="#ff6b6b" />
                  <Text style={styles.deleteActionText}>Delete</Text>
                </TouchableOpacity>
              )}
              {selectedMessage && (
                <View style={styles.statusRow}>
                  <Text style={styles.statusText}>Status: {getMessageStatus(selectedMessage) || 'Delivered'}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
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
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    borderRadius: 18,
  },
  notificationText: {
    fontSize: 16,
  },
  selectionCancelButton: {
    padding: 6,
    marginRight: 8,
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
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 100,
  },
  messageContainer: {
    marginBottom: 8,
  },
  myMessageContainer: {
    alignItems: 'flex-end',
  },
  theirMessageContainer: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: Platform.OS === 'web' ? '90%' : '92%',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  audioOnlyBubble: {
    minWidth: 280,
    width: '82%',
  },
  myMessage: {
    backgroundColor: '#ff6b9d',
  },
  theirMessage: {
    backgroundColor: '#ffffff',
  },
  messageImage: {
    width: 240,
    maxWidth: '100%',
    aspectRatio: 1,
    height: 'auto',
    borderRadius: 8,
    marginBottom: 4,
  },
  mediaDownloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    marginBottom: 4,
  },
  mediaDownloadText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  mediaImagePlaceholder: {
    width: 240,
    maxWidth: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 4,
  },
  mediaAudioPlaceholder: {
    borderRadius: 8,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 4,
    paddingVertical: 10,
    gap: 8,
  },
  mediaPlaceholderEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  mediaLoadingSpinner: {
    marginBottom: 4,
  },
  mediaOverlayDownloadButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
  },
  mediaInlineDownloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  mediaOverlayDownloadButtonMine: {
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  mediaOverlayDownloadButtonTheirs: {
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  mediaOverlayDownloadText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
  },
  mediaPlaceholderBox: {
    minHeight: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 4,
  },
  mediaPlaceholderText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  notAvailableText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#ffe6ee',
  },
  imageMessageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  audioMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    minWidth: 220,
    width: '100%',
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
    minHeight: 24,
  },
  audioWaveformBlock: {
    flex: 1,
  },
  audioBar: {
    width: 3,
    marginHorizontal: 1,
    borderRadius: 1.5,
  },
  audioDurationText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
    alignSelf: 'flex-end',
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
    color: '#111b21',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  messageTime: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginRight: 6,
    flexShrink: 0,
  },
  myMessageTime: {
    color: '#ffffff',
    opacity: 0.7,
  },
  theirMessageTime: {
    color: '#667781',
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
    marginTop: 4,
  },
  reactionItem: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 4,
    borderWidth: 1,
    borderColor: '#d9d9d9',
  },
  reactionText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  replyPreview: {
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(255,255,255,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
    minHeight: 46,
    justifyContent: 'center',
  },
  theirReplyPreview: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderLeftColor: '#ff6b9d',
  },
  replySender: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginBottom: 2,
  },
  theirReplySender: {
    color: '#c44569',
  },
  replyMessage: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
  },
  theirReplyMessage: {
    color: '#555',
  },
  replyImageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replyThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  replyImageText: {
    flexShrink: 1,
    justifyContent: 'center',
  },
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  pinnedLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  deletedMessageText: {
    fontStyle: 'italic',
    opacity: 0.8,
  },
  statusIconWrap: {
    marginLeft: 2,
    marginTop: 1,
  },
  sendingClock: {
    fontSize: 9,
    opacity: 0.6,
    lineHeight: 13,
  },
  failedIcon: {
    fontSize: 10,
    lineHeight: 13,
  },
  failedRetryWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  failedRetryText: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
  },
  messageTimeFaded: {
    opacity: 0.5,
  },
  replyingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff1f7',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  replyingTextWrap: {
    flex: 1,
  },
  replyingTitle: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#c44569',
  },
  replyingText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#666',
    marginTop: 2,
  },
  replyingClose: {
    padding: 4,
  },
  replyingThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: '#e0e0e0',
  },
  reactionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  reactionModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 10,
    width: '95%',
  },
  quickReactionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  quickReactionButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  quickReactionEmoji: {
    fontSize: 28,
  },
  emojiPickerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '90%',
    maxHeight: '70%',
    padding: 16,
  },
  emojiPickerTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    marginBottom: 0,
    textAlign: 'left',
  },
  emojiSelectorSheet: {
    flex: 1,
    marginTop: 120,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  emojiSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  closeSheetText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#ff6b9d',
  },
  actionsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '88%',
    padding: 14,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
  },
  actionText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: '#333',
  },
  deleteActionText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: '#ff6b6b',
  },
  statusRow: {
    paddingTop: 10,
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#888',
    textAlign: 'center',
  },
  inputContainer: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#f0f2f5',
    borderTopWidth: 1,
    borderTopColor: '#d9dbdf',
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
  uploadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff1f7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  uploadingText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#c44569',
  },
  stopRecordingButton: {
    padding: 4,
  },
  pauseResumeButton: {
    padding: 4,
    marginRight: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 2,
  },
  mediaButton: {
    padding: 8,
    marginHorizontal: 4,
  },
  mediaButtonDisabled: {
    opacity: 0.45,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    maxHeight: 120,
    paddingVertical: 10,
    color: '#111b21',
  },
  sendButton: {
    borderRadius: 20,
    margin: 4,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: 8,
  },
  fullscreenImage: {
    width: '100%',
    height: '85%',
  },
  imageReplyBar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  imageReplyInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#333',
    paddingVertical: 8,
  },
  imageReplySend: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ff6b9d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFooterOverlay: {
    position: 'absolute',
    bottom: 6,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  imageOverlayTime: {
    fontSize: 11,
    color: '#ffffff',
    fontFamily: 'Inter-Regular',
  },
  swipeReplyIcon: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,107,157,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  swipeReplyIconRight: {
    right: 6,
  },
  swipeReplyIconLeft: {
    left: 6,
  },
});