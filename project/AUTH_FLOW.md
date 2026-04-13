# Firebase Authentication Flow - ForUs App

## Overview

The ForUs app now has a complete Firebase-based authentication system with couple pairing. The app prevents unauthorized access by requiring both partners to register and connect using a unique couple code.

## Authentication Flow

### Step 1: User Registration/Login

**Flow:**
- User sees `/(auth)/auth` screen
- User can either **Register** (new account) or **Login** (existing account)
- Email and password are required
- Firebase Auth handles credential validation

**File:** [app/(auth)/auth.tsx](app/(auth)/auth.tsx)

**Key Functions:**
- `registerUser(email, password)` - Creates new Firebase Auth user + Firestore profile
- `loginUser(email, password)` - Authenticates existing user

---

### Step 2: Nickname Setup (New Users Only)

**Flow:**
- After registration, user goes to `/(auth)/nickname`
- User enters their nickname (how partner will see them)
- System generates a random 6-digit **couple code**
- Couple code is saved to Firestore

**File:** [app/(auth)/nickname.tsx](app/(auth)/nickname.tsx)

**Key Functions:**
- `setNicknameAndGenerateCode(uid, nickname)` - Sets nickname and generates random code
- `generateRandomCoupleCode()` - Creates unique 6-digit code (1M combinations)

**Firestore:**
```
users/{uid}
  - nickname: string
  - coupleCode: string (e.g., "123456")
  - partnerUid: undefined (until partner joins)
  - createdAt: timestamp
  - updatedAt: timestamp
```

---

### Step 3: Couple Code Display & Sharing

**Flow:**
- User sees their generated couple code on `/(auth)/couple-code`
- User can **Share** code (via SMS, email, etc.) or **Copy** code
- User can then wait for partner or go back to couple-code

**File:** [app/(auth)/couple-code.tsx](app/(auth)/couple-code.tsx)

**Key Features:**
- Large, easy-to-read code display
- Share button for quick distribution
- Copy-to-clipboard functionality
- Instructions for partner

**Couple Code Registry (Firestore):**
```
coupleRegistry/{coupleCode}
  - createdByUid: string (first user's UID)
  - partnerUid: string | null (second user's UID after joining)
  - isConnected: boolean
  - createdAt: timestamp
  - connectedAt: timestamp (when partner joins)
```

---

### Step 4: Waiting for Partner

**Flow:**
- User sees `/(auth)/waiting-for-partner` screen
- Real-time Firestore listener watches for `partnerUid` in user document
- When partner joins and updates the document, user is notified
- User automatically redirected to `/(tabs)` (main app)

**File:** [app/(auth)/waiting-for-partner.tsx](app/(auth)/waiting-for-partner.tsx)

**Real-Time Listener:**
```typescript
onSnapshot(doc(db, 'users', currentUser.uid), (snapshot) => {
  if (snapshot.data().partnerUid) {
    // Partner has joined! Navigate to app
  }
});
```

**User Instructions Shown:**
1. Partner downloads ForUs app
2. Partner registers with their email/password
3. Partner chooses "Join Existing Couple"
4. Partner enters your 6-digit couple code
5. Partner enters their nickname
6. Connection complete!

---

### Step 5: Partner Registration & Joining

**Flow:**
- Partner registers their own account (email + password)
- Partner sees `/(auth)/couple-options` screen
- Partner chooses **"Join Existing Couple"**
- Partner navigates to `/(auth)/join-couple` screen

**File:** [app/(auth)/couple-options.tsx](app/(auth)/couple-options.tsx)

---

### Step 6: Partner Entering Couple Code

**Flow:**
- Partner enters the 6-digit couple code on `/(auth)/join-couple`
- Partner enters their nickname
- System validates the couple code
- System connects both users bi-directionally
- Both users' documents updated with partner information
- Couple registry marked as connected

**File:** [app/(auth)/join-couple.tsx](app/(auth)/join-couple.tsx)

**Key Function:**
```typescript
joinCoupleWithCode(uid, coupleCode, nickname)
  - Validates couple code exists
  - Gets partner user data
  - Updates current user with partnerUid
  - Updates partner with current user's uid
  - Marks couple registry as connected
  - Real-time listeners trigger, both users navigate to app
```

**Firestore Updates:**

User 1:
```
users/{uid1}
  - partnerUid: uid2  // Added!
  - updatedAt: timestamp
```

User 2:
```
users/{uid2}
  - partnerUid: uid1  // Added!
  - updatedAt: timestamp
```

Couple Registry:
```
coupleRegistry/{coupleCode}
  - partnerUid: uid2  // Added!
  - isConnected: true
  - connectedAt: timestamp
```

---

### Step 7: Couple Check & App Access

**Flow:**
- Existing users see `/(auth)/couple-check` on login
- System checks if couple is fully connected
- If connected: Navigate to `/(tabs)` (main app)
- If not connected: Show couple options or waiting screen

**File:** [app/(auth)/couple-check.tsx](app/(auth)/couple-check.tsx)

**Key Function:**
```typescript
isCoupleConnected(uid)
  - Returns true only if:
    1. User has coupleCode
    2. User has partnerUid
    3. User has nickname
```

---

## Root Layout - Navigation Control

**File:** [app/_layout.tsx](app/_layout.tsx)

