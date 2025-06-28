import { Tabs } from 'expo-router';
import { Heart, MessageCircle, Archive, Target, Sparkles, PenTool } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
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
            <Sparkles size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}