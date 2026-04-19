/**
 * Push Notifications Service
 * Handles Firebase Cloud Messaging (FCM) for push notifications
 * Works even when app is closed or in background
 */

import { db } from './firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { router } from 'expo-router';
import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readCoupleIdentityFromStorage, requestForusWidgetUpdate, syncWidgetCacheFromFirestore } from './androidWidget';

// Conditional imports - these will be available after installing packages
let Notifications: any;
let Device: any;
let Constants: any;
let TaskManager: any;
let IntentLauncher: any;
const FALLBACK_EAS_PROJECT_ID = '29c01ff4-4e9c-4f8d-8157-7698e33ea68c';
const WIDGET_UPDATE_TASK = 'forus-widget-update-task';
const BG_RELIABILITY_PROMPT_KEY = 'android_bg_reliability_prompt_v1';
let activeRoutePath = '';
const REMINDER_STORAGE_PREFIX = 'notif_reminders_v1';
const OS_NOTIF_LOG_PREFIX = '[os-notif]';
let listenersRegistered = false;
let backgroundTaskRegistered = false;
type ReminderKind = 'paragraph' | 'deep-question';

try {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
  Constants = require('expo-constants');
  try {
    IntentLauncher = require('expo-intent-launcher');
  } catch {
    IntentLauncher = null;
  }
  try {
    TaskManager = require('expo-task-manager');
  } catch {
    TaskManager = null;
  }
} catch (error) {
  console.warn('Push notification packages not yet installed. Run: expo install expo-notifications expo-device');
}

function isWidgetUpdatePayload(data: any): boolean {
  return String(data?.type || '') === 'widget-update' && typeof data?.coupleCode === 'string';
}

async function refreshAndroidWidgetFromPush(payload: any) {
  if (Platform.OS !== 'android') return;
  if (!isWidgetUpdatePayload(payload)) return;

  const identity = await readCoupleIdentityFromStorage();
  if (!identity?.coupleCode || !identity?.nickname) return;
  if (identity.coupleCode !== String(payload.coupleCode)) return;

  try {
    await syncWidgetCacheFromFirestore(identity);
    await requestForusWidgetUpdate(identity.coupleCode);
    console.log(`${OS_NOTIF_LOG_PREFIX} widget-updated-from-push`, {
      coupleCode: identity.coupleCode,
    });
  } catch (error) {
    console.error(`${OS_NOTIF_LOG_PREFIX} widget-update-from-push-failed`, error);
  }
}

if (
  Notifications &&
  TaskManager?.defineTask &&
  typeof TaskManager.isTaskDefined === 'function' &&
  !TaskManager.isTaskDefined(WIDGET_UPDATE_TASK)
) {
  TaskManager.defineTask(WIDGET_UPDATE_TASK, async ({ data, error }: any) => {
    if (error) {
      console.error(`${OS_NOTIF_LOG_PREFIX} background-task-error`, error);
      return;
    }

    const payload = data?.notification?.request?.content?.data || {};
    await refreshAndroidWidgetFromPush(payload);
  });
}

export function setActiveNotificationRoute(pathname: string) {
  activeRoutePath = pathname || '';
}

function getAndroidPackageId(): string {
  return String(
    Constants?.expoConfig?.android?.package ||
    Constants?.manifest2?.extra?.expoClient?.android?.package ||
    Constants?.manifest?.android?.package ||
    'com.alaotach.forus'
  );
}

async function openAndroidIntent(action: string, data?: string) {
  try {
    if (IntentLauncher?.startActivityAsync) {
      await IntentLauncher.startActivityAsync(action, data ? { data } : undefined);
      return;
    }
  } catch (error) {
    console.warn('Failed to open Android intent, falling back to app settings:', error);
  }

  await Linking.openSettings();
}

export async function promptAndroidBackgroundReliabilitySettings(force = false): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    if (!force) {
      const hasPrompted = await AsyncStorage.getItem(BG_RELIABILITY_PROMPT_KEY);
      if (hasPrompted === '1') return;
    }

    Alert.alert(
      'Keep Widgets Updating',
      'To get instant widget updates, allow background activity and disable battery optimization for Forus.',
      [
        {
          text: 'Battery optimization',
          onPress: async () => {
            const packageId = getAndroidPackageId();
            await openAndroidIntent('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', `package:${packageId}`);
            await AsyncStorage.setItem(BG_RELIABILITY_PROMPT_KEY, '1');
          },
        },
        {
          text: 'App background settings',
          onPress: async () => {
            const packageId = getAndroidPackageId();
            await openAndroidIntent('android.settings.APPLICATION_DETAILS_SETTINGS', `package:${packageId}`);
            await AsyncStorage.setItem(BG_RELIABILITY_PROMPT_KEY, '1');
          },
        },
        {
          text: 'Later',
          style: 'cancel',
          onPress: async () => {
            await AsyncStorage.setItem(BG_RELIABILITY_PROMPT_KEY, '1');
          },
        },
      ]
    );
  } catch (error) {
    console.error('Error showing Android background reliability prompt:', error);
  }
}

