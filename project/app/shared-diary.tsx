import React, { useState, useEffect, useRef, useMemo } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  ArrowLeft, ChevronLeft, ChevronRight,
  Heart, Camera, Mic, Image as ImageIcon, Send, Play, Pause, Trash2
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
  where,
  getDoc,
  doc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import * as ImagePicker from 'expo-image-picker';
import VoiceRecorder from '@/components/VoiceRecorder';
import AudioPlayer from '@/components/AudioPlayer';
import { uploadImageMedia, uploadAudioMedia } from '@/services/mediaUpload';
import { getSignedMediaUrl, deleteMediaById } from '@/services/media';
import { MediaRef } from '@/types/app';

const { width } = Dimensions.get('window');

interface DiaryEntry {
  id: string;
  type: 'text' | 'image' | 'voice';
  content?: string;
  media?: MediaRef;
  mediaUrl?: string;
  mediaPath?: string;
  duration?: number;
  author: string;
  timestamp: any;
  date?: string;
  coupleCode: string;
  reactions?: { [key: string]: string[] };
}

export default function SharedDiaryScreen() {
  const router = useRouter();
  const { coupleData, isConnected, isLoading } = useCouple();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [partnerNickname, setPartnerNickname] = useState<string>('partner');
  
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'me' | 'partner'>('me');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [textContent, setTextContent] = useState('');
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (isLoading) return;
    if (!isConnected || !coupleData) {
      router.replace('/(auth)/auth');
      return;
    }
    loadPartnerName();
    const unsub = loadEntries();
    
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();
    
    return () => { if (unsub) unsub(); };
  }, [isConnected, isLoading, coupleData]);

  const loadPartnerName = async () => {
    if (!coupleData) return;
    try {
      const coupleRef = doc(db, 'couples', coupleData.coupleCode);
      const docSnap = await getDoc(coupleRef);
      if (docSnap.exists()) {
        const users = docSnap.data().users || {};
        const pName = Object.keys(users).find(n => n !== coupleData.nickname);
        if (pName) setPartnerNickname(pName);
      }
    } catch (e) {
      console.log('error finding partner name', e);
    }
  };

  const loadEntries = () => {
    if (!coupleData) return;
    const entriesRef = collection(db, 'sharedDiary');
    const q = query(
      entriesRef,
      where('coupleCode', '==', coupleData.coupleCode),
      orderBy('timestamp', 'asc')
    );
    return onSnapshot(q, async (snapshot) => {
      const rawEntries: DiaryEntry[] = [];
      snapshot.docs.forEach(doc => {
        rawEntries.push({ id: doc.id, ...doc.data() } as DiaryEntry);
      });

      const hydratedEntries = await Promise.all(
        rawEntries.map(async (entry) => {
          if (entry.media?.mediaId && coupleData?.coupleCode && coupleData?.nickname) {
            try {
              const signedUrl = await getSignedMediaUrl(
                entry.media.mediaId,
                coupleData.coupleCode,
                coupleData.nickname
              );
              return { ...entry, mediaUrl: signedUrl };
            } catch {
              return entry;
            }
          }
          return entry;
        })
      );

      setEntries(hydratedEntries);
    });
  };

  const entriesByDate = useMemo(() => {
    const map: Record<string, DiaryEntry[]> = {};
    entries.forEach(e => {
      let dateStr = e.date;
      if (!dateStr) {
        const d = e.timestamp?.toDate ? e.timestamp.toDate() : (e.timestamp ? new Date(e.timestamp) : new Date());
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(e);
    });
    return map;
  }, [entries]);

  const generateMonthDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ 
        day: prevMonthDays - i, 
        isCurrentMonth: false, 
        dateStr: `${month === 0 ? year - 1 : year}-${String(month === 0 ? 12 : month).padStart(2,'0')}-${String(prevMonthDays - i).padStart(2,'0')}` 
      });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ 
        day: i, 
        isCurrentMonth: true, 
        dateStr: `${year}-${String(month + 1).padStart(2,'0')}-${String(i).padStart(2,'0')}` 
      });
    }
    let nextMonthDay = 1;
    while (days.length % 7 !== 0) {
      days.push({ 
        day: nextMonthDay++, 
        isCurrentMonth: false, 
        dateStr: `${month === 11 ? year + 1 : year}-${String(month === 11 ? 1 : month + 2).padStart(2,'0')}-${String(nextMonthDay - 1).padStart(2,'0')}` 
      });
    }
    return days;
  };

  const changeMonth = (diff: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + diff, 1));
  };

  const sendTextEntry = async () => {
    if (!textContent.trim() || !coupleData || !selectedDate) return;
    try {
      const entryData = {
        type: 'text',
        content: textContent.trim(),
        author: coupleData.nickname,
        timestamp: serverTimestamp(),
        date: selectedDate,
        coupleCode: coupleData.coupleCode,
        reactions: {}
      };
      await addDoc(collection(db, 'sharedDiary'), entryData);
      setTextContent('');
    } catch (error) {
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const pickImage = async () => {
    if (!selectedDate) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) await uploadImage(result.assets[0].uri);
  };

  const takePhoto = async () => {
    if (!selectedDate) return;
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) await uploadImage(result.assets[0].uri);
  };

  const uploadImage = async (uri: string) => {
    if (!coupleData || !selectedDate) return;
    try {
      const media = await uploadImageMedia(uri, {
        userId: coupleData.nickname,
        coupleCode: coupleData.coupleCode,
      });
      const entryData = {
        type: 'image',
        media,
        author: coupleData.nickname,
        timestamp: serverTimestamp(),
        date: selectedDate,
        coupleCode: coupleData.coupleCode,
        reactions: {}
      };
      await addDoc(collection(db, 'sharedDiary'), entryData);
    } catch (error) {
      Alert.alert('Error', 'Failed to upload image');
    }
  };

  const onRecordingComplete = async (audioUri: string, duration?: number) => {
    if (!coupleData || !selectedDate) return;
    try {
      const media = await uploadAudioMedia(audioUri, {
        userId: coupleData.nickname,
        coupleCode: coupleData.coupleCode,
      });
      const entryData = {
        type: 'voice',
        media,
        mediaPath: 'audio',
        duration: duration || 1,
        author: coupleData.nickname,
        timestamp: serverTimestamp(),
        date: selectedDate,
        coupleCode: coupleData.coupleCode,
        reactions: {}
      };
      await addDoc(collection(db, 'sharedDiary'), entryData);
    } catch (error) {
      Alert.alert('Error', 'Failed to upload voice message');
    }
  };

  const formatTime = (ts: any) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleDeleteEntry = (entry: DiaryEntry) => {
    Alert.alert(
      "Delete Entry",
      "Are you sure you want to delete this memory?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              if (entry.media?.mediaId && coupleData) {
                await deleteMediaById(
                  entry.media.mediaId,
                  coupleData.coupleCode,
                  coupleData.nickname
                );
              }

              await deleteDoc(doc(db, 'sharedDiary', entry.id));
            } catch (error) {
              Alert.alert("Error", "Failed to delete entry");
            }
          }
        }
      ]
    );
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const showImageOptions = () => {
    Alert.alert('Add Photo', 'Choose an option', [
      { text: 'Camera', onPress: takePhoto },
      { text: 'Photo Library', onPress: pickImage },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const renderCalendar = () => {
    const days = generateMonthDays();
    const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return (
      <View style={styles.calendarContainer}>
        <View style={styles.calendarHeader}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calNav}>
            <ChevronLeft size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.currentMonthText}>
            {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calNav}>
            <ChevronRight size={24} color="#333" />
          </TouchableOpacity>
        </View>

        <View style={styles.weekDaysRow}>
          {weekDays.map((wd, i) => (
            <Text key={i} style={styles.weekDayText}>{wd}</Text>
          ))}
        </View>

        <View style={styles.daysGrid}>
          {days.map((dayObj, index) => {
            const hasEntries = entriesByDate[dayObj.dateStr] && entriesByDate[dayObj.dateStr].length > 0;
            const isToday = dayObj.dateStr === new Date().toISOString().split('T')[0];
            
            return (
              <TouchableOpacity 
                key={index}
                style={[
                  styles.dayCell,
                  !dayObj.isCurrentMonth && styles.dayCellFaded,
                  isToday && styles.dayCellToday
                ]}
                onPress={() => setSelectedDate(dayObj.dateStr)}
              >
                <Text style={[
                  styles.dayText, 
                  !dayObj.isCurrentMonth && styles.dayTextFaded,
                  isToday && styles.dayTextToday
                ]}>{dayObj.day}</Text>
                {hasEntries && (
                  <View style={styles.entryDot} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderEntryCard = (entry: DiaryEntry) => {
    const isMe = entry.author === coupleData?.nickname;
    return (
      <View key={entry.id} style={styles.diaryBlock}>
        <View style={styles.diaryHeader}>
          <Text style={styles.diaryTime}>{formatTime(entry.timestamp)}</Text>
          {isMe && (
            <TouchableOpacity onPress={() => handleDeleteEntry(entry)}>
              <Trash2 size={16} color="#fdaeb7" />
            </TouchableOpacity>
          )}
        </View>
        
        {entry.type === 'text' && (
          <Text style={styles.diaryTextContent}>{entry.content}</Text>
        )}
        
        {entry.type === 'image' && (
          <Image source={{ uri: entry.mediaUrl }} style={styles.diaryImageBlock} />
        )}

        {entry.type === 'voice' && entry.mediaUrl && (
          <View style={{ marginTop: 8 }}>
            <AudioPlayer audioUrl={entry.mediaUrl} duration={entry.duration} />
          </View>
        )}
      </View>
    );
  };

  const renderDateView = () => {
    if (!selectedDate) return null;
    const dayEntries = entriesByDate[selectedDate] || [];
    const myEntries = dayEntries.filter(e => e.author === coupleData?.nickname);
    const partnerEntries = dayEntries.filter(e => e.author !== coupleData?.nickname);
    
    const activeEntries = activeTab === 'me' ? myEntries : partnerEntries;
    
    return (
      <View style={styles.dateViewContainer}>
        {/* Date Header */}
        <View style={styles.dateHeader}>
          <TouchableOpacity onPress={() => { setSelectedDate(null); setActiveTab('me'); }} style={styles.backButtonDate}>
            <ArrowLeft size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.dateViewTitle}>
            {new Date(selectedDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          <View style={{ width: 40 }}/>
        </View>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'me' && styles.tabButtonActive]}
            onPress={() => setActiveTab('me')}
          >
            <Text style={[styles.tabText, activeTab === 'me' && styles.tabTextActive]}>My Diary</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'partner' && styles.tabButtonActive]}
            onPress={() => setActiveTab('partner')}
          >
            <Text style={[styles.tabText, activeTab === 'partner' && styles.tabTextActive]}>
              {partnerNickname}'s Diary
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.entriesScroll} contentContainerStyle={styles.entriesScrollContent}>
          {activeEntries.length === 0 ? (
            <View style={styles.emptyDateState}>
              <Text style={styles.emptyDateText}>
                No entries for this day.
              </Text>
            </View>
          ) : (
            activeEntries.map(e => renderEntryCard(e))
          )}
        </ScrollView>

        {/* Input is only possible on "My Diary" tab */}
        {activeTab === 'me' && (
          <View style={styles.inputContainer}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Write your entry..."
                placeholderTextColor="#999"
                value={textContent}
                onChangeText={setTextContent}
                multiline
                maxLength={1000}
              />
              {textContent.trim() ? (
                <TouchableOpacity style={styles.sendButton} onPress={sendTextEntry}>
                  <LinearGradient colors={['#ff6b9d', '#ff8fab']} style={styles.sendButtonGradient}>
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
              <TouchableOpacity style={styles.attachmentButton} onPress={() => setShowVoiceRecorder(true)}>
                <Mic size={20} color="#ff6b9d" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (isLoading || !isConnected) return null;

  return (
    <LinearGradient colors={['#ff9a9e', '#fecfef']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {!selectedDate ? (
          <>
            <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <ArrowLeft size={24} color="#ffffff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Shared Diary 💕</Text>
              <View style={styles.placeholder} />
            </Animated.View>
            
            <Animated.View style={[styles.mainBoard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {renderCalendar()}
              </ScrollView>
            </Animated.View>
          </>
        ) : (
           renderDateView()
        )}

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
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 10,
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 20, fontFamily: 'Playfair-Bold', color: '#ffffff' },
  placeholder: { width: 40 },
  
  mainBoard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  calendarContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 20,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calNav: { padding: 8 },
  currentMonthText: { fontSize: 18, fontFamily: 'Inter-Bold', color: '#333' },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#999',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  dayCellFaded: { opacity: 0.3 },
  dayCellToday: {
    backgroundColor: 'rgba(255, 107, 157, 0.1)',
    borderRadius: 12,
  },
  dayText: { fontSize: 16, fontFamily: 'Inter-Medium', color: '#333' },
  dayTextFaded: { color: '#999' },
  dayTextToday: { color: '#ff6b9d', fontFamily: 'Inter-Bold' },
  entryDot: {
    width: 6,
    height: 6,
    backgroundColor: '#ff6b9d',
    borderRadius: 3,
    position: 'absolute',
    bottom: 4,
  },
  
  dateViewContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 10,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButtonDate: { padding: 8 },
  dateViewTitle: { fontSize: 18, fontFamily: 'Inter-Bold', color: '#333' },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: { borderBottomColor: '#ff6b9d' },
  tabText: { fontSize: 14, fontFamily: 'Inter-Medium', color: '#999' },
  tabTextActive: { color: '#ff6b9d', fontFamily: 'Inter-Bold' },
  
  entriesScroll: { flex: 1, backgroundColor: '#f9f9f9' },
  entriesScrollContent: { padding: 20, paddingBottom: 150 },
  
  emptyDateState: { padding: 40, alignItems: 'center' },
  emptyDateText: { color: '#999', fontFamily: 'Inter-Regular', fontSize: 16 },
  
  diaryBlock: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  diaryHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 8 
  },
  diaryTime: { fontSize: 11, fontFamily: 'Inter-Medium', color: '#ccc' },
  diaryTextContent: { fontSize: 15, fontFamily: 'Inter-Regular', color: '#333', lineHeight: 24 },
  diaryImageBlock: { width: '100%', height: 250, borderRadius: 12, marginTop: 8 },
  
  voiceContainerBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  voiceMe: { backgroundColor: '#fff0f5' },
  voicePartner: { backgroundColor: '#f0f4ff' },
  voiceButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#ff6b9d',
    alignItems: 'center', justifyContent: 'center', marginRight: 12
  },
  voiceInfo: { flex: 1 },
  voiceDurationBlock: { fontSize: 12, fontFamily: 'Inter-Medium', color: '#666', marginBottom: 4 },
  waveform: { flexDirection: 'row', alignItems: 'center', height: 20 },
  waveBar: { width: 3, height: 8, backgroundColor: '#ddd', marginRight: 2, borderRadius: 1.5 },
  activeWaveBar: { backgroundColor: '#ff6b9d', height: 16 },

  inputContainer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    padding: 20,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  textInput: {
    flex: 1, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 16,
    fontFamily: 'Inter-Regular', maxHeight: 100, marginRight: 8,
  },
  sendButton: { borderRadius: 20, overflow: 'hidden' },
  sendButtonGradient: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  attachmentButtons: { flexDirection: 'row', justifyContent: 'center' },
  attachmentButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#f8f9fa',
    alignItems: 'center', justifyContent: 'center', marginHorizontal: 8
  },
});
