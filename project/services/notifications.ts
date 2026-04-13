import { db } from './firebase';
import { doc, setDoc, getDoc, collection, query, where, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useNotificationContext } from '@/components/NotificationProvider';

export interface NotificationEvent {
  type: 'message' | 'paragraph' | 'memory' | 'streak' | 'milestone' | 'echo' | 'goal';
  coupleCode: string;
  title: string;
  body: string;
  from?: string;
  timestamp: any;
  read: boolean;
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

    console.log(`Notification sent: ${title}`);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

export function subscribeToNotifications(
  coupleCode: string,
  onNotification: (notification: NotificationEvent) => void
) {
  const notifRef = collection(db, 'notifications', coupleCode, 'events');
  const q = query(notifRef, where('read', '==', false));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const notification = {
          id: change.doc.id,
          ...change.doc.data(),
        } as NotificationEvent & { id: string };
        
        onNotification(notification);
      }
    });
  });

  return unsubscribe;
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
  coupleNickname: string
) {
  await sendNotification(
    coupleCode,
    'paragraph',
    '📝 Daily Writing Prompt',
    `Your daily prompt is ready! Write your thoughts and share with ${coupleNickname} 💕`,
    'System'
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