function getTodayDateKey() {
  return new Date().toISOString().split('T')[0];
}

function getReminderStorageKey(coupleCode: string, nickname: string, kind: ReminderKind, dateKey: string) {
  return `${REMINDER_STORAGE_PREFIX}:${coupleCode}:${nickname}:${kind}:${dateKey}`;
}

function getRandomizedReminderTimes() {
  const end = new Date();
  end.setHours(22, 0, 0, 0);

  const windows = [
    { min: 60, max: 150 },
    { min: 240, max: 420 },
  ];

  const delaysInSeconds: number[] = [];
  const now = Date.now();
  for (const window of windows) {
    const randomOffset = Math.floor(Math.random() * (window.max - window.min + 1)) + window.min;
    const triggerTimestamp = now + randomOffset * 60 * 1000;
    if (triggerTimestamp < end.getTime()) {
      delaysInSeconds.push(randomOffset * 60);
    }
  }

  return delaysInSeconds;
}

async function hasCompletedDailyParagraph(coupleCode: string, nickname: string, dateKey: string) {
  const paragraphsRef = collection(db, 'dailyParagraphs');
  const paragraphQuery = query(
    paragraphsRef,
    where('coupleCode', '==', coupleCode),
    where('nickname', '==', nickname),
    where('date', '==', dateKey)
  );
  const snapshot = await getDocs(paragraphQuery);
  return !snapshot.empty;
}

async function hasCompletedDeepQuestion(coupleCode: string, nickname: string, dateKey: string) {
  const deepTalkRef = doc(db, 'deepTalks', coupleCode, 'items', dateKey);
  const deepTalkDoc = await getDoc(deepTalkRef);
  if (!deepTalkDoc.exists()) return false;
  const data = deepTalkDoc.data() as any;
  const answer = data?.responses?.[nickname]?.answer;
  return typeof answer === 'string' && answer.trim().length > 0;
}

async function cancelReminderGroup(coupleCode: string, nickname: string, kind: ReminderKind, dateKey: string) {
  const key = getReminderStorageKey(coupleCode, nickname, kind, dateKey);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    const ids: string[] = Array.isArray(parsed?.ids) ? parsed.ids : [];
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  } catch {
    // Ignore malformed stored values.
  }

  await AsyncStorage.removeItem(key);
}

async function ensureReminderGroup(
  coupleCode: string,
  nickname: string,
  kind: ReminderKind,
  dateKey: string,
  content: { title: string; body: string; type: string }
) {
  const key = getReminderStorageKey(coupleCode, nickname, kind, dateKey);
  await cancelReminderGroup(coupleCode, nickname, kind, dateKey);

  const reminderDelays = getRandomizedReminderTimes();
  if (reminderDelays.length === 0) return;

  const ids: string[] = [];
  for (const seconds of reminderDelays) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: content.title,
          body: content.body,
          sound: 'default',
          data: { type: content.type, coupleCode },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds,
          repeats: false,
          ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
        },
      });
      ids.push(id);
    } catch (error) {
      console.warn('Failed to schedule reminder notification:', error);
    }
  }

  if (ids.length > 0) {
    await AsyncStorage.setItem(key, JSON.stringify({ ids }));
  }
}

export async function refreshCompletionReminders(coupleCode: string, nickname: string): Promise<void> {
  if (!Notifications || !Device?.isDevice) return;

  try {
    const dateKey = getTodayDateKey();

    const paragraphDone = await hasCompletedDailyParagraph(coupleCode, nickname, dateKey);
    if (paragraphDone) {
      await cancelReminderGroup(coupleCode, nickname, 'paragraph', dateKey);
    } else {
      await ensureReminderGroup(coupleCode, nickname, 'paragraph', dateKey, {
        title: '📝 Daily writing reminder',
        body: 'Write your daily paragraph to unlock your partner\'s writing.',
        type: 'paragraph',
      });
    }

    const deepDone = await hasCompletedDeepQuestion(coupleCode, nickname, dateKey);
    if (deepDone) {
      await cancelReminderGroup(coupleCode, nickname, 'deep-question', dateKey);
    } else {
      await ensureReminderGroup(coupleCode, nickname, 'deep-question', dateKey, {
        title: '💭 Deep question reminder',
        body: 'Answer today\'s deep question to unlock your partner\'s response.',
        type: 'deep-question',
      });
    }
  } catch (error) {
    console.error('Error refreshing completion reminders:', error);
  }
}

/**
 * Configure notification handler
 * This runs when notification is received while app is in foreground
 */
