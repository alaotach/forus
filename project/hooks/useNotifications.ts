import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

export interface NotificationSettings {
  enabled: boolean;
  messages: boolean;
  dailyReminders: boolean;
  partnerActivity: boolean;
}

export function useNotifications() {
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: false,
    messages: true,
    dailyReminders: true,
    partnerActivity: true,
  });

  useEffect(() => {
    checkNotificationPermission();
  }, []);

  const checkNotificationPermission = async () => {
    if (Platform.OS === 'web' && 'Notification' in window) {
      const permission = Notification.permission;
      setSettings(prev => ({
        ...prev,
        enabled: permission === 'granted',
      }));
    }
  };

  const requestPermission = async (): Promise<boolean> => {
    if (Platform.OS === 'web' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        const granted = permission === 'granted';
        setSettings(prev => ({
          ...prev,
          enabled: granted,
        }));
        return granted;
      }
      return Notification.permission === 'granted';
    }
    
    // For mobile, you would integrate with expo-notifications here
    return false;
  };

  const showNotification = (title: string, body: string, icon?: string) => {
    if (!settings.enabled) return;

    if (Platform.OS === 'web' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: icon || '/icon.png',
        badge: '/icon.png',
        tag: 'couples-app',
      });
    }
  };

  const showMessageNotification = (senderName: string, message: string) => {
    if (settings.messages) {
      showNotification(
        `💕 ${senderName}`,
        message,
        '/icon.png'
      );
    }
  };

  const showDailyReminder = () => {
    if (settings.dailyReminders) {
      showNotification(
        '💕 Daily Love Reminder',
        'Don\'t forget to write your daily paragraph and connect with your partner!',
        '/icon.png'
      );
    }
  };

  const showPartnerActivityNotification = (activity: string) => {
    if (settings.partnerActivity) {
      showNotification(
        '💕 Partner Activity',
        activity,
        '/icon.png'
      );
    }
  };

  const updateSettings = (newSettings: Partial<NotificationSettings>) => {
    setSettings(prev => ({
      ...prev,
      ...newSettings,
    }));
  };

  return {
    settings,
    requestPermission,
    showNotification,
    showMessageNotification,
    showDailyReminder,
    showPartnerActivityNotification,
    updateSettings,
  };
}