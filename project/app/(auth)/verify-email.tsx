import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MailCheck, RefreshCcw, Send } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import {
  getCurrentUser,
  logoutUser,
  refreshCurrentUser,
  resendVerificationEmailToCurrentUser,
} from '@/services/auth';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const user = getCurrentUser();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleResend = async () => {
    setSending(true);
    try {
      const result = await resendVerificationEmailToCurrentUser();
      if (result.success) {
        Alert.alert('Sent', 'Verification email sent. Check your inbox and spam folder.');
      } else {
        Alert.alert('Error', result.error || 'Failed to send verification email.');
      }
    } finally {
      setSending(false);
    }
  };

  const handleIVerified = async () => {
    setChecking(true);
    try {
      const refreshed = await refreshCurrentUser();
      if (!refreshed) {
        Alert.alert('Session expired', 'Please sign in again.');
        router.replace('/(auth)/auth');
        return;
      }

      if (refreshed.emailVerified) {
        router.replace('/(auth)/couple-check');
      } else {
        Alert.alert('Not verified yet', 'Your email is still unverified. Tap resend if needed.');
      }
    } finally {
      setChecking(false);
    }
  };

  const handleUseDifferentEmail = async () => {
    try {
      await logoutUser();
      router.replace('/(auth)/auth');
    } catch {
      router.replace('/(auth)/auth');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={['#ff6b9d', '#c44569']} style={styles.gradient}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MailCheck size={42} color="#ff6b9d" />
          </View>
          <Text style={styles.title}>Verify Your Email</Text>
          <Text style={styles.subtitle}>
            We sent a verification link to:
          </Text>
          <Text style={styles.email}>{user?.email || 'your email address'}</Text>

          <TouchableOpacity
            style={[styles.primaryButton, checking && styles.disabledButton]}
            onPress={handleIVerified}
            disabled={checking}
          >
            {checking ? <ActivityIndicator color="#ffffff" /> : <RefreshCcw size={18} color="#ffffff" />}
            <Text style={styles.primaryText}>I Verified My Email</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, sending && styles.disabledButton]}
            onPress={handleResend}
            disabled={sending}
          >
            {sending ? <ActivityIndicator color="#ff6b9d" /> : <Send size={18} color="#ff6b9d" />}
            <Text style={styles.secondaryText}>Resend Email</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleUseDifferentEmail}>
            <Text style={styles.switchText}>Use a different email</Text>
          </TouchableOpacity>
        </View>
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
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  iconWrap: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#ffeaf1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    color: '#2e2331',
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#76687d',
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  email: {
    marginTop: 6,
    marginBottom: 20,
    fontSize: 15,
    color: '#3e3442',
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: '#ff6b9d',
    marginBottom: 10,
    gap: 8,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  secondaryButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#ffc1d5',
    backgroundColor: '#fff6fa',
    marginBottom: 16,
    gap: 8,
  },
  secondaryText: {
    color: '#ff6b9d',
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  switchText: {
    color: '#8c7a90',
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    textDecorationLine: 'underline',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
