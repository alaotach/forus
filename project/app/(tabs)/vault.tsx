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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Archive, Plus, FileText, Image as ImageIcon, Mic, Heart, Star } from 'lucide-react-native';
import { useCouple } from '@/hooks/useCouple';
import { useRouter } from 'expo-router';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { VaultItem } from '@/types/app';

export default function VaultScreen() {
  const { coupleData, isConnected, isLoading } = useCouple();
  const router = useRouter();
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'letters' | 'photos' | 'audios'>('all');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // Wait for loading to complete
    if (isLoading) {
      return;
    }

    // Check connection and redirect if needed
    if (!isConnected || !coupleData) {
      console.log('Vault: Not connected, redirecting to pairing');
      router.replace('/pairing');
      return;
    }

    const vaultRef = collection(db, 'vault', coupleData.coupleCode, 'items');
    const q = query(vaultRef, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as VaultItem[];
      
      setVaultItems(items);
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

  const handleAddItem = (type: 'letter' | 'photo' | 'audio') => {
    Alert.alert('Coming Soon', `${type} creation will be implemented soon! 💕`);
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
            By {item.author} • {new Date(item.timestamp.toDate()).toLocaleDateString()}
          </Text>
        </View>
      </View>
      
      {item.type === 'photo' && item.url && (
        <Image source={{ uri: item.url }} style={styles.photoPreview} />
      )}
      
      {item.content && (
        <Text style={styles.vaultItemPreview} numberOfLines={2}>
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
              style={styles.addButton}
              onPress={() => handleAddItem('letter')}
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
              style={styles.addButton}
              onPress={() => handleAddItem('photo')}
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
              style={styles.addButton}
              onPress={() => handleAddItem('audio')}
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
});