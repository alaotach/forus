import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CoupleData {
  nickname: string;
  coupleCode: string;
}

export function useCouple() {
  const [coupleData, setCoupleData] = useState<CoupleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCoupleData();
  }, []);

  const loadCoupleData = async () => {
    try {
      const stored = await AsyncStorage.getItem('coupleData');
      console.log('Loading couple data from storage:', stored);
      if (stored) {
        const data = JSON.parse(stored);
        setCoupleData(data);
        console.log('Couple data loaded:', data);
      } else {
        console.log('No couple data found in storage');
      }
    } catch (error) {
      console.error('Error loading couple data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveCoupleData = async (data: CoupleData) => {
    try {
      const dataString = JSON.stringify(data);
      await AsyncStorage.setItem('coupleData', dataString);
      setCoupleData(data);
      console.log('Couple data saved successfully:', data);
    } catch (error) {
      console.error('Error saving couple data:', error);
      throw error;
    }
  };

  const clearCoupleData = async () => {
    try {
      await AsyncStorage.removeItem('coupleData');
      setCoupleData(null);
      console.log('Couple data cleared');
    } catch (error) {
      console.error('Error clearing couple data:', error);
    }
  };

  return {
    coupleData,
    isLoading,
    saveCoupleData,
    clearCoupleData,
    isConnected: !!coupleData && !!coupleData.nickname && !!coupleData.coupleCode
  };
}