import { Tabs, usePathname } from 'expo-router';
import { Heart, MessageCircle, Archive, Target, Sparkles, PenTool, Bell } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { View, Text } from 'react-native';
import { useState, useEffect } from 'react';
import { useCouple } from '@/hooks/useCouple';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { markNotificationsAsReadByTypes } from '@/services/notifications';
import { setActiveNotificationRoute } from '@/services/push-notifications';

export default function TabLayout() {
  const { coupleData } = useCouple();
  const pathname = usePathname();
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [vaultUnreadCount, setVaultUnreadCount] = useState(0);
  const [writeUnreadCount, setWriteUnreadCount] = useState(0);
  const [moreUnreadCount, setMoreUnreadCount] = useState(0);

  // Ensure push registration is initialized regardless of which tab opens first.
  usePushNotifications();

  useEffect(() => {
    if (!coupleData) return;

    const notifRef = collection(db, 'notifications', coupleData.coupleCode, 'events');
    const unreadQuery = query(notifRef, where('read', '==', false));

    const unsubscribe = onSnapshot(unreadQuery, (snapshot) => {
      const unreadForMe = snapshot.docs
        .map((entry) => entry.data() as any)
        .filter((data) => data?.from !== coupleData.nickname);

      const chat = unreadForMe.filter((data) => String(data?.type || '') === 'message').length;
      const vault = unreadForMe.filter((data) => {
        const type = String(data?.type || '');
        return type === 'memory' || type === 'shared-diary';
      }).length;
      const write = unreadForMe.filter((data) => {
        const type = String(data?.type || '');
        return type === 'paragraph' || type === 'deep-question';
      }).length;
      const more = unreadForMe.length - chat - vault - write;

      setChatUnreadCount(chat);
      setVaultUnreadCount(vault);
      setWriteUnreadCount(write);
      setMoreUnreadCount(Math.max(0, more));
    }, (error) => {
      console.error('Error setting up notification badge listener:', error);
    });

    return unsubscribe;
  }, [coupleData]);

  useEffect(() => {
    if (!coupleData) return;

    let typesToMark: Array<'message' | 'paragraph' | 'memory' | 'streak' | 'milestone' | 'echo' | 'goal' | 'mood' | 'deep-question' | 'shared-diary'> = [];

    if (pathname?.includes('/chat')) {
      typesToMark = ['message'];
    } else if (pathname?.includes('/vault')) {
      typesToMark = ['memory', 'shared-diary'];
    } else if (pathname?.includes('/shared-diary')) {
      typesToMark = ['shared-diary'];
    } else if (pathname?.includes('/write') || pathname?.includes('/paragraph') || pathname?.includes('/deep-talk')) {
      typesToMark = ['paragraph', 'deep-question'];
    } else if (pathname?.includes('/more')) {
      typesToMark = ['streak', 'milestone', 'echo', 'goal', 'mood', 'shared-diary'];
    }

    if (typesToMark.length > 0) {
      markNotificationsAsReadByTypes(coupleData.coupleCode, typesToMark, coupleData.nickname).catch(() => undefined);
    }
  }, [pathname, coupleData]);

  useEffect(() => {
    setActiveNotificationRoute(pathname || '');
  }, [pathname]);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: 85,
          paddingBottom: 20,
          paddingTop: 10,
        },
        tabBarBackground: () => (
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.95)', 'rgba(255, 255, 255, 0.9)']}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: 85,
            }}
          />
        ),
        tabBarActiveTintColor: '#ff6b9d',
        tabBarInactiveTintColor: '#a0a0a0',
        tabBarLabelStyle: {
          fontFamily: 'Inter-Medium',
          fontSize: 11,
          marginTop: 4,
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ size, color }) => (
            <Heart size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ size, color }) => (
            <MessageCircle size={size} color={color} />
          ),
          tabBarBadge: chatUnreadCount > 0 ? (chatUnreadCount > 9 ? '9+' : chatUnreadCount) : undefined,
        }}
      />
      <Tabs.Screen
        name="write"
        options={{
          title: 'Write',
          tabBarIcon: ({ size, color }) => (
            <PenTool size={size} color={color} />
          ),
          tabBarBadge: writeUnreadCount > 0 ? (writeUnreadCount > 9 ? '9+' : writeUnreadCount) : undefined,
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: 'Vault',
          tabBarIcon: ({ size, color }) => (
            <Archive size={size} color={color} />
          ),
          tabBarBadge: vaultUnreadCount > 0 ? (vaultUnreadCount > 9 ? '9+' : vaultUnreadCount) : undefined,
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          title: 'Goals',
          tabBarIcon: ({ size, color }) => (
            <Target size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ size, color }) => <Sparkles size={size} color={color} />,
          tabBarBadge: moreUnreadCount > 0 ? (moreUnreadCount > 9 ? '9+' : moreUnreadCount) : undefined,
        }}
      />
    </Tabs>
  );
}