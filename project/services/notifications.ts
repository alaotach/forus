import { db } from './firebase';
import { doc, setDoc, collection, query, where, onSnapshot, serverTimestamp, updateDoc, getDocs, getDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { auth } from './firebase';

const PUSH_SEND_LOG_PREFIX = '[push-send]';
const OS_FALLBACK_LOG_PREFIX = '[os-fallback]';
const localFallbackSeenIds = new Set<string>();
let Notifications: any;

function resolveBackendBaseUrl(): string {
  const fromEnv = String(process.env.EXPO_PUBLIC_BACKEND_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return String(window.location.origin).replace(/\/$/, '');
  }

  return '';
}

try {
  Notifications = require('expo-notifications');
} catch {
  Notifications = null;
}

export interface NotificationEvent {
  type: 'message' | 'paragraph' | 'memory' | 'streak' | 'milestone' | 'echo' | 'goal' | 'mood' | 'deep-question' | 'shared-diary' | 'widget-update';
  coupleCode: string;
  title: string;
  body: string;
  from?: string;
  timestamp: any;
  read: boolean;
}

function rememberLocalFallbackId(id: string) {
  localFallbackSeenIds.add(id);
  if (localFallbackSeenIds.size > 500) {
    const oldest = localFallbackSeenIds.values().next().value;
    if (oldest) {
      localFallbackSeenIds.delete(oldest);
    }
  }
}

async function maybeScheduleLocalOsFallback(notification: NotificationEvent & { id: string }) {
  try {
    if (!Notifications || Platform.OS === 'web') return;
    if (!notification?.id) return;
    if (localFallbackSeenIds.has(notification.id)) return;

    rememberLocalFallbackId(notification.id);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title || 'New update',
        body: notification.body || 'You have a new notification',
        sound: 'default',
        data: {
          id: notification.id,
          type: notification.type,
          coupleCode: notification.coupleCode,
          from: notification.from || 'System',
          source: 'firestore-local-fallback',
        },
        ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
      },
      trigger: null,
    });

    console.log(`${OS_FALLBACK_LOG_PREFIX} scheduled`, {
      id: notification.id,
      type: notification.type,
    });
  } catch (error) {
    console.warn(`${OS_FALLBACK_LOG_PREFIX} failed`, error);
  }
}

