# Firebase Auth System - Quick Start Guide

## Installation Complete ✅

All authentication screens and services have been implemented and are ready to use.

---

## 🚀 Quick Start

### 1. Start the App
```bash
cd /path/to/project
npm start
# or
npx expo start
```

### 2. First User Registration
1. Open app on **Device 1** (or Emulator 1)
2. Tap **"Register"**
3. Enter email: `alice@example.com`
4. Enter password: `password123`
5. Tap **"Register"**
6. Enter nickname: `Alice`
7. Tap **"Continue"**
8. **Copy the 6-digit couple code** (e.g., `123456`)

### 3. Second User Registration & Connection
1. Open app on **Device 2** (or Emulator 2)
2. Tap **"Register"**
3. Enter email: `bob@example.com`
4. Enter password: `password456`
5. Tap **"Register"**
6. Tap **"Join Existing Couple"**
7. Enter couple code from Device 1: `123456`
8. Enter nickname: `Bob`
9. Tap **"Connect"**

### 4. Connection Complete! 🎉
- Device 1 will automatically navigate to the app (real-time update)
- Device 2 will show success message and navigate to app
- Both users now have full access to ForUs

---

## 🧪 Testing Multiple Scenarios

### Test 1: Wrong Couple Code
```
Device 2: Enter wrong code "654321"
Expected: Error message "Invalid couple code"
Result: Can retry with correct code
```

### Test 2: Existing User Login
```
Device 1: Close app
Device 1: Open app again
Device 1: Tap "Login"
Device 1: Enter email & password
Expected: Auto-navigate to app (couple already connected)
Result: App opens without couple setup screen
```

### Test 3: Waiting for Partner
```
Device 1: Register and get couple code
Device 1: DON'T close app or go back
Device 1: You'll see "Waiting for Partner..." screen
Device 2: Register and enter the code
Expected: Device 1 should automatically navigate to app
Result: Real-time update works!
```

---

## 📁 File Structure

```
ForUs Project
├── services/
│   ├── auth.ts                 ← Authentication logic
│   ├── firebase.ts             ← Firebase config (updated with auth)
│   └── ...
├── app/
│   ├── _layout.tsx             ← Navigation control (updated)
│   ├── (tabs)/                 ← Main app screens
│   ├── (auth)/                 ← NEW Auth screens folder
│   │   ├── _layout.tsx         ← Auth navigator
│   │   ├── auth.tsx            ← Login/Register
│   │   ├── nickname.tsx        ← Nickname setup
│   │   ├── couple-code.tsx     ← Code display
│   │   ├── couple-check.tsx    ← Status checker
│   │   ├── couple-options.tsx  ← Route selector
│   │   ├── join-couple.tsx     ← Join existing
│   │   └── waiting-for-partner.tsx ← Waiting screen
│   └── ...
├── hooks/
│   ├── useAuth.ts              ← Auth hook (updated)
│   └── ...
├── AUTH_FLOW.md                ← Detailed flow documentation
└── AUTH_IMPLEMENTATION.md      ← Full implementation guide
```

---

## 🔑 Key Environment Variables (Already Configured)

The app uses these Firebase config values (already in firebase.ts):
```
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyA3dyNHkUDOwDt9fdFIXsUO9Ywx30uy_z4
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=couple-b520b.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=couple-b520b
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=couple-b520b.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=108874620080
EXPO_PUBLIC_FIREBASE_APP_ID=1:108874620080:web:32c66c98996d3b358b6f75
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=G-V3XWS1KKH2
```

✅ Already set up - no action needed!

---

## 🎨 UI Flow at a Glance

### Not Logged In
```
App Start
  ↓
  Not Authenticated?
  ↓
  Show: Auth Screen (Login/Register)
  ↓
  User Registers → Show: Nickname Screen
  ↓
  User Submits → Show: Couple Code Screen
  ↓
  User Clicks "Wait" → Show: Waiting Screen
  ↓
  Partner Joins → AUTO Navigate to App
```

### Logged In But Couple Not Connected
```
App Start (Login)
  ↓
  Authenticated + No Partner?
  ↓
  Show: Couple Check Screen
  ↓
  Redirects to: Couple Code or Couple Options
  ↓
  User Waits → Partner Joins → Navigate to App
```

### Fully Connected
```
App Start
  ↓
  Authenticated + Partner Found?
  ↓
  AUTO Navigate to App /(tabs)
  ↓
  User sees: Chat, Goals, Vault, etc.
```

