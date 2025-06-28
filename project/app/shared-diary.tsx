import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  Dimensions,
  Animated,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  ArrowLeft, 
  Plus, 
  Heart, 
  Camera, 
  Mic, 
  Image as ImageIcon, 
  Send,
  Play,
  Pause,
  Trash2,
  Download
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCouple } from '@/hooks/useCouple';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  where
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/services/firebase';
import * as ImagePicker from 'expo-image-picker';
import { useAudioRecorder, useAudioPlayer } from 'expo-audio';
import VoiceRecorder from '@/components/VoiceRecorder';

const { width, height } = Dimensions.get('window');

interface DiaryEntry {
  id: string;
  type: 'text' | 'image' | 'voice';
  content?: string;
  mediaUrl?: string;
  mediaPath?: string;
  duration?: number;
  author: string;
  timestamp: any;
  coupleCode: string;
  reactions?: { [key: string]: string[] };
}

export default function SharedDiaryScreen() {
  const router = useRouter();
  const { coupleData, isConnected, isLoading } = useCouple();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [textContent, setTextContent] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // Wait for loading to complete
    if (isLoading) {
      return;
    }

    if (!isConnected || !coupleData) {
      router.replace('/pairing');
      return;
    }

    loadEntries();
    
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
      // Cleanup will be handled by component unmount
    };
  }, [isConnected, isLoading, coupleData]);

  const loadEntries = () => {
    if (!coupleData) return;

    const entriesRef = collection(db, 'sharedDiary');
    const q = query(
      entriesRef,
      where('coupleCode', '==', coupleData.coupleCode),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const diaryEntries: DiaryEntry[] = [];
      snapshot.docs.forEach(doc => {
        diaryEntries.push({
          id: doc.id,
          ...doc.data()
        } as DiaryEntry);
      });
      setEntries(diaryEntries);
    });

    return unsubscribe;
  };

  const sendTextEntry = async () => {
    if (!textContent.trim() || !coupleData) return;

    try {
      const entryData = {
        type: 'text',
        content: textContent.trim(),
        author: coupleData.nickname,
        timestamp: serverTimestamp(),
        coupleCode: coupleData.coupleCode,
        reactions: {}
      };

      await addDoc(collection(db, 'sharedDiary'), entryData);
      setTextContent('');
    } catch (error) {
      console.error('Error sending text entry:', error);
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const uploadImage = async (uri: string) => {
    if (!coupleData) return;

    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const imageName = `images/${coupleData.coupleCode}/${Date.now()}.jpg`;
      const imageRef = ref(storage, imageName);
      
      await uploadBytes(imageRef, blob);
      const downloadURL = await getDownloadURL(imageRef);

      const entryData = {
        type: 'image',
        mediaUrl: downloadURL,
        mediaPath: imageName,
        author: coupleData.nickname,
        timestamp: serverTimestamp(),
        coupleCode: coupleData.coupleCode,
        reactions: {}
      };

      await addDoc(collection(db, 'sharedDiary'), entryData);
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image');
    }
  };

  const onRecordingComplete = async (audioUri: string) => {
    if (!coupleData) return;

    try {
      const response = await fetch(audioUri);
      const blob = await response.blob();
      
      const audioName = `audio/${coupleData.coupleCode}/${Date.now()}.m4a`;
      const audioRef = ref(storage, audioName);
      
      await uploadBytes(audioRef, blob);
      const downloadURL = await getDownloadURL(audioRef);

      const entryData = {
        type: 'voice',
        mediaUrl: downloadURL,
        mediaPath: audioName,
        duration: 30, // Default duration since we don't have it from callback
        author: coupleData.nickname,
        timestamp: serverTimestamp(),
        coupleCode: coupleData.coupleCode,
        reactions: {}
      };

      await addDoc(collection(db, 'sharedDiary'), entryData);
    } catch (error) {
      console.error('Error uploading voice message:', error);
      Alert.alert('Error', 'Failed to upload voice message');
    }
  };

  const playAudio = async (entry: DiaryEntry) => {
    try {
      if (playingAudio === entry.id) {
        // Stop current audio
        setPlayingAudio(null);
        return;
      }

      // For now, use a simple approach for audio playback
      // In a full implementation, you'd want to use expo-audio's useAudioPlayer
      // but since it's a hook, it needs to be handled differently
      if (entry.mediaUrl) {
        setPlayingAudio(entry.id);
        
        // Simulate audio playback duration
        setTimeout(() => {
          setPlayingAudio(null);
        }, (entry.duration || 30) * 1000);
        
        // For web, use HTML5 Audio
        if (typeof window !== 'undefined') {
          const audio = new Audio(entry.mediaUrl);
          audio.onended = () => setPlayingAudio(null);
          audio.play().catch(() => {
            setPlayingAudio(null);
          });
        }
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      Alert.alert('Error', 'Failed to play audio');
      setPlayingAudio(null);
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const showImageOptions = () => {
    Alert.alert(
      'Add Photo',
      'Choose an option',
      [
        { text: 'Camera', onPress: takePhoto },
        { text: 'Photo Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const renderEntry = (entry: DiaryEntry, index: number) => {
    const isOwnEntry = entry.author === coupleData?.nickname;
    
    return (
      <Animated.View
        key={entry.id}
        style={[
          styles.entryContainer,
          isOwnEntry ? styles.ownEntry : styles.partnerEntry,
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
        <View style={styles.entryHeader}>
          <Text style={[styles.authorName, isOwnEntry ? styles.ownAuthor : styles.partnerAuthor]}>
            {entry.author}
          </Text>
          <Text style={styles.timestamp}>{formatTime(entry.timestamp)}</Text>
        </View>

        {entry.type === 'text' && (
          <Text style={styles.textContent}>{entry.content}</Text>
        )}

        {entry.type === 'image' && (
          <TouchableOpacity style={styles.imageContainer}>
            <Image source={{ uri: entry.mediaUrl }} style={styles.diaryImage} />
          </TouchableOpacity>
        )}

        {entry.type === 'voice' && (
          <TouchableOpacity 
            style={styles.voiceContainer}
            onPress={() => playAudio(entry)}
          >
            <View style={styles.voiceButton}>
              {playingAudio === entry.id ? (
                <Pause size={20} color="#ffffff" />
              ) : (
                <Play size={20} color="#ffffff" />
              )}
            </View>
            <View style={styles.voiceInfo}>
              <Text style={styles.voiceDuration}>
                {formatDuration(entry.duration || 0)}
              </Text>
              <View style={styles.waveform}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <View 
                    key={i} 
                    style={[
                      styles.waveBar,
                      playingAudio === entry.id && styles.activeWaveBar
                    ]} 
                  />
                ))}
              </View>
            </View>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  };

  if (isLoading || !isConnected) {
    return null;
  }

  return (
    <LinearGradient colors={['#ff9a9e', '#fecfef']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <Animated.View 
          style={[
            styles.header,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shared Diary 💕</Text>
          <View style={styles.placeholder} />
        </Animated.View>

        {/* Entries List */}
        <ScrollView 
          style={styles.entriesList}
          contentContainerStyle={styles.entriesContent}
          showsVerticalScrollIndicator={false}
        >
          {entries.map((entry, index) => renderEntry(entry, index))}
          
          {entries.length === 0 && (
            <View style={styles.emptyState}>
              <Heart size={48} color="#ff6b9d" />
              <Text style={styles.emptyTitle}>Start Your Shared Diary</Text>
              <Text style={styles.emptyText}>
                Create beautiful memories together with text, photos, and voice messages
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Input Area */}
        <Animated.View 
          style={[
            styles.inputContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Share your thoughts..."
              placeholderTextColor="#999"
              value={textContent}
              onChangeText={setTextContent}
              multiline
              maxLength={500}
            />
            {textContent.trim() ? (
              <TouchableOpacity style={styles.sendButton} onPress={sendTextEntry}>
                <LinearGradient
                  colors={['#ff6b9d', '#ff8fab']}
                  style={styles.sendButtonGradient}
                >
                  <Send size={18} color="#ffffff" />
                </LinearGradient>
              </TouchableOpacity>
            ) : null}
          </View>
          
          <View style={styles.attachmentButtons}>
            <TouchableOpacity style={styles.attachmentButton} onPress={showImageOptions}>
              <Camera size={20} color="#ff6b9d" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachmentButton} onPress={pickImage}>
              <ImageIcon size={20} color="#ff6b9d" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.attachmentButton} 
              onPress={() => setShowVoiceRecorder(true)}
            >
              <Mic size={20} color="#ff6b9d" />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Voice Recorder Modal */}
        <VoiceRecorder
          isVisible={showVoiceRecorder}
          onRecordingComplete={onRecordingComplete}
          onCancel={() => setShowVoiceRecorder(false)}
        />
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
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Playfair-Bold',
    color: '#ffffff',
  },
  placeholder: {
    width: 40,
  },
  entriesList: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  entriesContent: {
    padding: 20,
    paddingBottom: 100,
  },
  entryContainer: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  ownEntry: {
    alignSelf: 'flex-end',
    backgroundColor: '#ff6b9d',
  },
  partnerEntry: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  authorName: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  ownAuthor: {
    color: '#ffffff',
  },
  partnerAuthor: {
    color: '#ff6b9d',
  },
  timestamp: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#999',
  },
  textContent: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    color: '#333',
  },
  imageContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  diaryImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  voiceButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ff6b9d',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  voiceInfo: {
    flex: 1,
  },
  voiceDuration: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#666',
    marginBottom: 4,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
  },
  waveBar: {
    width: 3,
    height: 8,
    backgroundColor: '#ddd',
    marginRight: 2,
    borderRadius: 1.5,
  },
  activeWaveBar: {
    backgroundColor: '#ff6b9d',
    height: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: 'Playfair-Bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  inputContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  sendButtonGradient: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  attachmentButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
});