export async function sendNotification(
  coupleCode: string,
  type: NotificationEvent['type'],
  title: string,
  body: string,
  from?: string
) {
  try {
    const notificationRef = collection(db, 'notifications', coupleCode, 'events');
    
    await setDoc(doc(notificationRef), {
      type,
      coupleCode,
      title,
      body,
      from: from || 'System',
      timestamp: serverTimestamp(),
      read: false,
    });

    await dispatchExpoPushNotifications(coupleCode, {
      title,
      body,
      from,
      type,
    });

    console.log(`Notification sent: ${title}`);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

async function dispatchExpoPushNotifications(
  coupleCode: string,
  payload: {
    title?: string;
    body?: string;
    type: NotificationEvent['type'];
    from?: string;
    silent?: boolean;
    ttlSeconds?: number;
  }
) {
  try {
    const coupleRef = doc(db, 'couples', coupleCode);
    const coupleSnap = await getDoc(coupleRef);
    if (!coupleSnap.exists()) {
      console.log(`${PUSH_SEND_LOG_PREFIX} couple-doc-missing`, { coupleCode, type: payload.type });
      return;
    }

    const coupleData = coupleSnap.data() as any;
    const pushTokens = (coupleData?.pushTokens || {}) as Record<string, string>;
    const pushTokensByUid = (coupleData?.pushTokensByUid || {}) as Record<string, string>;
    const nativePushTokensByUid = (coupleData?.nativePushTokensByUid || {}) as Record<string, string>;

    const nicknameScopedTokens = Object.entries(pushTokens)
      .filter(([, token]) => typeof token === 'string' && token.trim().length > 0)
      .map(([, token]) => token.trim());

    const uidScopedTokens = Object.values(pushTokensByUid)
      .filter((token) => typeof token === 'string' && token.trim().length > 0)
      .map((token) => token.trim());

    const allTokens = [...nicknameScopedTokens, ...uidScopedTokens]
      .filter((token, index, arr) => arr.indexOf(token) === index);

    const nativeTokens = Object.values(nativePushTokensByUid)
      .filter((token) => typeof token === 'string' && token.trim().length > 0)
      .map((token) => token.trim())
      .filter((token, index, arr) => arr.indexOf(token) === index);

    let recipientTokens = Object.entries(pushTokens)
      .filter(([nickname, token]) => nickname !== payload.from && typeof token === 'string' && token.trim().length > 0)
      .map(([, token]) => token.trim())
      .filter((token, index, arr) => arr.indexOf(token) === index);

    // If sender-key filtering removed every target (nickname mismatch/collision),
    // fallback to all unique tokens so partner pushes are not silently dropped.
    if (recipientTokens.length === 0 && allTokens.length > 0) {
      recipientTokens = allTokens;
      console.log(`${PUSH_SEND_LOG_PREFIX} fallback-all-tokens`, {
        coupleCode,
        type: payload.type,
        from: payload.from || 'System',
      });
    }

    console.log(`${PUSH_SEND_LOG_PREFIX} recipients-resolved`, {
      coupleCode,
      type: payload.type,
      from: payload.from || 'System',
      pushTokenOwners: Object.keys(pushTokens),
      pushTokenUidOwners: Object.keys(pushTokensByUid),
      nativePushTokenUidOwners: Object.keys(nativePushTokensByUid),
      pushTokenLegacyCount: nicknameScopedTokens.length,
      pushTokenUidCount: uidScopedTokens.length,
      nativePushTokenCount: nativeTokens.length,
      pushTokenUniqueCount: allTokens.length,
      recipientCount: recipientTokens.length,
    });

    if (recipientTokens.length === 0 && nativeTokens.length === 0) {
      console.log(`${PUSH_SEND_LOG_PREFIX} no-recipient-token`, {
        coupleCode,
        type: payload.type,
        from: payload.from || 'System',
      });
      return;
    }

    const backendBaseUrl = resolveBackendBaseUrl();
    if (backendBaseUrl) {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (idToken) {
          headers.Authorization = `Bearer ${idToken}`;
        }

        const backendResponse = await fetch(`${backendBaseUrl}/api/push/dispatch`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            coupleCode,
            recipientTokens: nativeTokens,
            data: {
              type: payload.type,
              coupleCode,
              from: payload.from || 'System',
            },
            notification: payload.silent ? null : {
              title: payload.title || 'Forus',
              body: payload.body || 'You have a new update',
            },
            android: {
              priority: 'high',
              ttlSeconds: typeof payload.ttlSeconds === 'number' ? payload.ttlSeconds : undefined,
            },
          }),
        });

        const backendBody = await backendResponse.json().catch(() => ({}));
        console.log(`${PUSH_SEND_LOG_PREFIX} backend-fcm-response`, {
          coupleCode,
          type: payload.type,
          ok: backendResponse.ok,
          status: backendResponse.status,
          successCount: backendBody?.successCount,
          failureCount: backendBody?.failureCount,
          hasIdToken: Boolean(idToken),
        });
      } catch (backendError) {
        console.error(`${PUSH_SEND_LOG_PREFIX} backend-fcm-dispatch-failed`, backendError);
      }
    } else {
      console.log(`${PUSH_SEND_LOG_PREFIX} backend-fcm-skipped`, {
        reason: 'missing-backend-url',
        coupleCode,
        type: payload.type,
        nativeTokenCount: nativeTokens.length,
      });
    }

    if (recipientTokens.length === 0) {
      return;
    }

    const messages = recipientTokens.map((to) => {
      const baseMessage: any = {
        to,
        priority: 'high',
        data: {
          type: payload.type,
          coupleCode,
          from: payload.from || 'System',
        },
      };

      if (typeof payload.ttlSeconds === 'number' && Number.isFinite(payload.ttlSeconds)) {
        baseMessage.ttl = Math.max(0, Math.floor(payload.ttlSeconds));
      }

      if (payload.silent) {
        baseMessage.contentAvailable = true;
      } else {
        baseMessage.title = payload.title;
        baseMessage.body = payload.body;
        baseMessage.sound = 'default';
        baseMessage.channelId = 'default';
      }

      return baseMessage;
    });

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const body = await response.json().catch(() => null);

    console.log(`${PUSH_SEND_LOG_PREFIX} expo-response`, {
      coupleCode,
      type: payload.type,
      status: response.status,
      ok: response.ok,
      dataLength: Array.isArray(body?.data) ? body.data.length : 0,
    });

    if (!response.ok) {
      console.warn('Expo push API returned non-OK response:', response.status, body);
      return;
    }

    const ticketData = Array.isArray(body?.data) ? body.data : [];
    ticketData.forEach((ticket: any, index: number) => {
      console.log(`${PUSH_SEND_LOG_PREFIX} expo-ticket`, {
        token: recipientTokens[index],
        status: ticket?.status,
        id: ticket?.id,
        message: ticket?.message,
      });
    });

    ticketData.forEach((ticket: any, index: number) => {
      if (ticket?.status === 'error') {
        console.warn('Expo push ticket error:', {
          token: recipientTokens[index],
          details: ticket?.details,
          message: ticket?.message,
        });
      }
    });
  } catch (error) {
    console.error('Error dispatching Expo push notifications:', error);
  }
}

