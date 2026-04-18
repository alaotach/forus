import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  Animated,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  PermissionsAndroid,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Archive, Plus, FileText, Image as ImageIcon, Mic, Heart, Star, X, Send, MoreVertical, Edit2, Trash2, Download } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCouple } from '@/hooks/useCouple';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { VaultItem } from '@/types/app';
import * as ImagePicker from 'expo-image-picker';
import { useAudioRecorder, useAudioPlayer } from 'expo-audio';
import AudioPlayer from '@/components/AudioPlayer';
import { checkStorageQuota } from '@/services/storage';
import { uploadPhotoMedia, uploadAudioMedia } from '@/services/mediaUpload';
import { deleteMediaById, streamAndCacheMedia, getCachedFile, saveCachedMediaToDevice, deleteFromCache } from '@/services/media';
import * as Audio from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VAULT_OFFLINE_CACHE_PREFIX = 'vault_offline_v1:';

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

function serializeVaultItemsForOffline(items: VaultItem[]) {
  return items.map((item) => ({
    ...item,
    timestampMs: toMillis((item as any).timestamp),
  }));
}

function deserializeVaultItemsFromOffline(raw: any[]): VaultItem[] {
  return (raw || []).map((item) => {
    const restored: any = {
      ...item,
      timestamp: toTimestampLike(item.timestampMs),
    };
    delete restored.timestampMs;
    return restored as VaultItem;
  });
}

