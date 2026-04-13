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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Target, Plus, CircleCheck as CheckCircle2, Circle, Trash2, Flag } from 'lucide-react-native';
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
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { Goal } from '@/types/app';

export default function GoalsScreen() {
  const { coupleData, isConnected, isLoading } = useCouple();
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDescription, setNewGoalDescription] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // Wait for loading to complete
    if (isLoading) {
      return;
    }

    // Check connection and redirect if needed
    if (!isConnected || !coupleData) {
      console.log('Goals: Not connected, redirecting to auth');
      router.replace('/(auth)/auth');
      return;
    }

    const goalsRef = collection(db, 'goals', coupleData.coupleCode, 'items');
    const q = query(goalsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const goalsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Goal[];
      
      setGoals(goalsData);
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

  const addGoal = async () => {
    if (!newGoalTitle.trim() || !coupleData) return;

    try {
      const goalsRef = collection(db, 'goals', coupleData.coupleCode, 'items');
      const goalData: any = {
        title: newGoalTitle.trim(),
        completed: false,
        priority: selectedPriority,
        createdBy: coupleData.nickname,
        createdAt: serverTimestamp(),
      };

      // Only add description if it has content
      if (newGoalDescription.trim()) {
        goalData.description = newGoalDescription.trim();
      }

      await addDoc(goalsRef, goalData);

      setNewGoalTitle('');
      setNewGoalDescription('');
      setSelectedPriority('medium');
      setIsAddingGoal(false);
    } catch (error) {
      console.error('Error adding goal:', error);
      Alert.alert('Error', 'Failed to add goal');
    }
  };

  const toggleGoal = async (goalId: string, completed: boolean) => {
    if (!coupleData) return;

    try {
      const goalRef = doc(db, 'goals', coupleData.coupleCode, 'items', goalId);
      const updateData: any = {
        completed: !completed,
      };

      if (!completed) {
        // Mark as completed
        updateData.completedBy = coupleData.nickname;
        updateData.completedAt = serverTimestamp();
      } else {
        // Mark as incomplete - don't set null, just delete the fields
        // For Firestore, we need to explicitly not include these fields
        // So we'll just update with completed: false
      }

      await updateDoc(goalRef, updateData);
    } catch (error) {
      console.error('Error updating goal:', error);
      Alert.alert('Error', 'Failed to update goal');
    }
  };

  const deleteGoal = async (goalId: string) => {
    if (!coupleData) return;

    Alert.alert(
      'Delete Goal',
      'Are you sure you want to delete this goal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const goalRef = doc(db, 'goals', coupleData.coupleCode, 'items', goalId);
              await deleteDoc(goalRef);
            } catch (error) {
              console.error('Error deleting goal:', error);
              Alert.alert('Error', 'Failed to delete goal');
            }
          }
        }
      ]
    );
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#ff6b6b';
      case 'medium': return '#fdcb6e';
      case 'low': return '#00b894';
      default: return '#fdcb6e';
    }
  };

  const getPriorityEmoji = (priority: string) => {
    switch (priority) {
      case 'high': return '🔥';
      case 'medium': return '⭐';
      case 'low': return '🌱';
      default: return '⭐';
    }
  };

  // Show loading state while checking connection
  if (isLoading) {
    return (
      <LinearGradient colors={['#00b894', '#00a085']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Target size={48} color="#ffffff" />
            <Text style={styles.loadingText}>Loading your goals...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Don't render if not connected (will redirect)
  if (!isConnected || !coupleData) {
    return null;
  }

  const completedGoals = goals.filter(goal => goal.completed);
  const pendingGoals = goals.filter(goal => !goal.completed);

  return (
    <LinearGradient colors={['#00b894', '#00a085']} style={styles.container}>
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
          <Target size={24} color="#ffffff" />
          <Text style={styles.headerTitle}>Shared Goals 🎯</Text>
        </Animated.View>

        <View style={styles.content}>
          <Animated.View 
            style={[
              styles.statsContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{completedGoals.length}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{pendingGoals.length}</Text>
              <Text style={styles.statLabel}>In Progress</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{goals.length}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </Animated.View>

          <ScrollView style={styles.goalsList} showsVerticalScrollIndicator={false}>
            {/* Add Goal Section */}
            {isAddingGoal ? (
              <Animated.View 
                style={[
                  styles.addGoalContainer,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                  },
                ]}
              >
                <TextInput
                  style={styles.addGoalInput}
                  placeholder="What do you want to achieve together?"
                  placeholderTextColor="#a0a0a0"
                  value={newGoalTitle}
                  onChangeText={setNewGoalTitle}
                  autoFocus
                />
                <TextInput
                  style={styles.addGoalDescription}
                  placeholder="Add details (optional)"
                  placeholderTextColor="#a0a0a0"
                  value={newGoalDescription}
                  onChangeText={setNewGoalDescription}
                  multiline
                />
                
                <View style={styles.prioritySection}>
                  <Text style={styles.priorityLabel}>Priority:</Text>
                  <View style={styles.priorityButtons}>
                    {(['low', 'medium', 'high'] as const).map((priority) => (
                      <TouchableOpacity
                        key={priority}
                        style={[
                          styles.priorityButton,
                          selectedPriority === priority && styles.selectedPriority,
                          { borderColor: getPriorityColor(priority) }
                        ]}
                        onPress={() => setSelectedPriority(priority)}
                      >
                        <Text style={styles.priorityEmoji}>{getPriorityEmoji(priority)}</Text>
                        <Text style={[
                          styles.priorityText,
                          selectedPriority === priority && { color: getPriorityColor(priority) }
                        ]}>
                          {priority}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.addGoalButtons}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setIsAddingGoal(false);
                      setNewGoalTitle('');
                      setNewGoalDescription('');
                      setSelectedPriority('medium');
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveButton, !newGoalTitle.trim() && styles.saveButtonDisabled]}
                    onPress={addGoal}
                    disabled={!newGoalTitle.trim()}
                  >
                    <LinearGradient
                      colors={['#00a085', '#00b894']}
                      style={styles.saveButtonGradient}
                    >
                      <Text style={styles.saveButtonText}>Add Goal</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            ) : (
              <Animated.View 
                style={[
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.addGoalPrompt}
                  onPress={() => setIsAddingGoal(true)}
                >
                  <Plus size={20} color="#00b894" />
                  <Text style={styles.addGoalPromptText}>Add a new goal together</Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Pending Goals */}
            {pendingGoals.length > 0 && (
              <Animated.View 
                style={[
                  styles.section,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                  },
                ]}
              >
                <Text style={styles.sectionTitle}>In Progress ⏳</Text>
                {pendingGoals.map((goal, index) => (
                  <Animated.View 
                    key={goal.id} 
                    style={[
                      styles.goalItem,
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
                    <TouchableOpacity
                      style={styles.goalCheckbox}
                      onPress={() => toggleGoal(goal.id, goal.completed)}
                    >
                      <Circle size={20} color="#00b894" />
                    </TouchableOpacity>
                    <View style={styles.goalContent}>
                      <View style={styles.goalHeader}>
                        <Text style={styles.goalTitle}>{goal.title}</Text>
                        <View style={styles.goalMeta}>
                          <Text style={styles.priorityEmoji}>{getPriorityEmoji(goal.priority || 'medium')}</Text>
                          <Flag size={12} color={getPriorityColor(goal.priority || 'medium')} />
                        </View>
                      </View>
                      {goal.description && (
                        <Text style={styles.goalDescription}>{goal.description}</Text>
                      )}
                      <Text style={styles.goalCreator}>Created by {goal.createdBy}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteGoal(goal.id)}
                    >
                      <Trash2 size={16} color="#ff6b6b" />
                    </TouchableOpacity>
                  </Animated.View>
                ))}
              </Animated.View>
            )}

            {/* Completed Goals */}
            {completedGoals.length > 0 && (
              <Animated.View 
                style={[
                  styles.section,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                  },
                ]}
              >
                <Text style={styles.sectionTitle}>Completed ✅</Text>
                {completedGoals.map((goal, index) => (
                  <Animated.View 
                    key={goal.id} 
                    style={[
                      styles.goalItem,
                      styles.completedGoalItem,
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
                    <TouchableOpacity
                      style={styles.goalCheckbox}
                      onPress={() => toggleGoal(goal.id, goal.completed)}
                    >
                      <CheckCircle2 size={20} color="#00b894" />
                    </TouchableOpacity>
                    <View style={styles.goalContent}>
                      <Text style={[styles.goalTitle, styles.completedGoalTitle]}>
                        {goal.title}
                      </Text>
                      {goal.description && (
                        <Text style={[styles.goalDescription, styles.completedGoalDescription]}>
                          {goal.description}
                        </Text>
                      )}
                      {goal.completedBy && (
                        <Text style={styles.goalMeta}>
                          Completed by {goal.completedBy}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteGoal(goal.id)}
                    >
                      <Trash2 size={16} color="#ff6b6b" />
                    </TouchableOpacity>
                  </Animated.View>
                ))}
              </Animated.View>
            )}

            {goals.length === 0 && !isAddingGoal && (
              <Animated.View 
                style={[
                  styles.emptyState,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                  },
                ]}
              >
                <Target size={48} color="#00b894" />
                <Text style={styles.emptyStateTitle}>No goals yet</Text>
                <Text style={styles.emptyStateText}>
                  Set some goals to achieve together and grow stronger as a couple
                </Text>
              </Animated.View>
            )}
          </ScrollView>
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
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statNumber: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#00b894',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#666',
  },
  goalsList: {
    flex: 1,
    paddingBottom: 100,
  },
  addGoalPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#00b894',
    borderStyle: 'dashed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  addGoalPromptText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#00b894',
    marginLeft: 8,
  },
  addGoalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  addGoalInput: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#00b894',
  },
  addGoalDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#333',
    marginBottom: 16,
    minHeight: 60,
    textAlignVertical: 'top',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
  },
  prioritySection: {
    marginBottom: 16,
  },
  priorityLabel: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    marginBottom: 8,
  },
  priorityButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priorityButton: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    marginHorizontal: 4,
    backgroundColor: '#f8f9fa',
  },
  selectedPriority: {
    backgroundColor: '#ffffff',
  },
  priorityEmoji: {
    fontSize: 16,
    marginBottom: 4,
  },
  priorityText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#666',
    textTransform: 'capitalize',
  },
  addGoalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#666',
  },
  saveButton: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonGradient: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginBottom: 12,
  },
  goalItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  completedGoalItem: {
    opacity: 0.7,
  },
  goalCheckbox: {
    marginRight: 12,
    marginTop: 2,
  },
  goalContent: {
    flex: 1,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  goalTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    lineHeight: 20,
    flex: 1,
  },
  completedGoalTitle: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
  goalDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
    lineHeight: 18,
    marginBottom: 4,
  },
  completedGoalDescription: {
    color: '#999',
  },
  goalMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  goalCreator: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#999',
  },
  deleteButton: {
    padding: 4,
    marginLeft: 8,
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
    lineHeight: 22,
  },
});