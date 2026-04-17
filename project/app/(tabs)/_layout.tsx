import { Tabs } from 'expo-router';
import { Heart, MessageCircle, Archive, Target, Sparkles, PenTool, Bell } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { View, Text } from 'react-native';
import { useState, useEffect } from 'react';
import { useCouple } from '@/hooks/useCouple';

export default function TabLayout() {
  const { coupleData } = useCouple();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!coupleData) return;

    try {
      const { subscribeToNotifications } = require('@/services/notifications');
      
      const unsubscribe = subscribeToNotifications(coupleData.coupleCode, (payload: any) => {
        const notificationsList = Array.isArray(payload)
          ? payload
          : payload
            ? [payload]
            : [];

        const unreadNotifications = notificationsList.filter((n: any) => n && !n.read);

        // subscribeToNotifications emits one notification at a time.
        // When we receive a single unread notification, increment the badge.
        if (!Array.isArray(payload)) {
          if (unreadNotifications.length > 0) {
            setUnreadCount(prev => prev + unreadNotifications.length);
          }
          return;
        }

        // If an array is ever provided, use it as the source of truth.
        setUnreadCount(unreadNotifications.length);
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up notification badge listener:', error);
    }
  }, [coupleData]);
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
          tabBarBadge: undefined, // You can add badge count here for unread messages
        }}
      />
      <Tabs.Screen
        name="write"
        options={{
          title: 'Write',
          tabBarIcon: ({ size, color }) => (
            <PenTool size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: 'Vault',
          tabBarIcon: ({ size, color }) => (
            <Archive size={size} color={color} />
          ),
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
          tabBarIcon: ({ size, color }) => (
            <View>
              <Sparkles size={size} color={color} />
              {unreadCount > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -6,
                    backgroundColor: '#ff6b9d',
                    borderRadius: 10,
                    minWidth: 20,
                    height: 20,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          ),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
    </Tabs>
  );
}