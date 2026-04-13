import { useEffect, useState } from 'react';
import { getCurrentUser, getUserProfile, isCoupleConnected } from '@/services/auth';
import { User } from 'firebase/auth';
import { UserAuthData } from '@/services/auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserAuthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserData = async () => {
      const currentUser = getCurrentUser();
      setUser(currentUser);

      if (currentUser) {
        try {
          const userProfile = await getUserProfile(currentUser.uid);
          setProfile(userProfile);
        } catch (error) {
          console.error('Error loading profile:', error);
        }
      }

      setLoading(false);
    };

    loadUserData();
  }, []);

  return { user, profile, loading };
}
