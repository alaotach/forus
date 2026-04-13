import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { getSubscription, SUBSCRIPTION_FEATURES } from './subscriptions';

/**
 * Check and delete expired vault items for free plan users
 * Free plan: deletes vault items after 14 days
 * Paid plans: keeps items forever
 */
export async function cleanupExpiredVaultItems(coupleCode: string) {
  try {
    const subscription = await getSubscription(coupleCode);
    if (!subscription) return;

    // If retention is -1 (unlimited), don't delete anything
    if (subscription.retentionDaysFreeItems < 0) {
      console.log(`Couple ${coupleCode} has unlimited retention`);
      return;
    }

    const retentionMs = subscription.retentionDaysFreeItems * 24 * 60 * 60 * 1000;
    const cutoffDate = Timestamp.fromDate(new Date(Date.now() - retentionMs));

    // Query vault items older than retention period (excluding chats)
    const itemsRef = collection(db, 'vault', coupleCode, 'items');
    const q = query(
      itemsRef,
      where('timestamp', '<', cutoffDate),
      where('type', 'in', ['letter', 'photo', 'audio', 'memory']) // Don't delete chats
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log(`No expired items found for couple ${coupleCode}`);
      return;
    }

    console.log(`Found ${snapshot.docs.length} expired items to delete for couple ${coupleCode}`);

    // Batch delete (Firestore limits batch operations to 500 at a time)
    let batch = writeBatch(db);
    let count = 0;

    for (const docSnap of snapshot.docs) {
      batch.delete(docSnap.ref);
      count++;

      // If we've hit 500 items, commit this batch
      if (count % 500 === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }

    // Commit remaining items
    if (count % 500 !== 0) {
      await batch.commit();
    }

    console.log(`Successfully deleted ${count} expired vault items for couple ${coupleCode}`);
  } catch (error) {
    console.error('Error cleaning up expired vault items:', error);
  }
}

/**
 * Calculate storage usage for a couple
 * Only counts vault items and media files (not chats)
 */
export async function calculateStorageUsage(coupleCode: string): Promise<number> {
  try {
    const itemsRef = collection(db, 'vault', coupleCode, 'items');
    const snapshot = await getDocs(itemsRef);

    let totalSizeBytes = 0;

    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      
      // Estimate size: 1KB per metadata + size of media URL and content
      let itemSize = 1024; // 1KB base
      
      if (data.url) itemSize += 500; // Media URLs ~500 bytes
      if (data.content) itemSize += data.content.length; // Text content
      if (data.message) itemSize += data.message.length;
      
      totalSizeBytes += itemSize;
    });

    return Math.ceil(totalSizeBytes / 1024 / 1024); // Convert to MB
  } catch (error) {
    console.error('Error calculating storage usage:', error);
    return 0;
  }
}

/**
 * Check if a couple is within their storage quota
 */
export async function checkStorageQuota(coupleCode: string): Promise<{
  used: number;
  quota: number;
  percentUsed: number;
  isWithinQuota: boolean;
}> {
  try {
    const subscription = await getSubscription(coupleCode);
    if (!subscription) {
      return {
        used: 0,
        quota: 500,
        percentUsed: 0,
        isWithinQuota: true,
      };
    }

    const used = await calculateStorageUsage(coupleCode);
    const quota = subscription.storageQuotaMB;
    const percentUsed = (used / quota) * 100;

    return {
      used,
      quota,
      percentUsed,
      isWithinQuota: used <= quota,
    };
  } catch (error) {
    console.error('Error checking storage quota:', error);
    return {
      used: 0,
      quota: 500,
      percentUsed: 0,
      isWithinQuota: true,
    };
  }
}