export default function VaultScreen() {
  const { coupleData, isConnected, isLoading } = useCouple();
  const router = useRouter();
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'letters' | 'photos' | 'audios'>('all');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  
  // Modal states
  const [showLetterModal, setShowLetterModal] = useState(false);
  const [letterContent, setLetterContent] = useState('');
  const [letterTitle, setLetterTitle] = useState('');
  const [isUploadingLetter, setIsUploadingLetter] = useState(false);
  
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [selectedVaultItem, setSelectedVaultItem] = useState<VaultItem | null>(null);
  const [optionsModalVisible, setOptionsModalVisible] = useState(false);
  const [editNameModalVisible, setEditNameModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [currentRecordingUri, setCurrentRecordingUri] = useState<string | null>(null);
  const [uploadingMediaKind, setUploadingMediaKind] = useState<'photo' | 'audio' | null>(null);
  const [downloadingItemById, setDownloadingItemById] = useState<Record<string, boolean>>({});
  const [unavailableItemById, setUnavailableItemById] = useState<Record<string, boolean>>({});
  const uploadedLocalMediaPathByFileKeyRef = useRef<Record<string, string>>({});
  const uploadedLocalMediaPathByMediaIdRef = useRef<Record<string, string>>({});
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  const isUploadingMedia = uploadingMediaKind !== null;

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

  const recorder = useAudioRecorder(recordingOptions as any);

  const requestAudioPermission = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    } catch (error) {
      console.error('Error setting audio mode:', error);
    }
  };

  useEffect(() => {
    // Set up audio mode on mount
    requestAudioPermission();
  }, []);

  useEffect(() => {
    // Wait for loading to complete
    if (isLoading) {
      return;
    }

    // Check connection and redirect if needed
    if (!isConnected || !coupleData) {
      console.log('Vault: Not connected, redirecting to auth');
      router.replace('/(auth)/auth');
      return;
    }

    const offlineCacheKey = `${VAULT_OFFLINE_CACHE_PREFIX}${coupleData.coupleCode}`;
    // Render cached vault list immediately for cold-start offline behavior.
    AsyncStorage.getItem(offlineCacheKey)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const restored = deserializeVaultItemsFromOffline(parsed);
        if (restored.length > 0) {
          setVaultItems(restored);
        }
      })
      .catch((error) => {
        console.log('Vault offline cache read skipped:', error?.message || error);
      });

    const vaultRef = collection(db, 'vault', coupleData.coupleCode, 'items');
    const q = query(vaultRef, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const rawItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as VaultItem[];

      const hydratedItems = await Promise.all(
        rawItems.map(async (item) => {
          if (item.media?.mediaId && coupleData?.coupleCode && coupleData?.nickname) {
            try {
              if (item.media.fileKey) {
                const cachedPath = await getCachedFile(item.media.fileKey);
                if (cachedPath) {
                  return { ...item, url: cachedPath };
                }

                if (item.author === coupleData.nickname) {
                  const localPathByFileKey = uploadedLocalMediaPathByFileKeyRef.current[item.media.fileKey];
                  if (localPathByFileKey) {
                    return { ...item, url: localPathByFileKey };
                  }
                }
              }

              if (item.author === coupleData.nickname && item.media.mediaId) {
                const localPathByMediaId = uploadedLocalMediaPathByMediaIdRef.current[item.media.mediaId];
                if (localPathByMediaId) {
                  return { ...item, url: localPathByMediaId };
                }
              }

              return { ...item, url: undefined };
            } catch {
              return item;
            }
          }

          return item;
        })
      );

      setVaultItems(hydratedItems);
      AsyncStorage.setItem(offlineCacheKey, JSON.stringify(serializeVaultItemsForOffline(hydratedItems))).catch((error) => {
        console.log('Vault offline cache write skipped:', error?.message || error);
      });
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

    return () => unsubscribe();
  }, [isConnected, isLoading, coupleData]);

  // Show loading state while checking connection
  if (isLoading) {
    return (
      <LinearGradient colors={['#fd79a8', '#fdcb6e']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Archive size={48} color="#ffffff" />
            <Text style={styles.loadingText}>Loading your vault...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Don't render if not connected (will redirect)
  if (!isConnected || !coupleData) {
    return null;
  }

  const filteredItems = activeTab === 'all' ? vaultItems : vaultItems.filter(item => item.type + 's' === activeTab);

  const handleAddItem = async (type: 'letter' | 'photo' | 'audio') => {
    if (!coupleData) return;
    if (isUploadingMedia) return;
    
    // Check storage quota
    const quota = await checkStorageQuota(coupleData.coupleCode);
    if (!quota.isWithinQuota) {
      Alert.alert(
        'Storage Limit Reached',
        `You have used ${quota.used}MB of your ${quota.quota}MB limit. Please upgrade your plan or delete some items to add more.`,
        [{ text: 'OK' }]
      );
      return;
    }

    if (type === 'letter') {
      setLetterTitle('');
      setLetterContent('');
      setShowLetterModal(true);
    } else if (type === 'photo') {
      pickImage();
    } else if (type === 'audio') {
      setShowAudioModal(true);
      setIsRecording(false);
      setIsRecordingPaused(false);
      setRecordingDuration(0);
      setCurrentRecordingUri(null);
    }
  };

  const pickImage = async () => {
    if (isUploadingMedia) return;
    try {
      let result;
      try {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
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
        await uploadPhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadPhoto = async (uri: string) => {
    if (!coupleData || isUploadingMedia) return;
    
    try {
      setUploadingMediaKind('photo');
      const media = await uploadPhotoMedia(uri, {
        userId: coupleData.nickname,
        coupleCode: coupleData.coupleCode,
      });

      if (media?.fileKey) {
        uploadedLocalMediaPathByFileKeyRef.current[media.fileKey] = uri;
      }
      if (media?.mediaId) {
        uploadedLocalMediaPathByMediaIdRef.current[media.mediaId] = uri;
      }

      const vaultRef = collection(db, 'vault', coupleData.coupleCode, 'items');
      await addDoc(vaultRef, {
        type: 'photo',
        title: `Photo from ${new Date().toLocaleDateString()}`,
        author: coupleData.nickname,
        media,
        timestamp: serverTimestamp(),
        favorite: false,
        tags: ['memory'],
      });

      // Send notification to partner
      try {
        const { notifyMemory } = await import('@/services/notifications');
        await notifyMemory(coupleData.coupleCode, coupleData.nickname, 'photo');
      } catch (error) {
        console.log('Notification error:', error);
      }

      Alert.alert('Success', '✨ Photo saved to your vault!');
    } catch (error) {
      console.error('Error uploading photo:', error);
      Alert.alert('Error', 'Failed to upload photo');
    } finally {
      setUploadingMediaKind(null);
    }
  };

  const saveLetter = async () => {
    if (!coupleData || !letterTitle.trim() || !letterContent.trim()) {
      Alert.alert('Missing fields', 'Please add a title and content');
      return;
    }

    try {
      setIsUploadingLetter(true);
      const vaultRef = collection(db, 'vault', coupleData.coupleCode, 'items');
      await addDoc(vaultRef, {
        type: 'letter',
        title: letterTitle.trim(),
        content: letterContent.trim(),
        author: coupleData.nickname,
        timestamp: serverTimestamp(),
        favorite: false,
        tags: ['letter'],
      });

      // Send notification to partner
      try {
        const { notifyMemory } = await import('@/services/notifications');
        await notifyMemory(coupleData.coupleCode, coupleData.nickname, 'letter');
      } catch (error) {
        console.log('Notification error:', error);
      }

      setShowLetterModal(false);
      setLetterTitle('');
      setLetterContent('');
      Alert.alert('Success', '💌 Letter saved to your vault!');
    } catch (error) {
      console.error('Error saving letter:', error);
      Alert.alert('Error', 'Failed to save letter');
    } finally {
      setIsUploadingLetter(false);
    }
  };

  const closeAudioModal = async () => {
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
      recordingTimer.current = null;
    }

    if (recorder && isRecording) {
      try {
        await recorder.stop();
      } catch {
        // no-op
      }
    }

    setIsRecording(false);
    setIsRecordingPaused(false);
    setCurrentRecordingUri(null);
    setRecordingDuration(0);
    setShowAudioModal(false);
  };

  const startRecording = async () => {
    try {
      if (!recorder) {
        Alert.alert('Error', 'Recorder not available');
        return;
      }

      // Resume from paused state without restarting the clip.
      if (isRecording && isRecordingPaused) {
        recorder.record();
        setIsRecordingPaused(false);
        recordingTimer.current = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);
        return;
      }

      if (Platform.OS === 'android') {
        const androidPermission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'Forus needs microphone access to record voice memos.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );

        if (androidPermission !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission needed', 'Microphone permission is required to record audio.');
          return;
        }
      }

      const requestRecordingPermissions =
        (Audio as any)?.requestRecordingPermissionsAsync ||
        (Audio as any)?.requestPermissionsAsync;

      if (typeof requestRecordingPermissions === 'function') {
        const permission = await requestRecordingPermissions();
        const granted = permission?.granted === true || permission?.status === 'granted';
        if (!granted) {
          Alert.alert('Permission needed', 'Microphone permission is required to record audio.');
          return;
        }
      }

      // Make sure audio mode is set
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      console.log('Starting recording...');
      await recorder.prepareToRecordAsync(recordingOptions as any);
      recorder.record();
      
      setIsRecording(true);
      setIsRecordingPaused(false);
      setRecordingDuration(0);

      recordingTimer.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert('Error', `Failed to start recording: ${error}`);
    }
  };

  const pauseRecording = async () => {
    try {
      if (!recorder || !isRecording || isRecordingPaused) return;

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
    try {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
      
      if (recorder && isRecording) {
        console.log('Stopping recording...');
        await recorder.stop();

        // Get the recording URI
        const recordingURI = recorder.uri;
        if (recordingURI) {
          setCurrentRecordingUri(recordingURI);
          console.log('Recording saved to:', recordingURI);
        } else {
          Alert.alert('Error', 'Failed to get recording URI');
        }
        
        setIsRecording(false);
        setIsRecordingPaused(false);
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert('Error', `Failed to stop recording: ${error}`);
    }
  };

  const saveAudio = async () => {
    if (!coupleData || !currentRecordingUri || isUploadingMedia) {
      Alert.alert('Error', 'No audio recorded');
      return;
    }

    try {
      setUploadingMediaKind('audio');
      const media = await uploadAudioMedia(currentRecordingUri, {
        userId: coupleData.nickname,
        coupleCode: coupleData.coupleCode,
      });

      if (media?.fileKey) {
        uploadedLocalMediaPathByFileKeyRef.current[media.fileKey] = currentRecordingUri;
      }
      if (media?.mediaId) {
        uploadedLocalMediaPathByMediaIdRef.current[media.mediaId] = currentRecordingUri;
      }

      const vaultRef = collection(db, 'vault', coupleData.coupleCode, 'items');
      await addDoc(vaultRef, {
        type: 'audio',
        title: `Voice memo from ${new Date().toLocaleDateString()}`,
        author: coupleData.nickname,
        media,
        duration: recordingDuration,
        timestamp: serverTimestamp(),
        favorite: false,
        tags: ['voice-memo'],
      });

      // Send notification to partner
      try {
        const { notifyMemory } = await import('@/services/notifications');
        await notifyMemory(coupleData.coupleCode, coupleData.nickname, 'audio');
      } catch (error) {
        console.log('Notification error:', error);
      }

      setShowAudioModal(false);
      setCurrentRecordingUri(null);
      setIsRecordingPaused(false);
      setRecordingDuration(0);
      Alert.alert('Success', '🎤 Voice memo saved to your vault!');
    } catch (error) {
      console.error('Error saving audio:', error);
      Alert.alert('Error', 'Failed to save audio');
    } finally {
      setUploadingMediaKind(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleUpdateName = async () => {
    if (!coupleData || !selectedVaultItem || !newItemName.trim()) return;
    try {
      const itemRef = doc(db, 'vault', coupleData.coupleCode, 'items', selectedVaultItem.id);
      await updateDoc(itemRef, { title: newItemName });
      setEditNameModalVisible(false);
      setOptionsModalVisible(false);
      setSelectedVaultItem(null);
      setNewItemName('');
    } catch (error) {
      console.error('Error updating name:', error);
      Alert.alert('Error', 'Failed to update name');
    }
  };

  const handleDeleteItem = async () => {
    if (!coupleData || !selectedVaultItem) return;
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this memory? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              if (selectedVaultItem.media?.mediaId) {
                await deleteMediaById(
                  selectedVaultItem.media.mediaId,
                  coupleData.coupleCode,
                  coupleData.nickname
                );

                if (selectedVaultItem.media.fileKey) {
                  await deleteFromCache(selectedVaultItem.media.fileKey);
                }
              }

              const itemRef = doc(db, 'vault', coupleData.coupleCode, 'items', selectedVaultItem.id);
              await deleteDoc(itemRef);
              setOptionsModalVisible(false);
              setSelectedVaultItem(null);
            } catch (error) {
              console.error('Error deleting item:', error);
              Alert.alert('Error', 'Failed to delete item');
            }
          }
        }
      ]
    );
  };

  const handleSaveToDevice = async () => {
    if (!coupleData || !selectedVaultItem?.media) return;

    try {
      if (Platform.OS === 'web') {
        Alert.alert('Not supported', 'Save to device is not supported on web.');
        return;
      }

      await streamAndCacheMedia(
        selectedVaultItem.media.mediaId,
        coupleData.coupleCode,
        coupleData.nickname
      );

      const destination = await saveCachedMediaToDevice(selectedVaultItem.media.fileKey, selectedVaultItem.media.type);
      const updatedItems = vaultItems.map((item) =>
        item.id === selectedVaultItem.id
          ? { ...item, url: destination }
          : item
      );
      setVaultItems(updatedItems);
      const offlineCacheKey = `${VAULT_OFFLINE_CACHE_PREFIX}${coupleData.coupleCode}`;
      AsyncStorage.setItem(offlineCacheKey, JSON.stringify(serializeVaultItemsForOffline(updatedItems))).catch(() => {});
      setUnavailableItemById((prev) => ({ ...prev, [selectedVaultItem.id]: false }));
      setOptionsModalVisible(false);
      Alert.alert('Saved', 'Media saved to your device and removed from temporary cache.');
    } catch (error) {
      console.error('Error saving media to device:', error);
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('development build on Android')) {
        Alert.alert(
          'Expo Go Limitation',
          'Saving media to device on Android requires a development build. Expo Go cannot grant full media-library access for this flow.'
        );
        return;
      }
      Alert.alert('Error', 'Failed to save media to device.');
    }
  };

  const handleDownloadVaultItem = async (item: VaultItem) => {
    if (!coupleData || !item.media?.mediaId) return;

    setDownloadingItemById((prev) => ({ ...prev, [item.id]: true }));
    setUnavailableItemById((prev) => ({ ...prev, [item.id]: false }));

    try {
      const downloaded = await streamAndCacheMedia(
        item.media.mediaId,
        coupleData.coupleCode,
        coupleData.nickname
      );

      const updatedItems = vaultItems.map((entry) =>
        entry.id === item.id
          ? { ...entry, url: downloaded.localPath }
          : entry
      );
      setVaultItems(updatedItems);
      const offlineCacheKey = `${VAULT_OFFLINE_CACHE_PREFIX}${coupleData.coupleCode}`;
      AsyncStorage.setItem(offlineCacheKey, JSON.stringify(serializeVaultItemsForOffline(updatedItems))).catch(() => {});
    } catch (error) {
      console.error('Error downloading vault media:', error);
      setUnavailableItemById((prev) => ({ ...prev, [item.id]: true }));
      Alert.alert('Download Failed', 'Media is not available right now.');
    } finally {
      setDownloadingItemById((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const renderVaultItem = (item: VaultItem, index: number) => (
    <Animated.View 
      key={item.id} 
      style={[
        styles.vaultItem,
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
      <View style={styles.vaultItemHeader}>
        <View style={styles.vaultItemIcon}>
          {item.type === 'letter' && <FileText size={20} color="#fd79a8" />}
          {item.type === 'photo' && <ImageIcon size={20} color="#fd79a8" />}
          {item.type === 'audio' && <Mic size={20} color="#fd79a8" />}
        </View>
        <View style={styles.vaultItemInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.vaultItemTitle}>{item.title}</Text>
            {item.favorite && <Star size={16} color="#fdcb6e" fill="#fdcb6e" />}
          </View>
          <Text style={styles.vaultItemMeta}>
            By {item.author} • {item.timestamp?.toDate ? new Date(item.timestamp.toDate()).toLocaleDateString() : 'Just now'}
          </Text>
        </View>
        <TouchableOpacity 
          style={{ padding: 4, marginLeft: 8 }}
          onPress={() => {
            setSelectedVaultItem(item);
            setNewItemName(item.title);
            setOptionsModalVisible(true);
          }}
        >
          <MoreVertical size={20} color="#999" />
        </TouchableOpacity>
      </View>
      
      {item.type === 'photo' && item.media && (
        item.url && !unavailableItemById[item.id] ? (
          <Image
            source={{ uri: item.url }}
            style={styles.photoPreview}
            onError={() => setUnavailableItemById((prev) => ({ ...prev, [item.id]: true }))}
          />
        ) : downloadingItemById[item.id] ? (
          <View style={styles.photoPlaceholderCard}>
            <ActivityIndicator size="small" color="#20bf6b" style={styles.mediaLoadingSpinner} />
            <Text style={styles.placeholderEmoji}>🖼️</Text>
            <Text style={styles.mediaInfoText}>Downloading image...</Text>
          </View>
        ) : unavailableItemById[item.id] ? (
          <View style={styles.photoPlaceholderCard}>
            <Text style={styles.placeholderEmoji}>🖼️</Text>
            <Text style={styles.mediaUnavailableText}>Not available</Text>
          </View>
        ) : (
          <View style={styles.photoPlaceholderCard}>
            <Text style={styles.placeholderEmoji}>🖼️</Text>
            <Text style={styles.mediaInfoText}>Image not downloaded</Text>
            <TouchableOpacity style={styles.downloadOverlayButton} onPress={() => handleDownloadVaultItem(item)}>
              <Download size={14} color="#20bf6b" />
              <Text style={styles.downloadInlineText}>Download</Text>
            </TouchableOpacity>
          </View>
        )
      )}

      {item.type === 'audio' && item.media && (
        item.url && !unavailableItemById[item.id] ? (
          <View style={{ marginVertical: 10 }}>
            <AudioPlayer audioUrl={item.url} duration={item.duration} />
          </View>
        ) : downloadingItemById[item.id] ? (
          <View style={styles.voicePlaceholderCard}>
            <ActivityIndicator size="small" color="#20bf6b" style={styles.mediaLoadingSpinner} />
            <Mic size={18} color="#20bf6b" />
            <Text style={styles.mediaInfoText}>Downloading audio...</Text>
          </View>
        ) : unavailableItemById[item.id] ? (
          <View style={styles.voicePlaceholderCard}>
            <Mic size={18} color="#20bf6b" />
            <Text style={styles.mediaUnavailableText}>Not available</Text>
          </View>
        ) : (
          <View style={styles.voicePlaceholderCard}>
            <Mic size={18} color="#20bf6b" />
            <Text style={styles.mediaInfoText}>Voice note not downloaded</Text>
            <TouchableOpacity style={styles.downloadInlineButton} onPress={() => handleDownloadVaultItem(item)}>
              <Download size={16} color="#20bf6b" />
              <Text style={styles.downloadInlineText}>Download</Text>
            </TouchableOpacity>
          </View>
        )
      )}

      {item.content && (
        <Text style={styles.vaultItemPreview} numberOfLines={3}>
          {item.content}
        </Text>
      )}
      
      {item.tags && item.tags.length > 0 && (
        <View style={styles.tagsContainer}>
          {item.tags.map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {item.mood && (
        <View style={styles.moodContainer}>
          <Text style={styles.moodText}>
            {item.mood === 'Happy' ? '😊' : 
             item.mood === 'Romantic' ? '💕' : 
             item.mood === 'Grateful' ? '🙏' : 
             item.mood === 'Nostalgic' ? '🥺' : '💭'} {item.mood}
          </Text>
        </View>
      )}
    </Animated.View>
  );

  return (
    <LinearGradient colors={['#fd79a8', '#fdcb6e']} style={styles.container}>
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
          <Archive size={24} color="#ffffff" />
          <Text style={styles.headerTitle}>Our Vault 💝</Text>
        </Animated.View>

        <View style={styles.content}>
          <Animated.View 
            style={[
              styles.tabsContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {[
              { key: 'all', label: 'All', icon: '📚' },
              { key: 'letters', label: 'Letters', icon: '💌' },
              { key: 'photos', label: 'Photos', icon: '📸' },
              { key: 'audios', label: 'Audio', icon: '🎵' }
            ].map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.activeTab]}
                onPress={() => setActiveTab(tab.key as any)}
              >
                <Text style={styles.tabEmoji}>{tab.icon}</Text>
                <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>

          <ScrollView style={styles.vaultList} showsVerticalScrollIndicator={false}>
            {/* Shared Diary Section */}
            <Animated.View 
              style={[
                styles.specialSection,
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
                  <View style={styles.sharedDiaryContent}>
                    <View style={styles.sharedDiaryIcon}>
                      <FileText size={24} color="#ffffff" />
                    </View>
                    <View style={styles.sharedDiaryInfo}>
                      <Text style={styles.sharedDiaryTitle}>Shared Diary 💕</Text>
                      <Text style={styles.sharedDiarySubtitle}>
                        Write together with text, photos & voice
                      </Text>
                    </View>
                    <View style={styles.sharedDiaryArrow}>
                      <Text style={styles.arrowText}>→</Text>
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {filteredItems.length === 0 ? (
              <Animated.View 
                style={[
                  styles.emptyState,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                  },
                ]}
              >
                <Heart size={48} color="#fd79a8" />
                <Text style={styles.emptyStateTitle}>No memories yet</Text>
                <Text style={styles.emptyStateText}>
                  Start creating beautiful memories together
                </Text>
              </Animated.View>
            ) : (
              filteredItems.map((item, index) => renderVaultItem(item, index))
            )}
          </ScrollView>

          <Animated.View 
            style={[
              styles.addButtons,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <TouchableOpacity 
              style={[styles.addButton, isUploadingMedia && styles.addButtonDisabled]}
              onPress={() => handleAddItem('letter')}
              disabled={isUploadingMedia}
            >
              <LinearGradient
                colors={['#a29bfe', '#6c5ce7']}
                style={styles.addButtonGradient}
              >
                <FileText size={18} color="#ffffff" />
                <Text style={styles.addButtonText}>Letter</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.addButton, isUploadingMedia && styles.addButtonDisabled]}
              onPress={() => handleAddItem('photo')}
              disabled={isUploadingMedia}
            >
              <LinearGradient
                colors={['#00b894', '#00a085']}
                style={styles.addButtonGradient}
              >
                <ImageIcon size={18} color="#ffffff" />
                <Text style={styles.addButtonText}>Photo</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.addButton, isUploadingMedia && styles.addButtonDisabled]}
              onPress={() => handleAddItem('audio')}
              disabled={isUploadingMedia}
            >
              <LinearGradient
                colors={['#e17055', '#d63031']}
                style={styles.addButtonGradient}
              >
                <Mic size={18} color="#ffffff" />
                <Text style={styles.addButtonText}>Audio</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

        {/* Letter Modal */}
        <Modal 
          visible={showLetterModal}
          animationType="slide"
          transparent={false}
        >
          <LinearGradient colors={['#a29bfe', '#6c5ce7']} style={styles.container}>
            <SafeAreaView style={styles.modalSafeArea}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowLetterModal(false)} disabled={isUploadingLetter || isUploadingMedia}>
                  <X size={24} color="#ffffff" />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Write Letter 💌</Text>
                <TouchableOpacity 
                  onPress={saveLetter}
                  disabled={isUploadingLetter}
                >
                  <Send size={24} color={isUploadingLetter ? '#cccccc' : '#ffffff'} />
                </TouchableOpacity>
              </View>

              <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.modalContent}
              >
                <TextInput
                  style={styles.letterTitleInput}
                  placeholder="Letter Title..."
                  placeholderTextColor="#999"
                  value={letterTitle}
                  onChangeText={setLetterTitle}
                  maxLength={100}
                />
                <TextInput
                  style={styles.letterContentInput}
                  placeholder="Write your letter here..."
                  placeholderTextColor="#999"
                  value={letterContent}
                  onChangeText={setLetterContent}
                  multiline
                  maxLength={5000}
                />
              </KeyboardAvoidingView>
            </SafeAreaView>
          </LinearGradient>
        </Modal>

        {/* Audio Modal */}
        <Modal 
          visible={showAudioModal}
          animationType="slide"
          transparent={false}
        >
          <LinearGradient colors={['#e17055', '#d63031']} style={styles.container}>
            <SafeAreaView style={styles.modalSafeArea}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => { void closeAudioModal(); }} disabled={isUploadingMedia}>
                  <X size={24} color="#ffffff" />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Record Voice Memo 🎤</Text>
                <TouchableOpacity 
                  onPress={currentRecordingUri ? saveAudio : () => {}}
                  disabled={!currentRecordingUri || isUploadingMedia}
                >
                  <Send size={24} color={currentRecordingUri && !isUploadingMedia ? '#ffffff' : '#cccccc'} />
                </TouchableOpacity>
              </View>

              <View style={styles.audioContent}>
                <View style={styles.audioDisplay}>
                  <Mic size={48} color="#ffffff" />
                  <Text style={styles.durationText}>{formatDuration(recordingDuration)}</Text>
                  {isRecording && (
                    <View style={styles.recordingIndicator}>
                      {!isRecordingPaused && <View style={styles.recordingDot} />}
                      <Text style={styles.recordingText}>{isRecordingPaused ? 'Paused' : 'Recording...'}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.audioButtonsContainer}>
                  {!isRecording ? (
                    <TouchableOpacity 
                      style={[styles.recordButton, styles.singleRecordButton]}
                      onPress={startRecording}
                      disabled={isUploadingMedia}
                    >
                      <Mic size={28} color="#ffffff" />
                      <Text style={styles.recordButtonText}>Start Recording</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.recordingControlRow}>
                      <TouchableOpacity 
                        style={[styles.recordButton, styles.pauseButton]}
                        onPress={isRecordingPaused ? startRecording : pauseRecording}
                        disabled={isUploadingMedia}
                      >
                        <Text style={styles.recordButtonText}>{isRecordingPaused ? 'Resume' : 'Pause'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={[styles.recordButton, styles.stopButton]}
                        onPress={stopRecording}
                        disabled={isUploadingMedia}
                      >
                        <Text style={styles.recordButtonText}>Stop</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </SafeAreaView>
          </LinearGradient>
        </Modal>

        <Modal visible={isUploadingMedia} transparent animationType="fade">
          <View style={styles.uploadOverlay}>
            <View style={styles.uploadOverlayCard}>
              <ActivityIndicator size="large" color="#ff6b9d" />
              <Text style={styles.uploadOverlayTitle}>
                {uploadingMediaKind === 'audio' ? 'Sending voice memo...' : 'Sending photo...'}
              </Text>
              <Text style={styles.uploadOverlaySubtitle}>Please wait until upload finishes.</Text>
            </View>
          </View>
        </Modal>

        {/* Options Modal */}
        <Modal
          visible={optionsModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setOptionsModalVisible(false)}
        >
          <View style={styles.optionsModalOverlay}>
            <View style={styles.optionsModalContent}>
              <View style={styles.optionsModalHeader}>
                <Text style={styles.optionsModalTitle}>Memory Options</Text>
                <TouchableOpacity onPress={() => setOptionsModalVisible(false)}>
                  <X size={24} color="#666" />
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity 
                style={styles.optionItem}
                onPress={() => {
                  setOptionsModalVisible(false);
                  setEditNameModalVisible(true);
                }}
              >
                <View style={[styles.optionIconContainer, { backgroundColor: '#f0f5ff' }]}>
                  <Edit2 size={20} color="#4834d4" />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionLabel}>Rename Memory</Text>
                  <Text style={styles.optionDesc}>Change the title of this entry</Text>
                </View>
              </TouchableOpacity>

              {selectedVaultItem?.media && (
                <TouchableOpacity 
                  style={styles.optionItem}
                  onPress={handleSaveToDevice}
                >
                  <View style={[styles.optionIconContainer, { backgroundColor: '#f0fff5' }]}>
                    <Download size={20} color="#20bf6b" />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={styles.optionLabel}>Save to Device</Text>
                    <Text style={styles.optionDesc}>Downloads media and removes temp cache copy</Text>
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={styles.optionItem}
                onPress={handleDeleteItem}
              >
                <View style={[styles.optionIconContainer, { backgroundColor: '#fff0f0' }]}>
                  <Trash2 size={20} color="#eb4d4b" />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={[styles.optionLabel, { color: '#eb4d4b' }]}>Delete Memory</Text>
                  <Text style={styles.optionDesc}>This action cannot be undone</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Edit Name Modal */}
        <Modal
          visible={editNameModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setEditNameModalVisible(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.optionsModalOverlay}
          >
            <View style={[styles.optionsModalContent, { paddingBottom: 20 }]}>
              <Text style={styles.optionsModalTitle}>Rename Memory</Text>
              <TextInput
                style={styles.renameInput}
                value={newItemName}
                onChangeText={setNewItemName}
                placeholder="Enter new name"
                autoFocus
                selectionColor="#fd79a8"
              />
              <View style={styles.renameButtons}>
                <TouchableOpacity 
                  style={styles.renameCancelBtn}
                  onPress={() => setEditNameModalVisible(false)}
                >
                  <Text style={styles.renameCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.renameSaveBtn}
                  onPress={handleUpdateName}
                >
                  <Text style={styles.renameSaveTxt}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        </View>
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
  },
  content: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  activeTab: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  tabEmoji: {
    fontSize: 16,
    marginBottom: 4,
  },
  tabText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#666',
  },
  activeTabText: {
    color: '#fd79a8',
  },
  vaultList: {
    flex: 1,
    paddingBottom: 100,
  },
  vaultItem: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  vaultItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  vaultItemIcon: {
    marginRight: 12,
  },
  vaultItemInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vaultItemTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginBottom: 2,
    flex: 1,
  },
  vaultItemMeta: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#666',
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  downloadInlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#b7f2d6',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 12,
    backgroundColor: '#f8fffb',
  },
  downloadOverlayButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.76)',
  },
  photoPlaceholderCard: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#fff7fb',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  voicePlaceholderCard: {
    borderRadius: 12,
    minHeight: 64,
    marginBottom: 12,
    backgroundColor: '#fff7fb',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  placeholderEmoji: {
    fontSize: 28,
  },
  mediaLoadingSpinner: {
    marginBottom: 2,
  },
  downloadInlineText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#20bf6b',
  },
  mediaInfoBox: {
    borderRadius: 12,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff7fb',
    marginBottom: 12,
  },
  mediaInfoText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#b56f8a',
  },
  mediaUnavailableText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#c0392b',
  },
  vaultItemPreview: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#555',
    lineHeight: 20,
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  tag: {
    backgroundColor: '#fd79a8',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  moodContainer: {
    alignSelf: 'flex-start',
  },
  moodText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
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
  },
  addButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
  addButtonDisabled: {
    opacity: 0.45,
  },
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
  },
  addButton: {
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
  addButtonGradient: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  addButtonText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginTop: 4,
  },
  specialSection: {
    marginBottom: 20,
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
  sharedDiaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sharedDiaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  sharedDiaryInfo: {
    flex: 1,
  },
  sharedDiaryTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  sharedDiarySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    opacity: 0.9,
  },
  sharedDiaryArrow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontSize: 24,
    color: '#ffffff',
    fontFamily: 'Inter-Bold',
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Playfair-Bold',
    color: '#ffffff',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  letterTitleInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 12,
    color: '#333',
  },
  letterContentInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlignVertical: 'top',
    color: '#333',
  },
  audioContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  audioDisplay: {
    alignItems: 'center',
    marginBottom: 40,
  },
  durationText: {
    fontSize: 48,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
    marginTop: 16,
    marginBottom: 16,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff6b6b',
    marginRight: 8,
  },
  recordingText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  audioButtonsContainer: {
    width: '100%',
    alignItems: 'center',
  },
  recordingControlRow: {
    flexDirection: 'row',
    gap: 12,
  },
  recordButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  pauseButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  singleRecordButton: {
    flex: 0,
    minWidth: 220,
    paddingHorizontal: 28,
  },
  stopButton: {
    backgroundColor: '#ff6b6b',
  },
  recordButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginLeft: 12,
  },
  uploadOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  uploadOverlayCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  uploadOverlayTitle: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
  },
  uploadOverlaySubtitle: {
    marginTop: 6,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textAlign: 'center',
  },
  optionsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 96,
    zIndex: 9999,
    elevation: 9999,
  },
  optionsModalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    paddingBottom: 40,
    zIndex: 10000,
    elevation: 10000,
  },
  optionsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  optionsModalTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginBottom: 10,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  optionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    marginBottom: 4,
  },
  optionDesc: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#888',
  },
  renameInput: {
    backgroundColor: '#f5f6fa',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#333',
    marginBottom: 24,
  },
  renameButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  renameCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginRight: 12,
  },
  renameCancelTxt: {
    color: '#666',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  renameSaveBtn: {
    backgroundColor: '#fd79a8',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  renameSaveTxt: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});