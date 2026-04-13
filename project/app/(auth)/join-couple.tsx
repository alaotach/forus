import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyRound, User, Heart } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { getCurrentUser, joinCoupleWithCode } from '@/services/auth';
import { useCouple } from '@/hooks/useCouple';

export default function JoinCoupleScreen() {
  const router = useRouter();
  const { saveCoupleData } = useCouple();
  const [coupleCode, setCoupleCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const user = getCurrentUser();

  const handleJoin = async () => {
    if (!coupleCode.trim() || !nickname.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (coupleCode.trim().length !== 6) {
      Alert.alert('Error', 'Couple code must be 6 digits');
      return;
    }

    if (nickname.trim().length < 2) {
      Alert.alert('Error', 'Nickname must be at least 2 characters');
      return;
    }

    setLoading(true);
    Keyboard.dismiss();

    try {
      const result = await joinCoupleWithCode(
        user!.uid,
        coupleCode.trim(),
        nickname.trim()
      );

      if (result.success) {
        // Save couple data locally
        await saveCoupleData({
          nickname: nickname.trim(),
          coupleCode: coupleCode.trim(),
        });
        
        Alert.alert(
          'Connected!',
          `You've successfully connected with ${result.partnerNickname}!`,
          [
            {
              text: 'Let\'s Go!',
              onPress: () => {
                router.replace('/(tabs)');
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to join couple');
      }
    } catch (error: any) {
      console.error('Join error:', error);
      Alert.alert('Error', error.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={['#ff6b9d', '#c44569']} style={styles.gradient}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Heart size={48} color="#ffffff" fill="#ffffff" />
              </View>
              <Text style={styles.title}>Join Your Partner</Text>
              <Text style={styles.subtitle}>
                Enter your partner's couple code to connect
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputWrapper}>
                <KeyRound size={20} color="#ff6b9d" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="000000"
                  placeholderTextColor="#999"
                  value={coupleCode}
                  onChangeText={(text) => {
                    const digits = text.replace(/[^0-9]/g, '').slice(0, 6);
                    setCoupleCode(digits);
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!loading}
                  autoFocus
                />
              </View>
              <Text style={styles.inputHint}>Enter 6-digit code</Text>

              <View style={styles.inputWrapper}>
                <User size={20} color="#ff6b9d" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Your nickname"
                  placeholderTextColor="#999"
                  value={nickname}
                  onChangeText={setNickname}
                  autoCapitalize="words"
                  editable={!loading}
                />
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleJoin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ff6b9d" />
                ) : (
                  <Text style={styles.buttonText}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>💡 Don't have a code?</Text>
              <Text style={styles.infoText}>
                Ask your partner to share their couple code with you. Once connected, you'll both have full access to the app!
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
    marginTop: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.95,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  form: {
    marginBottom: 24,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: '#333',
  },
  inputHint: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.8,
    marginBottom: 20,
    marginLeft: 4,
  },
  button: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ff6b9d',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 20,
    opacity: 0.9,
  },
});
