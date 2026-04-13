# In-App Purchase (IAP) Setup Guide

## Overview
The app now includes in-app purchases for subscription plans. This guide explains how to configure IAP for both iOS (App Store) and Android (Google Play).

## Product IDs
The following product IDs are configured in the app:
- `forus_monthly_subscription` - Monthly recurring subscription ($4.99/month)
- `forus_yearly_subscription` - Yearly recurring subscription ($49.99/year)
- `forus_lifetime_subscription` - Lifetime one-time purchase ($99.99)

## iOS Setup (App Store Connect)

### 1. Create App in App Store Connect
1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Create a new app with bundle ID: `com.forus.app`

### 2. Add In-App Purchases
1. Go to your app → In-App Purchases
2. Create three subscriptions with these details:

#### Monthly Subscription
- Product ID: `forus_monthly_subscription`
- Price: $4.99 USD
- Billing Cycle: Monthly
- Duration: One month
- Renewal Status: Auto-renewable

#### Yearly Subscription
- Product ID: `forus_yearly_subscription`
- Price: $49.99 USD
- Billing Cycle: Yearly
- Duration: One year
- Renewal Status: Auto-renewable

#### Lifetime Subscription
- Product ID: `forus_lifetime_subscription`
- Product Type: Non-consumable
- Price: $99.99 USD

### 3. Test with Sandbox Account
1. Create a sandbox tester account in App Store Connect
2. Use this account to test purchases in development

## Android Setup (Google Play Console)

### 1. Create App in Google Play Console
1. Go to [Google Play Console](https://play.google.com/console)
2. Create a new app

### 2. Add In-App Products
1. Go to your app → Products → In-app products
2. Create three subscriptions with these details:

#### Monthly Subscription
- Product ID: `forus_monthly_subscription`
- Title: Forus Monthly Subscription
- Price: $4.99 USD
- Billing Period: Monthly

#### Yearly Subscription
- Product ID: `forus_yearly_subscription`
- Title: Forus Yearly Subscription
- Price: $49.99 USD
- Billing Period: Yearly

#### Lifetime Subscription
- Product ID: `forus_lifetime_subscription`
- Title: Forus Lifetime Subscription
- Price: $99.99 USD
- One-time purchase (not subscription)

### 3. Test with Google Play Beta Testing
1. Add test accounts in the Google Play Console
2. Install the app via beta link to test purchases

## Implementation Details

### Current Status
The IAP service (`services/iap.ts`) currently has:
- ✅ Product ID configuration
- ✅ Mock purchase/restore functions
- ✅ Receipt verification structure
- ✅ UI integration in subscriptions screen
- ⏳ **TODO**: Integrate actual `expo-in-app-purchases` module

### Integration with Subscriptions Screen
When a user purchases:
1. The purchase modal shows pricing and confirmation
2. `purchaseSubscription()` is called with the selected plan
3. On success, the subscription is saved to Firestore
4. Both users immediately get premium benefits

### Restore Purchases
Users can restore previous purchases via the "Restore Previous Purchases" button on the subscriptions screen.

## Next Steps

### Step 1: Install Expo IAP Module
```bash
expo install expo-in-app-purchases
```

### Step 2: Implement Real IAP Functions
Replace the mock functions in `services/iap.ts` with actual Expo IAP API calls:
- `initializeIAP()` - Initialize IAP system
- `purchaseSubscription()` - Process actual purchases
- `restorePurchases()` - Restore previous purchases
- `verifyReceipt()` - Verify receipts with backend

### Step 3: Backend Receipt Validation (Recommended)
Implement server-side verification:
1. User completes purchase in app
2. Receipt sent to your backend
3. Backend validates with Apple/Google
4. Backend updates Firestore subscription

This prevents fraud and ensures only valid purchases are credited.

### Step 4: Handle Subscription Expiry
Implement automatic downgrade logic:
1. Check subscription expiry daily
2. If expired, downgrade to free plan
3. Show ads again if subscription expires

## Testing

### iOS Testing
```bash
# Test on simulator with sandbox account
expo start --ios
# Select Sandbox Account in TestFlight
```

### Android Testing
```bash
# Test with Google Play beta testers
expo start --android
# Use test account to purchase
```

## Troubleshooting

### Purchase Not Processing
- Verify product IDs match exactly
- Check app is properly signed
- Ensure payment method is valid
- Check device has internet connection

### Restore Not Working
- Ensure user is logged into App Store/Google Play
- Try reinstalling app
- Wait 24 hours for transaction to finalize

### Receipt Validation Fails
- Verify receipt is properly formatted
- Check backend is using correct validation endpoint
- Ensure bundle ID matches in App Store Connect

## Security Notes
- Never trust client-side purchase verification
- Always validate receipts on your backend
- Implement rate limiting for purchase attempts
- Log all purchase transactions for audit
- Use HTTPS for all receipt verification

## Support
For issues with Expo IAP, see:
- [Expo In-App Purchases Docs](https://docs.expo.dev/versions/latest/sdk/in-app-purchases/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Billing System](https://developer.android.com/google-play/billing)
