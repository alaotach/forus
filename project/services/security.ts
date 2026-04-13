/**
 * Security Service
 * Handles PIN/password protection for couple accounts
 */

import { db } from '@/services/firebase';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import * as SecureStore from 'expo-secure-store';

export interface CoupleSecurityData {
  coupleCode: string;
  pinHash: string; // Never store plain PIN
  createdAt: any;
  updatedAt: any;
  deviceFingerprints: string[];
  accessLog: Array<{
    timestamp: any;
    deviceId: string;
    action: 'login' | 'failed_attempt';
    ip?: string;
  }>;
}

/**
 * Hash PIN for secure storage (simple implementation)
 * In production, use bcrypt or similar
 */
function hashPIN(pin: string): string {
  // Simple hash for demo - use bcrypt in production
  const combined = pin + process.env.EXPO_PUBLIC_PEPPER || 'default-pepper';
  return Buffer.from(combined).toString('base64');
}

/**
 * Verify PIN against stored hash
 */
function verifyPIN(enteredPIN: string, storedHash: string): boolean {
  return hashPIN(enteredPIN) === storedHash;
}

/**
 * Create couple security record with PIN
 * Call this after pairing when setting up security
 */
export async function setupCoupleSecurity(
  coupleCode: string,
  pin: string,
  deviceId: string
): Promise<boolean> {
  try {
    const securityRef = doc(db, 'coupleSecurity', coupleCode);
    
    const securityData: CoupleSecurityData = {
      coupleCode,
      pinHash: hashPIN(pin),
      createdAt: new Date(),
      updatedAt: new Date(),
      deviceFingerprints: [deviceId],
      accessLog: [{
        timestamp: new Date(),
        deviceId,
        action: 'login',
      }],
    };

    await setDoc(securityRef, securityData);
    
    // Store PIN locally on device (encrypted)
    await SecureStore.setItemAsync(`pin_${coupleCode}`, pin);
    
    return true;
  } catch (error) {
    console.error('Error setting up couple security:', error);
    return false;
  }
}

/**
 * Verify couple code + PIN on login
 */
export async function verifyCoupleSecurity(
  coupleCode: string,
  pin: string,
  deviceId: string
): Promise<{ valid: boolean; message: string }> {
  try {
    const securityRef = doc(db, 'coupleSecurity', coupleCode);
    const securityDoc = await getDoc(securityRef);

    if (!securityDoc.exists()) {
      // No security record - this couple hasn't set up security yet
      // This shouldn't happen in normal flow
      return { valid: false, message: 'Couple not found' };
    }

    const securityData = securityDoc.data() as CoupleSecurityData;

    // Verify PIN
    if (!verifyPIN(pin, securityData.pinHash)) {
      // Log failed attempt
      await updateDoc(securityRef, {
        accessLog: [...securityData.accessLog, {
          timestamp: new Date(),
          deviceId,
          action: 'failed_attempt',
        }],
      });

      return { valid: false, message: 'Invalid PIN' };
    }

    // Check if device is registered
    const isRegisteredDevice = securityData.deviceFingerprints.includes(deviceId);
    
    if (!isRegisteredDevice) {
      // Device attempting to login from new device
      // Add it to registered devices and alert
      const updatedFingerprints = [...securityData.deviceFingerprints, deviceId];
      
      await updateDoc(securityRef, {
        deviceFingerprints: updatedFingerprints,
        accessLog: [...securityData.accessLog, {
          timestamp: new Date(),
          deviceId,
          action: 'login',
        }],
        updatedAt: new Date(),
      });

      return {
        valid: true,
        message: 'Login from new device - both partners should verify',
      };
    }

    // Log successful login from registered device
    await updateDoc(securityRef, {
      accessLog: [...securityData.accessLog, {
        timestamp: new Date(),
        deviceId,
        action: 'login',
      }],
      updatedAt: new Date(),
    });

    return { valid: true, message: 'Welcome back!' };
  } catch (error) {
    console.error('Error verifying couple security:', error);
    return { valid: false, message: 'Verification error' };
  }
}

/**
 * Get access log to detect suspicious activity
 */
export async function getAccessLog(coupleCode: string): Promise<CoupleSecurityData['accessLog']> {
  try {
    const securityRef = doc(db, 'coupleSecurity', coupleCode);
    const securityDoc = await getDoc(securityRef);

    if (!securityDoc.exists()) return [];

    const securityData = securityDoc.data() as CoupleSecurityData;
    
    // Return last 30 days of logs
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return securityData.accessLog.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate > thirtyDaysAgo;
    });
  } catch (error) {
    console.error('Error getting access log:', error);
    return [];
  }
}

/**
 * Get locally stored PIN from device
 */
export async function getLocalPIN(coupleCode: string): Promise<string | null> {
  try {
    const pin = await SecureStore.getItemAsync(`pin_${coupleCode}`);
    return pin || null;
  } catch (error) {
    console.error('Error getting local PIN:', error);
    return null;
  }
}

/**
 * Check for suspicious activity (multiple failed attempts)
 */
export async function checkSuspiciousActivity(coupleCode: string): Promise<{
  isSuspicious: boolean;
  failedAttempts: number;
  message: string;
}> {
  try {
    const log = await getAccessLog(coupleCode);
    
    // Count failed attempts in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentFailedAttempts = log.filter(
      entry => entry.action === 'failed_attempt' && new Date(entry.timestamp) > oneHourAgo
    ).length;

    if (recentFailedAttempts >= 5) {
      return {
        isSuspicious: true,
        failedAttempts: recentFailedAttempts,
        message: 'Too many failed login attempts. Account temporarily locked.',
      };
    }

    return {
      isSuspicious: false,
      failedAttempts: recentFailedAttempts,
      message: 'No suspicious activity',
    };
  } catch (error) {
    console.error('Error checking suspicious activity:', error);
    return {
      isSuspicious: false,
      failedAttempts: 0,
      message: 'Error checking security',
    };
  }
}

/**
 * Update PIN
 */
export async function updateCouplePIN(
  coupleCode: string,
  oldPin: string,
  newPin: string
): Promise<boolean> {
  try {
    const securityRef = doc(db, 'coupleSecurity', coupleCode);
    const securityDoc = await getDoc(securityRef);

    if (!securityDoc.exists()) return false;

    const securityData = securityDoc.data() as CoupleSecurityData;

    // Verify old PIN
    if (!verifyPIN(oldPin, securityData.pinHash)) {
      return false;
    }

    // Update PIN hash
    await updateDoc(securityRef, {
      pinHash: hashPIN(newPin),
      updatedAt: new Date(),
    });

    // Update local PIN
    await SecureStore.setItemAsync(`pin_${coupleCode}`, newPin);

    return true;
  } catch (error) {
    console.error('Error updating PIN:', error);
    return false;
  }
}