export function configureNotifications() {
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#ff6b9d',
      sound: 'default',
    }).catch((error: any) => {
      console.error('Error configuring Android notification channel:', error);
    });
  }

  Notifications.setNotificationHandler({
    handleNotification: async (notification: any) => {
      const data = notification?.request?.content?.data || {};
      const notificationType = String(data?.type || '');
      const notificationTitle = String(notification?.request?.content?.title || '');
      const isChatRouteActive = activeRoutePath.includes('/chat');
      const suppressChatMessageBanner = isChatRouteActive && notificationType === 'message';

      console.log(`${OS_NOTIF_LOG_PREFIX} handleNotification`, {
        title: notificationTitle,
        type: notificationType,
        route: activeRoutePath,
        suppressChatMessageBanner,
      });

      return {
        // Keep both legacy and new fields for Expo SDK compatibility across builds.
        shouldShowAlert: !suppressChatMessageBanner,
        shouldShowBanner: !suppressChatMessageBanner,
        shouldShowList: !suppressChatMessageBanner,
        shouldPlaySound: !suppressChatMessageBanner,
        shouldSetBadge: true,
      };
    },
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

    console.log(`${OS_NOTIF_LOG_PREFIX} permission granted`, {
      existingStatus,
      finalStatus,
    });

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
    const projectIdFromEasConfig = Constants?.easConfig?.projectId;
    const projectIdFromExpoConfig = Constants?.expoConfig?.extra?.eas?.projectId;
    const projectIdFromManifest2 = Constants?.manifest2?.extra?.eas?.projectId;
    const projectIdFromManifest = Constants?.manifest?.extra?.eas?.projectId;
    const projectIdFromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

    const projectId =
      projectIdFromEasConfig ||
      projectIdFromExpoConfig ||
      projectIdFromManifest2 ||
      projectIdFromManifest ||
      projectIdFromEnv ||
      FALLBACK_EAS_PROJECT_ID;

    if (!projectId) {
      console.error('Missing EAS projectId for Expo push token generation');
      return null;
    }

    console.log('Resolving Expo push projectId source:', {
      hasEasConfig: Boolean(projectIdFromEasConfig),
      hasExpoConfig: Boolean(projectIdFromExpoConfig),
      hasManifest2: Boolean(projectIdFromManifest2),
      hasManifest: Boolean(projectIdFromManifest),
      hasEnv: Boolean(projectIdFromEnv),
      usingFallback: projectId === FALLBACK_EAS_PROJECT_ID,
    });

    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
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
      [`pushTokenMeta.${nickname}`]: {
        token,
        platform: Platform.OS,
        updatedAt: new Date(),
      },
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

    // Schedule/cancel same-day writing reminders based on current completion state.
    await refreshCompletionReminders(coupleCode, nickname);

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

  if (listenersRegistered) return;
  listenersRegistered = true;

  if (
    Platform.OS === 'android' &&
    TaskManager &&
    !backgroundTaskRegistered &&
    typeof Notifications.registerTaskAsync === 'function'
  ) {
    Notifications.registerTaskAsync(WIDGET_UPDATE_TASK)
      .then(() => {
        backgroundTaskRegistered = true;
        console.log(`${OS_NOTIF_LOG_PREFIX} background-task-registered`, { task: WIDGET_UPDATE_TASK });
      })
      .catch((error: any) => {
        console.error(`${OS_NOTIF_LOG_PREFIX} background-task-register-failed`, error);
      });
  }

  if (typeof Notifications.getLastNotificationResponseAsync === 'function') {
    Notifications.getLastNotificationResponseAsync()
      .then((response: any) => {
        if (!response) return;
        const data = response?.notification?.request?.content?.data || {};
        const title = response?.notification?.request?.content?.title;
        console.log(`${OS_NOTIF_LOG_PREFIX} app-opened-from-notification`, {
          title,
          data,
        });
        void refreshAndroidWidgetFromPush(data);
      })
      .catch((error: any) => {
        console.error(`${OS_NOTIF_LOG_PREFIX} last-response-check-failed`, error);
      });
  }

  // When notification is received while app is in foreground
  Notifications.addNotificationReceivedListener((notification: any) => {
    const data = notification?.request?.content?.data || {};
    void refreshAndroidWidgetFromPush(data);
    console.log(`${OS_NOTIF_LOG_PREFIX} notification-received`, {
      title: notification?.request?.content?.title,
      data,
      route: activeRoutePath,
    });
  });

  // When user taps on notification
  Notifications.addNotificationResponseReceivedListener((response: any) => {
    console.log(`${OS_NOTIF_LOG_PREFIX} notification-tapped`, {
      data: response?.notification?.request?.content?.data,
      title: response?.notification?.request?.content?.title,
    });
    
    const data = response.notification.request.content.data;
    void refreshAndroidWidgetFromPush(data);
    
    // Handle navigation based on notification type
    if (data?.type === 'message') {
      router.push('/(tabs)/chat');
    } else if (data?.type === 'deep-question') {
      router.push('/deep-talk');
    } else if (data?.type === 'shared-diary') {
      router.push('/shared-diary');
    } else if (data?.type === 'paragraph') {
      router.push('/(tabs)/write');
    } else if (data?.type === 'memory') {
      router.push('/(tabs)/vault');
    } else if (data?.type === 'streak' || data?.type === 'milestone') {
      router.push('/');
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
