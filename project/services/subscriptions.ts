import { db } from './firebase';
import { doc, setDoc, getDoc, getDocs, collection, query, where, onSnapshot, serverTimestamp, writeBatch, Timestamp } from 'firebase/firestore';

export type SubscriptionType = 'free' | 'monthly' | 'yearly' | 'lifetime';

export interface SubscriptionData {
  type: SubscriptionType;
  startDate: any;
  endDate?: any;
  autoRenew: boolean;
  status: 'active' | 'expired' | 'cancelled';
  storageQuotaMB: number; // Free: 500MB, Paid: 5GB
  retentionDaysFreeItems: number; // Free: 14 days, Paid: unlimited
  maxMediaPerMessage: number;
  showAds: boolean; // Free: true, Paid: false
}

export const SUBSCRIPTION_FEATURES = {
  free: {
    storageQuotaMB: 500,
    retentionDaysFreeItems: 14, // vault items auto-delete after 14 days
    maxMediaPerMessage: 1,
    price: 0,
    showAds: true,
    features: [
      'All core features',
      'Chat forever',
      'Memories saved for 2 weeks',
      'Basic couple tools',
      'Ad-supported experience',
    ],
  },
  monthly: {
    storageQuotaMB: 5000,
    retentionDaysFreeItems: -1, // unlimited
    maxMediaPerMessage: 5,
    price: 4.99,
    showAds: false,
    features: [
      'Everything in Free (without ads)',
      'Keep all your memories',
      'More space for photos & audio',
      'Faster uploads',
      'Ad-free experience',
    ],
  },
  yearly: {
    storageQuotaMB: 5000,
    retentionDaysFreeItems: -1,
    maxMediaPerMessage: 5,
    price: 49.99,
    showAds: false,
    features: [
      'Everything in Monthly',
      'Save 2 months vs monthly',
      'Annual peace of mind',
    ],
  },
  lifetime: {
    storageQuotaMB: 10000,
    retentionDaysFreeItems: -1,
    maxMediaPerMessage: 10,
    price: 99.99,
    showAds: false,
    features: [
      'Everything Forever',
      'Lifetime support',
      'Never worry about storage again',
      'Lifetime access (one-time payment)',
      'Premium support',
    ],
  },
};

/**
 * Check if a subscription should show ads
 * Returns true only for free plan (no paid subscription active)
 */
export function shouldShowAds(subscription: SubscriptionData | null): boolean {
  if (!subscription) return true; // Show ads by default
  if (subscription.type === 'free') return true;
  if (!isSubscriptionActive(subscription)) return true; // Expired = show ads
  return false; // Paid subscription = no ads
}

export async function getSubscription(coupleCode: string): Promise<SubscriptionData | null> {
  try {
    const subRef = doc(db, 'subscriptions', coupleCode);
    const subDoc = await getDoc(subRef);
    
    if (subDoc.exists()) {
      return subDoc.data() as SubscriptionData;
    }
    
    // Default to free plan if no subscription exists
    return {
      type: 'free',
      startDate: serverTimestamp(),
      autoRenew: false,
      status: 'active',
      ...SUBSCRIPTION_FEATURES.free,
    };
  } catch (error) {
    console.error('Error getting subscription:', error);
    return null;
  }
}

export async function createOrUpdateSubscription(
  coupleCode: string,
  subscriptionType: SubscriptionType,
  autoRenew: boolean = true
): Promise<SubscriptionData | null> {
  try {
    const features = SUBSCRIPTION_FEATURES[subscriptionType];
    const endDate = subscriptionType === 'lifetime' 
      ? null 
      : subscriptionType === 'monthly'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const subscriptionData: SubscriptionData = {
      type: subscriptionType,
      startDate: serverTimestamp(),
      endDate: endDate,
      autoRenew,
      status: 'active',
      storageQuotaMB: features.storageQuotaMB,
      retentionDaysFreeItems: features.retentionDaysFreeItems,
      maxMediaPerMessage: features.maxMediaPerMessage,
      showAds: features.showAds,
    };

    const subRef = doc(db, 'subscriptions', coupleCode);
    await setDoc(subRef, subscriptionData, { merge: true });
    
    return subscriptionData;
  } catch (error) {
    console.error('Error creating subscription:', error);
    return null;
  }
}

export function subscribeToSubscription(
  coupleCode: string,
  callback: (subscription: SubscriptionData | null) => void
) {
  const subRef = doc(db, 'subscriptions', coupleCode);
  
  const unsubscribe = onSnapshot(subRef, (doc) => {
    if (doc.exists()) {
      callback(doc.data() as SubscriptionData);
    } else {
      // Return default free plan
      callback({
        type: 'free',
        startDate: new Date(),
        autoRenew: false,
        status: 'active',
        ...SUBSCRIPTION_FEATURES.free,
      });
    }
  });

  return unsubscribe;
}

export function isSubscriptionActive(subscription: SubscriptionData): boolean {
  if (!subscription) return false;
  
  // Lifetime subscriptions never expire
  if (subscription.type === 'lifetime') return true;
  
  // Check if expired
  if (subscription.endDate) {
    const endDate = subscription.endDate.toDate ? subscription.endDate.toDate() : new Date(subscription.endDate);
    return new Date() < endDate;
  }
  
  return subscription.status === 'active';
}

export async function checkAndDeleteExpiredFreeItems(coupleCode: string) {
  try {
    const subscription = await getSubscription(coupleCode);
    if (!subscription || subscription.retentionDaysFreeItems < 0) {
      return;
    }

    const retentionMs = subscription.retentionDaysFreeItems * 24 * 60 * 60 * 1000;
    const cutoffDate = Timestamp.fromDate(new Date(Date.now() - retentionMs));

    const vaultRef = collection(db, 'vault', coupleCode, 'items');
    const q = query(
      vaultRef, 
      where('timestamp', '<', cutoffDate),
      where('type', 'in', ['letter', 'photo', 'audio', 'memory'])
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log(`No expired items found for couple ${coupleCode}`);
      return;
    }

    console.log(`Found ${snapshot.docs.length} items to delete`);
    let batch = writeBatch(db);
    let count = 0;

    for (const docSnap of snapshot.docs) {
      batch.delete(docSnap.ref);
      count++;

      if (count % 500 === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }

    if (count % 500 !== 0) {
      await batch.commit();
    }
    console.log(`Successfully deleted ${count} expired properties`);
  } catch (error) {
    console.error('Error checking expired items:', error);
  }
}

/**
 * Check if subscription has expired and downgrade to free if needed
 * Call this daily to auto-downgrade expired subscriptions
 */
export async function checkAndDowngradeExpiredSubscription(coupleCode: string): Promise<boolean> {
  try {
    const subscription = await getSubscription(coupleCode);
    if (!subscription) return false;

    // If lifetime or free, nothing to downgrade
    if (subscription.type === 'lifetime' || subscription.type === 'free') {
      return false;
    }

    // Check if subscription is still active
    if (isSubscriptionActive(subscription)) {
      return false; // Still active, no downgrade needed
    }

    // Subscription expired, downgrade to free
    console.log(`Subscription expired for couple ${coupleCode}, downgrading to free plan`);
    
    await createOrUpdateSubscription(coupleCode, 'free');
    
    return true; // Subscription was downgraded
  } catch (error) {
    console.error('Error checking subscription expiry:', error);
    return false;
  }
}
