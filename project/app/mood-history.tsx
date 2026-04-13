import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Smile } from 'lucide-react-native';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useCouple } from '@/hooks/useCouple';

export default function MoodHistoryScreen() {
  const { coupleData } = useCouple();
  const [moods, setMoods] = useState<any[]>([]);

  useEffect(() => {
    if (!coupleData) return;
    const moodRef = collection(db, 'couples', coupleData.coupleCode, 'moodChecks');
    const q = query(moodRef, orderBy('timestamp', 'desc'));
    
    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMoods(items);
    });
  }, [coupleData]);

  return (
    <LinearGradient colors={['#a29bfe', '#6c5ce7']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Smile size={24} color="#ffffff" />
          <Text style={styles.headerTitle}>Mood History</Text>
        </View>
        <ScrollView style={styles.content}>
          {moods.length === 0 ? (
            <Text style={styles.emptyText}>No mood check-ins yet.</Text>
          ) : (
            moods.map((item, index) => (
              <View key={item.id || index} style={styles.moodCard}>
                <Text style={styles.moodEmoji}>{item.mood}</Text>
                <View style={styles.moodInfo}>
                  <Text style={styles.moodUser}>{item.user}</Text>
                  <Text style={styles.moodDate}>
                    {item.timestamp?.toDate ? new Date(item.timestamp.toDate()).toLocaleString() : 'Just now'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  headerTitle: { color: '#ffffff', fontSize: 24, fontWeight: 'bold', marginLeft: 10 },
  content: { padding: 20 },
  emptyText: { color: '#fff', fontSize: 16, textAlign: 'center', marginTop: 40 },
  moodCard: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 15, padding: 15, marginBottom: 15, flexDirection: 'row', alignItems: 'center' },
  moodEmoji: { fontSize: 32, marginRight: 15 },
  moodInfo: { flex: 1 },
  moodUser: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  moodDate: { fontSize: 12, color: '#666', marginTop: 4 }
});