export function subscribeToNotifications(
  coupleCode: string,
  onNotification: (notification: NotificationEvent) => void,
  currentNickname?: string
) {
  const notifRef = collection(db, 'notifications', coupleCode, 'events');
  const q = query(notifRef, where('read', '==', false));
  let isInitialSnapshot = true;

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const shouldRunFallbackForThisSnapshot = !isInitialSnapshot;

    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const notification = {
          id: change.doc.id,
          ...change.doc.data(),
        } as NotificationEvent & { id: string };

        // Skip notifications that this user sent themselves
        if (currentNickname && notification.from === currentNickname) return;

        onNotification(notification);

        // Avoid replaying old unread docs on first snapshot; only use fallback for truly new arrivals.
        if (shouldRunFallbackForThisSnapshot) {
          void maybeScheduleLocalOsFallback(notification);
        }
      }
    });

    if (isInitialSnapshot) {
      isInitialSnapshot = false;
    }
  });

  return unsubscribe;
}

export async function markNotificationsAsRead(coupleCode: string, currentNickname?: string) {
  try {
    const notifRef = collection(db, 'notifications', coupleCode, 'events');
    const unreadQuery = query(notifRef, where('read', '==', false));
    const snapshot = await getDocs(unreadQuery);

    const updates = snapshot.docs
      .map((entry) => ({ id: entry.id, ...(entry.data() as any) }))
      .filter((entry) => !currentNickname || entry.from !== currentNickname)
      .map((entry) =>
        updateDoc(doc(db, 'notifications', coupleCode, 'events', entry.id), {
          read: true,
          readAt: serverTimestamp(),
        })
      );

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  } catch (error) {
    console.error('Error marking notifications as read:', error);
  }
}

export async function markNotificationsAsReadByTypes(
  coupleCode: string,
  types: NotificationEvent['type'][],
  currentNickname?: string
) {
  try {
    if (!Array.isArray(types) || types.length === 0) return;

    const allowedTypes = new Set(types.map((type) => String(type)));
    const notifRef = collection(db, 'notifications', coupleCode, 'events');
    const unreadQuery = query(notifRef, where('read', '==', false));
    const snapshot = await getDocs(unreadQuery);

    const updates = snapshot.docs
      .map((entry) => ({ id: entry.id, ...(entry.data() as any) }))
      .filter((entry) => !currentNickname || entry.from !== currentNickname)
      .filter((entry) => allowedTypes.has(String(entry.type || '')))
      .map((entry) =>
        updateDoc(doc(db, 'notifications', coupleCode, 'events', entry.id), {
          read: true,
          readAt: serverTimestamp(),
        })
      );

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  } catch (error) {
    console.error('Error marking notifications as read by type:', error);
  }
}

// Notification triggers
export async function notifyNewMessage(
  coupleCode: string,
  senderName: string,
  messagePreview: string
) {
  await sendNotification(
    coupleCode,
    'message',
    '💬 New message',
    `${senderName}: ${messagePreview.substring(0, 50)}${messagePreview.length > 50 ? '...' : ''}`,
    senderName
  );
}

export async function notifyDailyParagraph(
  coupleCode: string,
  senderName: string
) {
  const today = new Date().toISOString().split('T')[0];
  const paragraphsRef = collection(db, 'dailyParagraphs');
  const completionQuery = query(
    paragraphsRef,
    where('coupleCode', '==', coupleCode),
    where('date', '==', today)
  );
  const completionSnapshot = await getDocs(completionQuery);
  const completedNicknames = new Set(
    completionSnapshot.docs
      .map((entry) => (entry.data() as any)?.nickname)
      .filter((nickname) => typeof nickname === 'string' && nickname.trim().length > 0)
  );

  if (completedNicknames.size >= 2) {
    return;
  }

  await sendNotification(
    coupleCode,
    'paragraph',
    '📝 Partner wrote today',
    `${senderName} wrote their daily paragraph. Write yours to unlock their writing 💕`,
    senderName
  );
}

export async function sendWidgetUpdatePush(coupleCode: string, from?: string) {
  try {
    await dispatchExpoPushNotifications(coupleCode, {
      type: 'widget-update',
      from,
      silent: true,
      ttlSeconds: 120,
    });
  } catch (error) {
    console.error('Error sending widget-update push:', error);
  }
}

