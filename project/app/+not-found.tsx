import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart } from 'lucide-react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <LinearGradient colors={['#ff9a9e', '#fecfef']} style={styles.container}>
        <View style={styles.content}>
          <Heart size={48} color="#ffffff" />
          <Text style={styles.title}>Oops! 💕</Text>
          <Text style={styles.text}>This page doesn't exist in our love space.</Text>
          <Link href="/" style={styles.link}>
            <Text style={styles.linkText}>Go back home</Text>
          </Link>
        </View>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontFamily: 'Playfair-Bold',
    color: '#ffffff',
    marginTop: 16,
    marginBottom: 8,
  },
  text: {
    fontSize: 18,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.9,
  },
  link: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  linkText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
  },
});