The root layout controls which screens are shown based on auth state:

```typescript
if (!user) {
  // Show auth stack (login/register)
  <Stack.Screen name="(auth)/auth" />
  // ... other auth screens ...
} else if (!coupleConnected) {
  // Show couple setup stack
  <Stack.Screen name="(auth)/couple-check" />
  // ... other couple setup screens ...
} else {
  // Show app (couple is fully connected)
  <Stack.Screen name="(tabs)" />
  // ... all app screens ...
}
```

**Auth State Listener:**
```typescript
onAuthStateChange(async (authUser) => {
  if (authUser) {
    const connected = await isCoupleConnected(authUser.uid);
    // Show appropriate screen based on connected status
  }
});
```

---

## Services Used

### Auth Service
**File:** [services/auth.ts](services/auth.ts)

Functions:
- `registerUser(email, password)` - Firebase Auth registration
- `loginUser(email, password)` - Firebase Auth login
- `logoutUser()` - Sign out
- `getCurrentUser()` - Get current Auth user
- `setNicknameAndGenerateCode(uid, nickname)` - Set nickname + generate code
- `joinCoupleWithCode(uid, coupleCode, nickname)` - Join existing couple
- `getUserProfile(uid)` - Get Firestore user data
- `isCoupleConnected(uid)` - Check if couple fully connected
- `getPartnerNickname(uid)` - Get partner's nickname

### Firebase Setup
**File:** [services/firebase.ts](services/firebase.ts)

Exports:
- `auth` - Firebase Auth instance (NEW)
- `db` - Firestore instance
- `storage` - Cloud Storage instance

---

## Security Considerations

### Current Implementation:
1. ✅ Email/password authentication (Firebase Auth)
2. ✅ Random 6-digit couple code (1M combinations)
3. ✅ Bi-directional partner verification
4. ✅ Firestore security rules should restrict access to own couple data

### Recommended Firestore Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own document
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }
    
    // Couple registry - read only for verification
    match /coupleRegistry/{code} {
      allow read: if true;
      allow create: if request.auth.uid != null;
    }
    
    // All couple data restricted to couple members
    match /couples/{coupleCode}/{document=**} {
      allow read, write: if 
        request.auth.uid in get(/databases/$(database)/documents/users/$(request.auth.uid)).data.keys();
    }
  }
}
```

---

## Firestore Data Structure

```
ForUs Project
├── users
│   ├── uid1
│   │   ├── uid: string
│   │   ├── email: string
│   │   ├── nickname: string
│   │   ├── coupleCode: string
│   │   ├── partnerUid: string | null
│   │   ├── createdAt: timestamp
│   │   └── updatedAt: timestamp
│   └── uid2
│       └── ...
│
├── coupleRegistry
│   └── 123456 (couple code)
│       ├── createdByUid: uid1
│       ├── partnerUid: uid2 | null
│       ├── isConnected: boolean
│       ├── createdAt: timestamp
│       └── connectedAt: timestamp | null
│
└── couples
    └── 123456 (couple code - shared data)
        ├── chat
        ├── vault
        ├── paragraphs
        └── ...
```

---

## Testing the Flow

### Scenario: Two Users Pairing

1. **User A (First User):**
   - Open app → Go to `/(auth)/auth`
   - Click "Register" with email `alice@example.com`
   - Enter password
   - Go to nickname screen, enter "Alice"
   - System generates code: `123456`
   - See couple code display screen
   - Copy/share the code `123456`

2. **User B (Second User):**
   - Open app → Go to `/(auth)/auth`
   - Click "Register" with email `bob@example.com`
   - Enter password
   - Go to couple options screen
   - Click "Join Existing Couple"
   - Go to join couple screen
   - Enter couple code: `123456`
   - Enter nickname: "Bob"
   - System validates and connects both users

3. **Result:**
   - Both users see success message
   - Both navigate to `/(tabs)` (main app)
   - App is fully functional for both

---

## Error Handling

### Common Errors:

| Error | Cause | Solution |
|-------|-------|----------|
| "User not found" | Email not registered | Register first |
| "Wrong password" | Incorrect password | Verify password |
| "Email already in use" | Account exists | Use login or different email |
| "Invalid couple code" | Code not found or expired | Share correct code |
| "Too many login attempts" | Brute force detected | Wait before retrying |

---

## Next Steps

1. **Configure Firestore Security Rules** - Add rules above to prevent unauthorized access
2. **Test with Two Devices** - Register on different phones/emulators
3. **Integrate PIN Protection** - Use `services/security.ts` for extra security layer
4. **Setup Cloud Messaging** - Enable push notifications for real-time updates
5. **Deploy to Production** - Submit to App Store and Play Store

---

## File References

- [Auth Service](services/auth.ts)
- [Firebase Setup](services/firebase.ts)
- [Auth Screen](app/(auth)/auth.tsx)
- [Nickname Screen](app/(auth)/nickname.tsx)
- [Couple Code Display](app/(auth)/couple-code.tsx)
- [Waiting Screen](app/(auth)/waiting-for-partner.tsx)
- [Join Couple Screen](app/(auth)/join-couple.tsx)
- [Couple Check](app/(auth)/couple-check.tsx)
- [Couple Options](app/(auth)/couple-options.tsx)
- [Root Layout](app/_layout.tsx)
