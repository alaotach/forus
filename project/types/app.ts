import { Timestamp } from 'firebase/firestore';

export interface User {
  nickname: string;
  coupleCode: string;
  lastSeen: Timestamp;
  joinedAt: Timestamp;
}

export interface ChatMessage {
  id: string;
  sender: string;
  message: string;
  timestamp: Timestamp;
  reactions?: { [key: string]: string[] };
  type?: 'text' | 'image' | 'audio';
  mediaUrl?: string;
}

export interface DailyParagraph {
  id: string;
  date: string;
  prompt: string;
  content: string;
  nickname: string;
  timestamp: Timestamp;
  wordCount: number;
  mood?: string;
}

export interface Streak {
  appStreak: number;
  paragraphStreak: number;
  lastAppOpen: string;
  lastParagraphDate: string;
  longestAppStreak: number;
  longestParagraphStreak: number;
}

export interface VaultItem {
  id: string;
  type: 'letter' | 'photo' | 'audio';
  title: string;
  content?: string;
  url?: string;
  author: string;
  timestamp: Timestamp;
  tags?: string[];
  mood?: string;
  favorite?: boolean;
  duration?: number;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: Timestamp;
  createdAt: Timestamp;
  createdBy: string;
  priority?: 'low' | 'medium' | 'high';
  category?: string;
}

export interface Mood {
  id: string;
  emoji: string;
  message: string;
  nickname: string;
  date: string;
  timestamp: Timestamp;
  intensity: number; // 1-5 scale
}

export interface Milestone {
  id: string;
  title: string;
  date: Timestamp;
  type: 'anniversary' | 'call' | 'birthday' | 'custom';
  description?: string;
  recurring?: boolean;
  notificationEnabled?: boolean;
}

export interface Conflict {
  id: string;
  nickname: string;
  feeling: string;
  wishPartnerKnew: string;
  timestamp: Timestamp;
  resolved?: boolean;
  partnerResponse?: string;
}

export interface DeepTalk {
  id: string;
  date: string;
  question: string;
  responses: {
    [nickname: string]: {
      answer: string;
      timestamp: Timestamp;
    };
  };
  unlocked: boolean;
}

export interface EchoMemory {
  id: string;
  content: string;
  source: 'chat' | 'paragraph' | 'letter' | 'conflict';
  timestamp: Timestamp;
  participants: string[];
  mood?: string;
  keywords: string[];
}