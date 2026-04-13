/**
 * RECEIPT VERIFICATION BACKEND GUIDE
 * 
 * This guide explains how to set up server-side validation for in-app purchases.
 * Never trust client-side verification - always validate on your backend!
 */

/**
 * ============================================================================
 * OPTION 1: Node.js/Express Backend
 * ============================================================================
 */

// Install dependencies:
// npm install express axios firebase-admin

// 1. Initialize Firebase Admin in your backend
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json')),
  databaseURL: 'https://your-project.firebaseio.com',
});

const db = admin.firestore();

// 2. Create endpoint to verify iOS receipts
const verifyIOSReceipt = async (req, res) => {
  try {
    const { receipt, coupleCode } = req.body;

    // Step 1: Send receipt to Apple for validation
    const appleResponse = await axios.post(
      'https://buy.itunes.apple.com/verifyReceipt', // Production
      {
        'receipt-data': receipt,
        password: process.env.APP_STORE_SHARED_SECRET, // Your App Store shared secret
      }
    );

    if (appleResponse.data.status !== 0) {
      return res.status(400).json({ error: 'Invalid receipt' });
    }

    // Step 2: Extract receipt info
    const receiptData = appleResponse.data.receipt;
    const productId = receiptData.product_id;
    const expirationDate = new Date(parseInt(receiptData.expires_date_ms));
    const transactionId = receiptData.transaction_id;

    // Step 3: Verify subscription details
    if (!isValidProduct(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    // Step 4: Update Firestore subscription
    const subscriptionType = mapProductIdToSubscriptionType(productId);
    
    await db.collection('subscriptions').doc(coupleCode).set({
      type: subscriptionType,
      startDate: admin.firestore.FieldValue.serverTimestamp(),
      endDate: subscriptionType === 'lifetime' ? null : expirationDate,
      appleTransactionId: transactionId,
      status: 'active',
      autoRenew: receiptData.auto_renews_product_id ? true : false,
    }, { merge: true });

    // Step 5: Log for audit
    await db.collection('purchaseAudit').add({
      coupleCode,
      productId,
      transactionId,
      status: 'verified',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, subscription: subscriptionType });

  } catch (error) {
    console.error('Receipt verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
};

// 3. Create endpoint to verify Android receipts
const verifyAndroidReceipt = async (req, res) => {
  try {
    const { token, productId, coupleCode } = req.body;

    // Step 1: Get access token for Google Play
    const accessToken = await getGooglePlayAccessToken();

    // Step 2: Verify purchase with Google
    const googleResponse = await axios.get(
      `https://www.googleapis.com/androidpublisher/v3/applications/${process.env.ANDROID_PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${token}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const purchaseData = googleResponse.data;

    // Step 3: Validate purchase state
    if (purchaseData.paymentState !== 1) {
      // 1 = confirmed, other values = pending/error
      return res.status(400).json({ error: 'Payment not confirmed' });
    }

    // Step 4: Check expiration
    const expirationTime = new Date(parseInt(purchaseData.expiryTimeMillis));
    if (new Date() > expirationTime && purchaseData.autoRenewing !== true) {
      return res.status(400).json({ error: 'Subscription expired' });
    }

    // Step 5: Update Firestore
    const subscriptionType = mapProductIdToSubscriptionType(productId);
    
    await db.collection('subscriptions').doc(coupleCode).set({
      type: subscriptionType,
      startDate: admin.firestore.FieldValue.serverTimestamp(),
      endDate: subscriptionType === 'lifetime' ? null : expirationTime,
      googlePurchaseToken: token,
      status: 'active',
      autoRenew: purchaseData.autoRenewing || false,
    }, { merge: true });

    // Step 6: Log for audit
    await db.collection('purchaseAudit').add({
      coupleCode,
      productId,
      purchaseToken: token,
      status: 'verified',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, subscription: subscriptionType });

  } catch (error) {
    console.error('Android receipt verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
};

// 4. Helper function to get Google Play access token
const getGooglePlayAccessToken = async () => {
  const response = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: process.env.GOOGLE_PLAY_CLIENT_ID,
    client_secret: process.env.GOOGLE_PLAY_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_PLAY_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });

  return response.data.access_token;
};

// 5. Helper to map product ID to subscription type
const mapProductIdToSubscriptionType = (productId) => {
  const mapping = {
    'forus_monthly_subscription': 'monthly',
    'forus_yearly_subscription': 'yearly',
    'forus_lifetime_subscription': 'lifetime',
  };
  return mapping[productId] || 'free';
};

// 6. Helper to validate product ID
const isValidProduct = (productId) => {
  const validIds = [
    'forus_monthly_subscription',
    'forus_yearly_subscription',
    'forus_lifetime_subscription',
  ];
  return validIds.includes(productId);
};

// 7. Create Express app and routes
const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/verify-ios-receipt', verifyIOSReceipt);
app.post('/api/verify-android-receipt', verifyAndroidReceipt);

// 8. Setup scheduled job to check subscription renewal
// Run this daily to detect non-renewing subscriptions
const checkExpiredSubscriptions = async () => {
  const now = new Date();
  
  const expiredSubscriptions = await db.collection('subscriptions')
    .where('endDate', '<', now)
    .where('status', '==', 'active')
    .get();

  for (const doc of expiredSubscriptions.docs) {
    await doc.ref.update({
      status: 'expired',
      type: 'free',
    });
  }

  console.log(`Checked ${expiredSubscriptions.size} expired subscriptions`);
};

// Schedule this to run daily
// Using node-cron or similar
const cron = require('node-cron');
cron.schedule('0 0 * * *', checkExpiredSubscriptions);

/**
 * ============================================================================
 * ENVIRONMENT VARIABLES NEEDED
 * ============================================================================
 * 
 * .env file should contain:
 * 
 * # Firebase
 * FIREBASE_PROJECT_ID=your-project-id
 * 
 * # Apple App Store
 * APP_STORE_SHARED_SECRET=your-app-store-shared-secret
 * 
 * # Google Play
 * ANDROID_PACKAGE_NAME=com.forus.app
 * GOOGLE_PLAY_CLIENT_ID=your-client-id.apps.googleusercontent.com
 * GOOGLE_PLAY_CLIENT_SECRET=your-client-secret
 * GOOGLE_PLAY_REFRESH_TOKEN=your-refresh-token
 */

/**
 * ============================================================================
 * CLIENT-SIDE INTEGRATION
 * ============================================================================
 * 
 * Update services/iap.ts to call backend after purchase:
 * 
 * export async function purchaseSubscription(subscriptionType: SubscriptionType): Promise<IAPTransaction | null> {
 *   try {
 *     // Get the actual receipt from Expo IAP
 *     const purchases = await getReceipts();
 *     const receipt = purchases[0];
 * 
 *     // Send to your backend for verification
 *     const response = await fetch('https://your-backend.com/api/verify-receipt', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({
 *         receipt: receipt.transactionReceipt,
 *         coupleCode: coupleCode,
 *         platform: Platform.OS, // 'ios' or 'android'
 *       }),
 *     });
 * 
 *     const result = await response.json();
 *     if (!result.success) throw new Error('Verification failed');
 * 
 *     return receipt;
 *   } catch (error) {
 *     console.error('Purchase error:', error);
 *     throw error;
 *   }
 * }
 */

/**
 * ============================================================================
 * SECURITY BEST PRACTICES
 * ============================================================================
 * 
 * 1. Never trust client receipts - always verify server-side
 * 2. Use HTTPS only
 * 3. Validate API requests with authentication tokens
 * 4. Rate limit verification endpoints
 * 5. Log all purchases for audit trails
 * 6. Use environment variables for secrets
 * 7. Implement retry logic for failed verifications
 * 8. Monitor for unusual purchase patterns (fraud detection)
 * 9. Update expired subscriptions daily
 * 10. Store transaction IDs to prevent duplicate processing
 */

/**
 * ============================================================================
 * TESTING
 * ============================================================================
 * 
 * iOS Testing:
 * - Use sandbox receipts from TestFlight
 * - Test with expiring subscriptions
 * - Verify auto-renewal works
 * 
 * Android Testing:
 * - Use Google Play test accounts
 * - Test cancellation flow
 * - Verify license key validation
 */

module.exports = {
  verifyIOSReceipt,
  verifyAndroidReceipt,
  checkExpiredSubscriptions,
};
