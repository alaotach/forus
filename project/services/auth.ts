/**
 * Authentication Service
 * Handles Firebase Auth for user registration and login
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  updateCurrentUser,
  onAuthStateChanged,
  User,
  AuthError,
  reload,
} from 'firebase/auth';
import { auth, db } from '@/services/firebase';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

export interface UserAuthData {
  uid: string;
  email: string;
  nickname: string;
  coupleCode: string;
  partnerUid?: string;
  createdAt: any;
  updatedAt: any;
}

export interface AuthActionResult {
  success: boolean;
  error?: string;
  requiresEmailVerification?: boolean;
}

async function ensureUserProfileDocument(user: User): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      nickname: '',
      coupleCode: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Register new user with email and password
 */
export async function registerUser(email: string, password: string): Promise<AuthActionResult> {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Require verification before allowing account setup flow.
    await sendEmailVerification(user);

    return { success: true, requiresEmailVerification: true };
  } catch (error: any) {
    console.error('Registration error:', error);
    return { success: false, error: getAuthErrorMessage(error) };
  }
}

/**
 * Login user with email and password
 */
export async function loginUser(email: string, password: string): Promise<AuthActionResult> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await reload(user);

    if (!user.emailVerified) {
      return {
        success: false,
        requiresEmailVerification: true,
        error: 'Please verify your email before continuing.',
      };
    }

    await ensureUserProfileDocument(user);
    return { success: true };
  } catch (error: any) {
    console.error('Login error:', error);
    return { success: false, error: getAuthErrorMessage(error) };
  }
}

export async function resendVerificationEmailToCurrentUser(): Promise<AuthActionResult> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'No logged-in user found.' };
    }

    await sendEmailVerification(currentUser);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: getAuthErrorMessage(error) };
  }
}

export async function refreshCurrentUser(): Promise<User | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  await reload(currentUser);
  return currentUser;
}

/**
 * Logout current user
 */
export async function logoutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
    // Fallback for edge cases where native signOut bridge fails but local session can be cleared.
    try {
      await updateCurrentUser(auth, null);
    } catch (fallbackError) {
      console.error('Logout fallback error:', fallbackError);
      throw error;
    }
  }
}

/**
 * Get current authenticated user
 */
export function getCurrentUser(): User | null {
  return auth.currentUser;
}

/**
 * Setup listener for auth state changes
 */
export function onAuthStateChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Set user nickname and generate couple code
 */
export async function setNicknameAndGenerateCode(uid: string, nickname: string): Promise<{ success: boolean; coupleCode?: string; error?: string }> {
  try {
    const coupleCode = generateRandomCoupleCode();

    // Update user document with nickname and couple code
    await updateDoc(doc(db, 'users', uid), {
      nickname,
      coupleCode,
      updatedAt: serverTimestamp(),
    });

    // Create couple registry entry so partner can find this user
    await setDoc(doc(db, 'coupleRegistry', coupleCode), {
      createdByUid: uid,
      createdAt: serverTimestamp(),
      isConnected: false,
    });

    return { success: true, coupleCode };
  } catch (error: any) {
    console.error('Error setting nickname:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate random 8-character alphanumeric couple code
 */
function generateRandomCoupleCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  // React Native may not have global.crypto, fallback to Math.random if needed
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    for (let i = 0; i < 8; i++) {
      code += chars[array[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  return code;
}

/**
 * Join couple using code (for partner)
 */
export async function joinCoupleWithCode(uid: string, coupleCode: string, nickname: string): Promise<{ success: boolean; partnerNickname?: string; error?: string }> {
  try {
    // Find user with this couple code
    const usersRef = doc(db, 'users', uid);
    const userDoc = await getDoc(usersRef);

    if (!userDoc.exists()) {
      return { success: false, error: 'User profile not found' };
    }

    // Check if code is valid - query for user with this couple code
    const allUsersSnapshot = await getDoc(doc(db, 'users', uid));
    
    // Since Firestore doesn't support easy queries without collections ref,
    // we'll search through a couple registry instead
    const coupleRegistryRef = doc(db, 'coupleRegistry', coupleCode);
    const coupleRegistryDoc = await getDoc(coupleRegistryRef);

    if (!coupleRegistryDoc.exists()) {
      return { success: false, error: 'Invalid couple code' };
    }

    const registryData = coupleRegistryDoc.data();
    const partnerUid = registryData.createdByUid;
    
    if (!partnerUid) {
      return { success: false, error: 'Invalid couple code' };
    }

    // Get partner info
    const partnerRef = doc(db, 'users', partnerUid);
    const partnerDoc = await getDoc(partnerRef);

    if (!partnerDoc.exists()) {
      return { success: false, error: 'Partner account not found' };
    }

    const partnerData = partnerDoc.data() as UserAuthData;

    // Update current user with couple code and partner info
    await updateDoc(usersRef, {
      coupleCode,
      nickname,
      partnerUid,
      updatedAt: serverTimestamp(),
    });

    // Update partner user with this user's info
    await updateDoc(partnerRef, {
      partnerUid: uid,
      updatedAt: serverTimestamp(),
    });

    // Update couple registry to mark as complete
    await updateDoc(coupleRegistryRef, {
      partnerUid: uid,
      isConnected: true,
      connectedAt: serverTimestamp(),
    });

    return { success: true, partnerNickname: partnerData.nickname };
  } catch (error: any) {
    console.error('Error joining couple:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user profile
 */
export async function getUserProfile(uid: string): Promise<UserAuthData | null> {
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      return userDoc.data() as UserAuthData;
    }
    return null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Check if couple is fully connected (both users have joined)
 */
export async function isCoupleConnected(uid: string): Promise<boolean> {
  try {
    const userProfile = await getUserProfile(uid);
    if (!userProfile) return false;

    // Both uid and partnerUid must be set
    return !!(userProfile.coupleCode && userProfile.partnerUid && userProfile.nickname);
  } catch (error) {
    console.error('Error checking couple connection:', error);
    return false;
  }
}

/**
 * Get partner nickname
 */
export async function getPartnerNickname(uid: string): Promise<string | null> {
  try {
    const userProfile = await getUserProfile(uid);
    if (!userProfile || !userProfile.partnerUid) return null;

    const partnerProfile = await getUserProfile(userProfile.partnerUid);
    return partnerProfile?.nickname || null;
  } catch (error) {
    console.error('Error getting partner nickname:', error);
    return null;
  }
}

/**
 * Get human-readable auth error messages
 */
function getAuthErrorMessage(error: AuthError): string {
  const errorMessages: { [key: string]: string } = {
    'auth/invalid-email': 'Invalid email address',
    'auth/user-disabled': 'User account is disabled',
    'auth/user-not-found': 'User not found',
    'auth/wrong-password': 'Wrong password',
    'auth/email-already-in-use': 'Email already in use',
    'auth/weak-password': 'Password is too weak (min 6 characters)',
    'auth/operation-not-allowed': 'Operation not allowed',
    'auth/too-many-requests': 'Too many login attempts. Try again later.',
  };

  return errorMessages[error.code] || error.message;
}