---

## 🔐 Security Notes

### Current Security:
- ✅ Firebase Auth handles password hashing
- ✅ 6-digit couple code (1 million combinations)
- ✅ Both users must exist to access app
- ✅ Email uniqueness enforced by Firebase

### Next Steps (Optional):
1. **Add Firestore Security Rules** - Restrict data access
   ```javascript
   match /users/{uid} {
     allow read, write: if request.auth.uid == uid;
   }
   ```

2. **Add PIN Protection** - Already implemented in `services/security.ts`
   - Call `setupCoupleSecurity()` after couple connects
   - Verify with `verifyCoupleSecurity()` on app launch

3. **Enable Email Verification** - Firebase built-in
   ```typescript
   await sendEmailVerification(user);
   ```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Email already in use" | Use different email or tap "Login" |
| "Invalid couple code" | Check code is exactly 6 digits from partner |
| "User not found" | Ensure partner registered first |
| "Waiting screen not responding" | Try closing and reopening app |
| App crashes on startup | Check Firebase config in `services/firebase.ts` |
| Can't copy couple code | Ensure `expo-clipboard` is installed |

---

## 📊 Firebase Console Checks

### To verify users registered:
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select "couple-b520b" project
3. Go to **Authentication** tab
4. You should see registered user emails
5. Go to **Firestore Database** tab
6. Check `users` collection for created profiles

---

## 🎯 What Happens Next

After couple connects:
1. ✅ Both can see each other's nickname
2. ✅ Real-time Firestore sync active
3. ✅ They can use Chat, Vault, Goals, etc.
4. ✅ All couple data syncs in real-time

The pairing is stored in:
- `users/{uid1}` - Contains `partnerUid: uid2`
- `users/{uid2}` - Contains `partnerUid: uid1`

---

## 📝 Developer Notes

### Important Functions

**In services/auth.ts:**
```typescript
// Register new user
await registerUser('email@example.com', 'password');

// Login existing user
await loginUser('email@example.com', 'password');

// Generate couple code (called automatically)
await setNicknameAndGenerateCode(uid, 'Alice');

// Join as second user
await joinCoupleWithCode(uid, '123456', 'Bob');

// Check if couple is connected
const connected = await isCoupleConnected(uid);
```

**In app/_layout.tsx:**
```typescript
// This manages the navigation flow automatically:
if (!user) {
  // Show auth screens
} else if (!coupleConnected) {
  // Show couple setup
} else {
  // Show main app
}
```

---

## ✨ Features Already Working

- ✅ Email/Password authentication
- ✅ Couple code generation
- ✅ Real-time waiting screen
- ✅ Automatic app navigation
- ✅ Error handling
- ✅ User profile storage
- ✅ Partner lookup
- ✅ Session management
- ✅ Logout functionality

---

## 🚀 Deployment Checklist

Before going to production:

- [ ] Test with 2 real devices
- [ ] Test losing network connection
- [ ] Test rapid code entry
- [ ] Add Firestore security rules
- [ ] Set up error logging (Sentry)
- [ ] Configure email domain (optional)
- [ ] Add password reset email
- [ ] Add email verification
- [ ] Review Privacy Policy
- [ ] Review Terms of Service
- [ ] Submit to App Store
- [ ] Submit to Google Play

---

## 📞 Common Questions

**Q: Can users change their couple code?**
A: Currently no - code is generated once. Could add reset feature later.

**Q: What if couple code is shared publicly?**
A: Anyone can join but only the first person to enter it + their nickname gets paired.

**Q: Can a user be in multiple couples?**
A: No - current design supports 1 couple per account. Multi-couple support could be added.

**Q: Does app work offline?**
A: Real-time features won't update offline, but Firestore caching works.

**Q: How long is couple code valid?**
A: Forever - no expiration. Could add expiration logic if needed.

---

## 🔗 Quick Links

- [Full Auth Flow Documentation](AUTH_FLOW.md)
- [Complete Implementation Guide](AUTH_IMPLEMENTATION.md)
- [Authentication Service](services/auth.ts)
- [Firebase Configuration](services/firebase.ts)
- [Root Layout/Navigation](app/_layout.tsx)

---

## 🎉 You're All Set!

The entire authentication system is ready to use. Download the app on two devices and start the pairing flow!

**Questions?** Check `AUTH_FLOW.md` for detailed documentation.

**Ready to test?** Start the app with `npm start` or `npx expo start`!
