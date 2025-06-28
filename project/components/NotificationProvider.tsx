import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationBanner from './NotificationBanner';

interface NotificationContextType {
  showNotification: (title: string, message: string, type?: 'message' | 'activity' | 'reminder') => void;
  requestPermission: () => Promise<boolean>;
  settings: any;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within NotificationProvider');
  }
  return context;
}

interface NotificationProviderProps {
  children: React.ReactNode;
}

export default function NotificationProvider({ children }: NotificationProviderProps) {
  const notifications = useNotifications();
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerData, setBannerData] = useState({
    title: '',
    message: '',
    type: 'message' as 'message' | 'activity' | 'reminder',
  });

  const showNotification = (title: string, message: string, type: 'message' | 'activity' | 'reminder' = 'message') => {
    setBannerData({ title, message, type });
    setBannerVisible(true);
    
    // Also show browser notification if enabled
    notifications.showNotification(title, message);
  };

  const value = {
    showNotification,
    requestPermission: notifications.requestPermission,
    settings: notifications.settings,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationBanner
        visible={bannerVisible}
        title={bannerData.title}
        message={bannerData.message}
        type={bannerData.type}
        onClose={() => setBannerVisible(false)}
      />
    </NotificationContext.Provider>
  );
}