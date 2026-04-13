/**
 * Push Notifications Service
 * Handles Firebase Cloud Messaging (FCM) for push notifications
 * Works even when app is closed or in background
 */

import { db } from './firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { router } from 'expo-router';

// Conditional imports - these will be available after installing packages
let Notifications: any;
let Device: any;
let Constants: any;

try {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
  Constants = require('expo-constants');
} catch (error) {
  console.warn('Push notification packages not yet installed. Run: expo install expo-notifications expo-device');
}

/**
 * Configure notification handler
 * This runs when notification is received while app is in foreground
 */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Request push notification permissions from user
 * Required before sending push notifications
 */
export async function requestPushNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return false;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permissions denied');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
}

/**
 * Get device push token for FCM
 * This token is used to send push notifications to this device
 */
export async function getPushToken(): Promise<string | null> {
  try {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId || '',
    });
    
    console.log('Push token obtained:', token.data);
    return token.data;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
}

/**
 * Save device push token to Firestore
 * This allows backend to send notifications to this specific device
 */
export async function savePushToken(coupleCode: string, nickname: string, token: string): Promise<void> {
  try {
    const userRef = doc(db, 'couples', coupleCode);
    
    await setDoc(userRef, {
      [`pushTokens.${nickname}`]: token,
      updatedAt: new Date(),
    }, { merge: true });
    
    console.log('Push token saved to Firestore');
  } catch (error) {
    console.error('Error saving push token:', error);
  }
}

/**
 * Initialize push notifications on app startup
 * Call this once in your root component
 */
export async function initializePushNotifications(coupleCode: string, nickname: string): Promise<void> {
  try {
    // Configure notification handler
    configureNotifications();

    // Request permissions
    const hasPermission = await requestPushNotificationPermissions();
    if (!hasPermission) {
      console.log('Push notifications not enabled');
      return;
    }

    // Get push token
    const token = await getPushToken();
    if (!token) {
      console.log('Failed to get push token');
      return;
    }

    // Save token to Firestore
    await savePushToken(coupleCode, nickname, token);

    // Listen for incoming notifications
    setupNotificationListeners();
  } catch (error) {
    console.error('Error initializing push notifications:', error);
  }
}

/**
 * Setup listeners for when notifications are received
 */
function setupNotificationListeners(): void {
  if (!Notifications) {
    console.warn('Notifications not available');
    return;
  }

  // When notification is received while app is in foreground
  Notifications.addNotificationReceivedListener((notification: any) => {
    console.log('Notification received:', notification);
  });

  // When user taps on notification
  Notifications.addNotificationResponseReceivedListener((response: any) => {
    console.log('Notification tapped:', response);
    
    const data = response.notification.request.content.data;
    
    // Handle navigation based on notification type
    if (data?.type === 'message') {
      router.push('/(tabs)/chat');
    } else if (data?.type === 'paragraph') {
      router.push('/(tabs)/write');
    } else if (data?.type === 'memory') {
      router.push('/(tabs)/vault');
    } else if (data?.type === 'streak' || data?.type === 'milestone') {
      router.push('/(tabs)/index');
    }
  });
}

/**
 * Send a local notification (for testing)
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  seconds: number = 5
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
      },
      trigger: { seconds },
    });
  } catch (error) {
    console.error('Error sending local notification:', error);
  }
}

/**
 * Example of backend-triggered push notification
 * In production, your backend would send this via Firebase Cloud Messaging
 *
 * Backend example (Node.js):
 * ```
 * const message = {
 *   notification: {
 *     title: "New message from Alex",
 *     body: "Hey, how was your day?"
 *   },
 *   data: {
 *     type: "message",
 *     coupleCode: "ABC123"
 *   },
 *   token: "ExponentPushToken[...]"
 * };
 * 
 * await admin.messaging().send(message);
 * ```
 */
