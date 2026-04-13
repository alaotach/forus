import { useEffect } from 'react';
import { useCouple } from './useCouple';
import { initializePushNotifications } from '@/services/push-notifications';

/**
 * Hook to initialize push notifications when couple data is available
 */
export function usePushNotifications() {
  const { coupleData, isConnected } = useCouple();

  useEffect(() => {
    if (isConnected && coupleData) {
      initializePushNotifications(coupleData.coupleCode, coupleData.nickname).catch(error => {
        console.error('Error in usePushNotifications:', error);
      });
    }
  }, [isConnected, coupleData]);
}
