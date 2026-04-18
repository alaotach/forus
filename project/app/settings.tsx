import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Switch, TouchableOpacity, Alert, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings as SettingsIcon, LogOut } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCouple } from '@/hooks/useCouple';
import { logoutUser } from '@/services/auth';

export default function SettingsScreen() {
  const router = useRouter();
  const { clearCoupleData } = useCouple();

  const performLogout = async () => {
    try {
      await clearCoupleData();
      await logoutUser();
      router.replace('/(auth)/auth');
    } catch (error) {
      console.error('Logout failed:', error);
      Alert.alert('Error', 'Unable to log out right now.');
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const proceed = typeof globalThis.confirm === 'function'
        ? globalThis.confirm('Are you sure you want to log out?')
        : true;
      if (proceed) {
        performLogout();
      }
      return;
    }

    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: performLogout,
        },
      ]
    );
  };

  return (
    <LinearGradient colors={['#fd79a8', '#fdcb6e']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <SettingsIcon size={24} color="#ffffff" />
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
        <ScrollView style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <View style={styles.row}>
              <Text style={styles.rowText}>Push Notifications</Text>
              <Switch value={true} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <TouchableOpacity style={styles.logoutRow} onPress={handleLogout}>
              <LogOut size={18} color="#ff4d6d" />
              <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
          </View>
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
  section: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 15, padding: 15, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  rowText: { fontSize: 16, color: '#333' },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff4d6d',
  },
});