import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Heart, UserPlus, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function CoupleOptionsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['#ff6b9d', '#c44569']}
        style={styles.gradient}
      >
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Heart size={48} color="#ffffff" fill="#ffffff" />
            </View>
            <Text style={styles.title}>Choose Your Path</Text>
            <Text style={styles.subtitle}>
              Are you starting fresh or joining your partner?
            </Text>
          </View>

          <View style={styles.options}>
            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => {
                // Create new couple - go to nickname, then generate code
                // @ts-ignore
                router.push('/(auth)/nickname');
              }}
              activeOpacity={0.8}
            >
              <View style={styles.optionIconContainer}>
                <UserPlus size={40} color="#ff6b9d" />
              </View>
              <Text style={styles.optionTitle}>Start New Couple</Text>
              <Text style={styles.optionDescription}>
                I'm the first one. I'll create a code for my partner to join.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => {
                // Join existing couple - enter code and nickname
                // @ts-ignore
                router.push('/(auth)/join-couple');
              }}
              activeOpacity={0.8}
            >
              <View style={styles.optionIconContainer}>
                <Users size={40} color="#ff6b9d" />
              </View>
              <Text style={styles.optionTitle}>Join Existing Couple</Text>
              <Text style={styles.optionDescription}>
                My partner has a code. I'll enter it to connect with them.
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              💡 Both options lead to the same place - a shared space for just the two of you
            </Text>
          </View>
        </ScrollView>
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
    paddingTop: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
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
    textAlign: 'center',
    opacity: 0.95,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  options: {
    gap: 20,
    marginBottom: 32,
  },
  optionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  optionIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 107, 157, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  optionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  optionDescription: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  infoBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 20,
  },
});
