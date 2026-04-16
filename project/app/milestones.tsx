import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Animated,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, Plus, Trash2, Edit2, ArrowLeft } from 'lucide-react-native';
import { useCouple } from '@/hooks/useCouple';
import { useRouter } from 'expo-router';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';        
import { notifyMilestoneReminder } from '@/services/notifications';
import { Platform } from 'react-native';
import DateTimePicker from '@/components/DateTimePicker';

interface Milestone {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  description?: string;
  type: 'anniversary' | 'birthday' | 'special' | 'goal';
  createdBy: string;
  createdAt: any;
  daysUntil?: number;
}

export default function MilestonesScreen() {
  const { coupleData, isConnected, isLoading } = useCouple();
  const router = useRouter();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'anniversary' | 'birthday' | 'special' | 'goal'>('anniversary');
  const [isSaving, setIsSaving] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (isLoading) return;

    if (!isConnected || !coupleData) {
      router.replace('/(auth)/auth');
      return;
    }

    const milestonesRef = collection(db, 'milestones', coupleData.coupleCode, 'items');
    const q = query(milestonesRef, orderBy('date', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const milestonesData = snapshot.docs.map((doc) => {
        const data = doc.data() as any;
        const milestone: Milestone = {
          id: doc.id,
          ...data,
        };

        // Calculate days until
        const today = new Date();
        const mileDate = new Date(data.date);
        mileDate.setFullYear(today.getFullYear());

        if (mileDate < today) {
          mileDate.setFullYear(today.getFullYear() + 1);
        }

        const diffTime = mileDate.getTime() - today.getTime();
        milestone.daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return milestone;
      });

      setMilestones(milestonesData);
      checkMilestoneReminders(milestonesData, coupleData!.coupleCode);
    });

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

  const checkMilestoneReminders = async (items: Milestone[], coupleCode: string) => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const NOTIFY_THRESHOLDS = [0, 1, 3, 7];

    for (const m of items) {
      if (!NOTIFY_THRESHOLDS.includes(m.daysUntil ?? -1)) continue;

      // Dedupe key: only fire once per milestone per day per threshold
      const dedupeKey = `milestone_notified_${m.id}_${m.daysUntil}_${today}`;
      try {
        const already = await AsyncStorage.getItem(dedupeKey);
        if (already) continue;

        await notifyMilestoneReminder(coupleCode, m.title, m.type, m.daysUntil!);
        await AsyncStorage.setItem(dedupeKey, '1');
      } catch (err) {
        console.warn('Milestone reminder error:', err);
      }
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !date || !coupleData) {
      Alert.alert('Missing fields', 'Please fill in title and date');
      return;
    }

    setIsSaving(true);
    try {
      const milestonesRef = collection(db, 'milestones', coupleData.coupleCode, 'items');

      if (editingId) {
        // Update existing
        const milestoneRef = doc(db, 'milestones', coupleData.coupleCode, 'items', editingId);
        await updateDoc(milestoneRef, {
          title: title.trim(),
          date,
          description: description.trim(),
          type,
        });
      } else {
        // Create new
        await addDoc(milestonesRef, {
          title: title.trim(),
          date,
          description: description.trim(),
          type,
          createdBy: coupleData.nickname,
          createdAt: serverTimestamp(),
        });
      }

      resetForm();
      setShowModal(false);
      Alert.alert('Success', 'Milestone saved!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save milestone');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!coupleData) return;

    Alert.alert('Delete Milestone', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const milestoneRef = doc(db, 'milestones', coupleData.coupleCode, 'items', id);
            await deleteDoc(milestoneRef);
          } catch (error) {
            Alert.alert('Error', 'Failed to delete milestone');
          }
        },
      },
    ]);
  };

  const resetForm = () => {
    setTitle('');
    setDate('');
    setSelectedDate(new Date());
    setDescription('');
    setType('anniversary');
    setEditingId(null);
  };

  const formatDateForStorage = (value: Date) => {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateForDisplay = (value: string) => {
    if (!value) return 'Pick a date';
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleDateChange = (event: any, pickedDate?: Date) => {
    if (event.type === 'dismissed') {
      setShowDatePicker(false);
      return;
    }

    const nextDate = pickedDate || selectedDate;
    setShowDatePicker(false);
    setSelectedDate(nextDate);
    setDate(formatDateForStorage(nextDate));
  };

  const getTypeEmoji = (type: string) => {
    switch (type) {
      case 'anniversary':
        return '💕';
      case 'birthday':
        return '🎂';
      case 'goal':
        return '🎯';
      default:
        return '✨';
    }
  };

  const getTypeColor = (type: string): [string, string] => {
    switch (type) {
      case 'anniversary':
        return ['#ff6b9d', '#c44569'];
      case 'birthday':
        return ['#ffa726', '#fb8c00'];
      case 'goal':
        return ['#66bb6a', '#43a047'];
      default:
        return ['#ab47bc', '#8e24aa'];
    }
  };

  if (isLoading) {
    return (
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Calendar size={48} color="#ffffff" />
            <Text style={styles.loadingText}>Loading milestones...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!isConnected || !coupleData) {
    return null;
  }

  return (
    <LinearGradient colors={['#667eea', '#764ba2']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Milestones & Anniversaries</Text>
          <TouchableOpacity
            onPress={() => {
              resetForm();
              setShowModal(true);
            }}
            style={styles.addButton}
          >
            <Plus size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {milestones.length === 0 ? (
            <View style={styles.emptyState}>
              <Calendar size={48} color="rgba(255,255,255,0.5)" />
              <Text style={styles.emptyText}>No milestones yet</Text>
              <Text style={styles.emptySubtext}>Add your first milestone to track special dates</Text>
            </View>
          ) : (
            milestones.map((milestone) => (
              <Animated.View
                key={milestone.id}
                style={[
                  styles.milestoneCard,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                  },
                ]}
              >
                <LinearGradient
                  colors={getTypeColor(milestone.type)}
                  style={styles.cardGradient}
                >
                  <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.emoji}>{getTypeEmoji(milestone.type)}</Text>
                      <View style={styles.cardTitleContainer}>
                        <Text style={styles.cardTitle}>{milestone.title}</Text>
                        <Text style={styles.cardDate}>{milestone.date}</Text>
                      </View>
                    </View>

                    <View style={styles.cardFooter}>
                      <View style={styles.daysContainer}>
                        <Text style={styles.daysText}>
                          {milestone.daysUntil === 0
                            ? '🎉 Today!'
                            : milestone.daysUntil === 1
                            ? '⏰ Tomorrow'
                            : `${milestone.daysUntil} days to go`}
                        </Text>
                      </View>

                      <View style={styles.actions}>
                        <TouchableOpacity
                          onPress={() => {
                            setTitle(milestone.title);
                            setDate(milestone.date);
                            const parsedDate = new Date(`${milestone.date}T00:00:00`);
                            setSelectedDate(Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate);
                            setDescription(milestone.description || '');
                            setType(milestone.type);
                            setEditingId(milestone.id);
                            setShowModal(true);
                          }}
                        >
                          <Edit2 size={18} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(milestone.id)}>
                          <Trash2 size={18} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </LinearGradient>
              </Animated.View>
            ))
          )}
        </ScrollView>

        <Modal visible={showModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit' : 'Add'} Milestone
              </Text>

              <TextInput
                placeholder="Title (e.g., First Anniversary)"
                placeholderTextColor="#999"
                value={title}
                onChangeText={setTitle}
                style={styles.input}
              />

              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.8}
              >
                <Calendar size={16} color="#667eea" />
                <Text style={[styles.datePickerText, !date && styles.datePickerPlaceholder]}>
                  {formatDateForDisplay(date)}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                />
              )}

              <TextInput
                placeholder="Description (optional)"
                placeholderTextColor="#999"
                value={description}
                onChangeText={setDescription}
                style={[styles.input, styles.textArea]}
                multiline
              />

              <View style={styles.typeSelector}>
                {(['anniversary', 'birthday', 'special', 'goal'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.typeButton,
                      type === t && styles.typeButtonActive,
                    ]}
                    onPress={() => setType(t)}
                  >
                    <Text style={styles.typeButtonText}>{getTypeEmoji(t)} {t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
                disabled={isSaving}
              >
                <Text style={styles.saveButtonText}>
                  {isSaving ? 'Saving...' : 'Save Milestone'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  resetForm();
                  setShowModal(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Playfair-Bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  addButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  content: {
    flex: 1,
    padding: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#fff',
    marginTop: 12,
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    minHeight: 400,
  },
  emptyText: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
    textAlign: 'center',
  },
  milestoneCard: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardGradient: {
    padding: 16,
  },
  cardContent: {
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    fontSize: 28,
  },
  cardTitleContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#fff',
  },
  cardDate: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  daysContainer: {
    flex: 1,
  },
  daysText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: 'rgba(255,255,255,0.9)',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 500,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Playfair-Bold',
    color: '#333',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#333',
  },
  datePickerButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  datePickerText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#333',
  },
  datePickerPlaceholder: {
    color: '#999',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typeButton: {
    flex: 0.48,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  typeButtonActive: {
    borderColor: '#667eea',
    backgroundColor: '#f0f4ff',
  },
  typeButtonText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#333',
  },
  saveButton: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#fff',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
  },
});
