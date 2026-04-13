import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HelpCircle, Send } from 'lucide-react-native';

export default function SupportScreen() {
  return (
    <LinearGradient colors={['#fd79a8', '#fdcb6e']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <HelpCircle size={24} color="#ffffff" />
          <Text style={styles.headerTitle}>Support</Text>
        </View>
        <ScrollView style={styles.content}>
          <View style={styles.formCard}>
            <Text style={styles.label}>How can we help you?</Text>
            <TextInput 
              style={styles.input}
              multiline
              numberOfLines={6}
              placeholder="Describe your issue or feedback..."
              placeholderTextColor="#999"
            />
            <TouchableOpacity 
              style={styles.button}
              onPress={() => Alert.alert('Sent', 'Thank you for your feedback!')}
            >
              <LinearGradient colors={['#00b894', '#00a085']} style={styles.buttonGradient}>
                <Send size={20} color="#ffffff" />
                <Text style={styles.buttonText}>Submit Feedback</Text>
              </LinearGradient>
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
  formCard: { backgroundColor: '#ffffff', borderRadius: 15, padding: 20 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  input: { backgroundColor: '#f5f6fa', borderRadius: 10, padding: 15, fontSize: 16, minHeight: 120, textAlignVertical: 'top' },
  button: { marginTop: 20, borderRadius: 12, overflow: 'hidden' },
  buttonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginLeft: 10 }
});