export async function notifyDeepQuestionPrompt(
  coupleCode: string,
  senderName: string
) {
  const today = new Date().toISOString().split('T')[0];
  const deepTalkRef = doc(db, 'deepTalks', coupleCode, 'items', today);
  const deepTalkSnap = await getDoc(deepTalkRef);

  if (deepTalkSnap.exists()) {
    const deepTalkData = deepTalkSnap.data() as any;
    const responses = deepTalkData?.responses || {};
    const answeredCount = Object.values(responses).filter((entry: any) => {
      const answer = entry?.answer;
      return typeof answer === 'string' && answer.trim().length > 0;
    }).length;

    if (deepTalkData?.unlocked === true || answeredCount >= 2) {
      return;
    }
  }

  await sendNotification(
    coupleCode,
    'deep-question',
    '💭 Deep question answered',
    `${senderName} answered today's deep question. Write yours to unlock both responses 💕`,
    senderName
  );
}

export async function notifyMemory(
  coupleCode: string,
  senderName: string,
  memoryType: string
) {
  const typeEmoji = {
    letter: '💌',
    photo: '📸',
    audio: '🎵',
    memory: '✨',
  };

  await sendNotification(
    coupleCode,
    'memory',
    `${typeEmoji[memoryType as keyof typeof typeEmoji]} New Memory`,
    `${senderName} added a new ${memoryType} to your vault 💕`,
    senderName
  );
}

export async function notifySharedDiaryEntry(
  coupleCode: string,
  senderName: string,
  entryType: 'text' | 'image' | 'voice'
) {
  const entryLabel = entryType === 'voice' ? 'voice note' : entryType;

  await sendNotification(
    coupleCode,
    'shared-diary',
    '📔 Shared diary updated',
    `${senderName} added a ${entryLabel} entry to your shared diary 💕`,
    senderName
  );
}

export async function notifyStreakMilestone(
  coupleCode: string,
  streakCount: number,
  streakType: 'app' | 'paragraph'
) {
  const messages = {
    app: {
      7: '🔥 One week streak!',
      30: '🔥 One month streak!',
      100: '🔥 100 day streak!',
      365: '🔥 One year streak!',
    },
    paragraph: {
      7: '✍️ One week of daily writing!',
      30: '✍️ One month of daily writing!',
      100: '✍️ 100 days of sharing thoughts!',
      365: '✍️ One year of daily paragraphs!',
    },
  };

  const key = Object.keys(messages[streakType])
    .reverse()
    .find(k => streakCount >= parseInt(k));

  if (key) {
    const title = messages[streakType][(key as any) as keyof typeof messages.app];
    await sendNotification(
      coupleCode,
      'streak',
      title,
      `Keep the momentum going! You're doing amazing together 💪`,
      'System'
    );
  }
}

export async function notifyPartnerAction(
  coupleCode: string,
  recipientName: string,
  action: string,
  partnerName: string
) {
  const messages: { [key: string]: { emoji: string; text: string } } = {
    completed_goal: { emoji: '✅', text: 'marked a goal as complete' },
    shared_diary: { emoji: '📔', text: 'shared a diary entry' },
    added_mood: { emoji: '😊', text: 'shared their mood' },
    responded_echo: { emoji: '🤖', text: 'chatted with Echo' },
  };

  const msg = messages[action];
  if (msg) {
    await sendNotification(
      coupleCode,
      'message',
      `${msg.emoji} ${partnerName} just...`,
      `${partnerName} ${msg.text}!`,
      partnerName
    );
  }
}

/**
 * Notify partner when a user updates their mood
 */
export async function notifyMoodChanged(
  coupleCode: string,
  partnerName: string,
  mood: string,
  moodEmoji: string
) {
  await sendNotification(
    coupleCode,
    'mood',
    `${moodEmoji} ${partnerName}'s mood`,
    `${partnerName} is feeling ${mood} right now 💕`,
    partnerName
  );
}

/**
 * Notify both partners about an upcoming milestone
 * daysUntil: 0 = today, 1 = tomorrow, 3 = 3 days away, 7 = 1 week away
 */
export async function notifyMilestoneReminder(
  coupleCode: string,
  milestoneTitle: string,
  milestoneType: 'anniversary' | 'birthday' | 'special' | 'goal',
  daysUntil: number
) {
  const typeEmoji: Record<string, string> = {
    anniversary: '💕',
    birthday: '🎂',
    goal: '🎯',
    special: '✨',
  };

  const emoji = typeEmoji[milestoneType] || '✨';

  let title: string;
  let body: string;

  if (daysUntil === 0) {
    title = `${emoji} Today is ${milestoneTitle}!`;
    body = `Today is your special day — make it memorable! 🎉`;
  } else if (daysUntil === 1) {
    title = `${emoji} ${milestoneTitle} is tomorrow!`;
    body = `Don't forget — ${milestoneTitle} is just 1 day away 💫`;
  } else {
    title = `${emoji} ${milestoneTitle} coming up!`;
    body = `${milestoneTitle} is ${daysUntil} days away — start planning something special 💝`;
  }

  await sendNotification(coupleCode, 'milestone', title, body, 'System');
}
