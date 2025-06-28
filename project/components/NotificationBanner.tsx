import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Heart } from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface NotificationBannerProps {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onPress?: () => void;
  type?: 'message' | 'activity' | 'reminder';
}

export default function NotificationBanner({
  visible,
  title,
  message,
  onClose,
  onPress,
  type = 'message'
}: NotificationBannerProps) {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-hide after 4 seconds
      const timer = setTimeout(() => {
        hideNotification();
      }, 4000);

      return () => clearTimeout(timer);
    } else {
      hideNotification();
    }
  }, [visible]);

  const hideNotification = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const getGradientColors = () => {
    switch (type) {
      case 'message':
        return ['#ff6b9d', '#c44569'];
      case 'activity':
        return ['#74b9ff', '#0984e3'];
      case 'reminder':
        return ['#a29bfe', '#6c5ce7'];
      default:
        return ['#ff6b9d', '#c44569'];
    }
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.banner}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={getGradientColors()}
          style={styles.gradient}
        >
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Heart size={20} color="#ffffff" fill="#ffffff" />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.message} numberOfLines={2}>
                {message}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={hideNotification}
            >
              <X size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  banner: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 12,
  },
  gradient: {
    padding: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
    marginBottom: 2,
  },
  message: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    opacity: 0.9,
    lineHeight: 18,
  },
  closeButton: {
    padding: 4,
    marginLeft: 8,
  },
});