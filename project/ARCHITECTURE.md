# ForUs Auth System - Visual Architecture

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FORUS APP                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              ROOT LAYOUT (app/_layout.tsx)               │ │
│  │  Manages navigation based on auth state                  │ │
│  └────────────────────┬───────────────────────────────────────┘ │
│                       │                                          │
│        ┌──────────────┼──────────────┐                           │
│        │              │              │                           │
│        ▼              ▼              ▼                           │
│  ┌─────────────┐ ┌──────────┐ ┌──────────────┐                 │
│  │   NO USER   │ │USER+NO   │ │USER+PARTNER  │                 │
│  │             │ │PARTNER   │ │              │                 │
│  └─────────────┘ └──────────┘ └──────────────┘                 │
│        │              │              │                           │
│        ▼              ▼              ▼                           │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │               AUTH SCREENS              │                   │ │
│  │  (auth/auth.tsx)                        │  COUPLE SETUP    │ │
│  │  (auth/nickname.tsx)                    │  (couple-code)   │ │
│  │  (auth/couple-code.tsx)                 │  (join-couple)   │ │
│  │  (auth/join-couple.tsx)                 │  (waiting)       │ │
│  │  (auth/couple-options.tsx)              │                  │ │
│  │  (auth/waiting-for-partner.tsx)         │                  │ │
│  │                                         ▼                   │ │
│  │                                  ┌──────────────┐           │ │
│  │                                  │ MAIN APP     │           │ │
│  │                                  │ (tabs)       │           │ │
│  │                                  └──────────────┘           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

                        SERVICES LAYER
                              │
                ┌─────────────┼─────────────┐
                │             │             │
                ▼             ▼             ▼
         ┌─────────────┐ ┌──────────┐ ┌──────────┐
         │   Auth      │ │ Firebase │ │ Storage  │
         │ (auth.ts)   │ │(firebase.│ │(storage) │
         │             │ │   ts)    │ │          │
         └─────────────┘ └──────────┘ └──────────┘
                │
                ▼
        ┌──────────────────┐
        │  FIREBASE CLOUD  │
        ├──────────────────┤
        │  Authentication  │
        │  Firestore DB    │
        │  Cloud Storage   │
        └──────────────────┘
```

---

## 🔄 Authentication Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER NOT LOGGED IN                           │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
        ┌────────────────────────────┐
        │   app/(auth)/auth.tsx      │
        │   Login/Register Screen    │
        │   [Email] [Password]       │
        │   [Login] [Register]       │
        └────────────────┬───────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
     (Existing)               (New User)
            │                         │
            ▼                         ▼
   ┌──────────────────┐    ┌────────────────────┐
   │ Send to Firebase │    │ Create Firebase    │
   │ for Login        │    │ Auth Account       │
   │                  │    │                    │
   │ ✓ Logged in      │    │ ✓ Account Created  │
   └────────┬─────────┘    └─────────┬──────────┘
            │                        │
            │                        ▼
            │              ┌────────────────────────┐
            │              │ app/(auth)/nickname    │
            │              │ Nickname Setup Screen  │
            │              │ [Nickname Input]       │
            │              │ [Continue Button]      │
            │              └───────────┬────────────┘
            │                          │
            │                    ✓ Nickname saved
            │                    ✓ Code generated
            │                          │
            │                          ▼
            │              ┌────────────────────────┐
            │              │ app/(auth)/couple-code │
            │              │ Display Couple Code    │
            │              │ Code: 123456           │
            │              │ [Share] [Copy] [Wait]  │
            │              └───────────┬────────────┘
            │                          │
            │                    ✓ Code ready
            │                    ✓ Go to waiting
            │                          │
            │                          ▼
            │              ┌────────────────────────────┐
            │              │ app/(auth)/waiting         │
            │              │ Waiting for Partner...     │
            │              │ Real-time Firestore        │
            │              │ Listener Active ✓          │
            │              └───────────┬────────────────┘
            │                          │
            │              (Partner joins with code)
            │                          │
            │                    ✓ Partner found
            └─────────────────────┬───┘
                                  │
                                  ▼
                  ┌────────────────────────────┐
                  │ Firestore Users Updated    │
                  │ uid1.partnerUid = uid2     │
                  │ uid2.partnerUid = uid1     │
                  └────────────────┬───────────┘
                                   │
                        ✓ Couple Connected
                                   │
                                   ▼
                  ┌────────────────────────────┐
                  │ Auto-Navigate to App       │
                  │ /(tabs) - Main App         │
                  │ ✅ READY TO USE            │
                  └────────────────────────────┘
```

---

## 📱 Partner Joining Flow

```
┌──────────────────────────────────┐
│  PARTNER (Second User) Joins     │
└──────────────┬───────────────────┘
               │
               ▼
   ┌────────────────────────┐
   │ app/(auth)/auth.tsx    │
   │ Register as New User   │
   └────────────┬───────────┘
                │
                ▼
   ┌────────────────────────────┐
   │ Firebase Auth Account      │
   │ Created for Partner        │
   └────────────┬───────────────┘
                │
                ▼
   ┌────────────────────────────┐
   │ app/(auth)/couple-options  │
   │ [Start New] [Join Exist]   │
   │ Partner Chooses: Join ✓    │
   └────────────┬───────────────┘
                │
                ▼
   ┌────────────────────────────┐
   │ app/(auth)/join-couple     │
   │ Enter Code: 123456         │
   │ Enter Nickname: "Bob"      │
   │ [Connect Button]           │
   └────────────┬───────────────┘
                │
                ▼
   ┌────────────────────────────┐
   │ Validate Couple Code       │
   │ ✓ Code found in registry   │
   │ ✓ Get partner info         │
   └────────────┬───────────────┘
                │
                ▼
   ┌────────────────────────────┐
   │ Update Firestore:          │
   │ users/uid2.partnerUid=uid1 │
   │ users/uid1.partnerUid=uid2 │
   │ coupleRegistry.connected   │
   └────────────┬───────────────┘
                │
                ▼
   ┌────────────────────────────┐
   │ Real-time Listeners Fire   │
   │ Both users notified ✓      │
   │ Both auto-navigate to app  │
   └────────────────────────────┘
```

---

## 🔑 Data Flow: User Registration

```
    User Input
        │
        │ Email, Password
        ▼
┌──────────────────────────────────┐
│ registerUser(email, password)    │
│ (services/auth.ts)               │
└────┬─────────────────────────────┘
     │
     ├─► Firebase Auth API
     │       │
     │       ▼
     │   ┌─────────────────────────┐
     │   │ Create Auth User        │
     │   │ Hash Password (Firebase)│
     │   └────┬────────────────────┘
     │        │
     ▼        ▼
┌──────────────────────────────────┐
│ Firestore: Create User Profile   │
├──────────────────────────────────┤
│ users/{uid}                      │
│ ├── uid: "abc123"                │
│ ├── email: "alice@ex.com"        │
│ ├── nickname: ""  (empty yet)     │
│ ├── coupleCode: "" (empty yet)    │
│ ├── partnerUid: null             │
│ ├── createdAt: timestamp         │
│ └── updatedAt: timestamp         │
└──────────────────────────────────┘
        │
        ▼
   Success ✓
   Navigate to Nickname Screen
```

---

## 🔑 Data Flow: Couple Connection

```
Partner enters couple code "123456"
        │
        ▼
┌────────────────────────────────────┐
│ joinCoupleWithCode(uid, code)      │
│ (services/auth.ts)                 │
└────┬───────────────────────────────┘
     │
     ├─► Look up in coupleRegistry
     │        │
     │        ▼
     │   ┌──────────────────────────┐
     │   │ Find: coupleRegistry/123 │
     │   │ CreatedByUid: "uid1"     │
     │   └──────────────────────────┘
     │        │
     │        ├─► Get partner user data
     │        │        │
     │        │        ▼
     │        │   ┌──────────────────────┐
     │        │   │ users/uid1           │
     │        │   │ Partner info: "Alice"│
     │        │   └──────────────────────┘
     │        │
     ▼        ▼
┌─────────────────────────────────────┐
│ Update Firestore (Multiple Writes)  │
├─────────────────────────────────────┤
│                                     │
│ 1. users/uid2 (Current Partner)    │
│    ├── partnerUid: "uid1"  ← NEW   │
│    └── updatedAt: timestamp        │
│                                     │
│ 2. users/uid1 (First Partner)      │
│    ├── partnerUid: "uid2"  ← NEW   │
│    └── updatedAt: timestamp        │
│                                     │
│ 3. coupleRegistry/123456           │
│    ├── partnerUid: "uid2"  ← NEW   │
│    ├── isConnected: true   ← NEW   │
│    └── connectedAt: timestamp      │
│                                     │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ Real-time Listeners Fire            │
├─────────────────────────────────────┤
│ uid1's listener detects update      │
│   ✓ partnerUid now exists           │
│   ✓ Auto-navigate to app            │
│                                     │
│ uid2's listener confirms            │
│   ✓ Connection established          │
│   ✓ Navigate to app                 │
└─────────────────────────────────────┘
        │
        ▼
   Both Users in App ✓
```

---

## 🎯 Navigation State Machine

```
                    ┌─────────────────┐
                    │   APP STARTS    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Check Auth      │
                    │ State           │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
           NO USER      USER EXISTS      USER EXISTS
           LOGGED         PARTNER         PARTNER
            IN            NOT SET         SET
            │                │                │
            ▼                ▼                ▼
     ┌──────────┐    ┌──────────────┐  ┌─────────┐
     │ AUTH     │    │ COUPLE       │  │  MAIN   │
     │ SCREENS  │    │ SETUP        │  │  APP    │
     │          │    │ SCREENS      │  │ (TABS)  │
     │ (auth/   │    │              │  │         │
     │  auth)   │    │ (couple-     │  └─────────┘
     │          │    │  code,       │
     └────┬─────┘    │  join-etc)   │
          │          │              │
          │          └──────┬───────┘
          │                 │
          │  After Reg      │  After Partner
          │  & Code Gen     │  Joins
          │                 │
          └─────────┬───────┘
                    │
                    ▼
             ┌──────────────┐
             │ MAIN APP     │
             │ READY        │
             └──────────────┘
```

---

## 📊 Firestore Collections Structure

```
ForUs Firestore Database
│
├── users/ (User Profiles)
│   ├── uid1_alice
│   │   ├── uid: "uid1_alice"
│   │   ├── email: "alice@example.com"
│   │   ├── nickname: "Alice"
│   │   ├── coupleCode: "123456"
│   │   ├── partnerUid: "uid2_bob"  ← Links to partner
│   │   ├── createdAt: 1704067200
│   │   └── updatedAt: 1704067260
│   │
│   └── uid2_bob
│       ├── uid: "uid2_bob"
│       ├── email: "bob@example.com"
│       ├── nickname: "Bob"
│       ├── coupleCode: "123456"
│       ├── partnerUid: "uid1_alice"  ← Links to partner
│       ├── createdAt: 1704067230
│       └── updatedAt: 1704067260
│
├── coupleRegistry/ (Couple Tracking)
│   └── 123456
│       ├── createdByUid: "uid1_alice"
│       ├── partnerUid: "uid2_bob"
│       ├── isConnected: true
│       ├── createdAt: 1704067200
│       └── connectedAt: 1704067260
│
└── couples/ (Couple Data - for future use)
    └── 123456
        ├── chat/ (Chat messages)
        ├── vault/ (Photos, letters, audio)
        ├── diary/ (Shared diary entries)
        ├── paragraphs/ (Daily AI paragraphs)
        └── ... (other couple data)
```

---

## 🔐 Security Layers

```
┌─────────────────────────────────────────────────────┐
│          SECURITY ARCHITECTURE                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Layer 1: Firebase Authentication                  │
│  ├─ Email/Password Hashing                         │
│  ├─ Password Recovery                              │
│  ├─ Email Verification (optional)                  │
│  └─ Session Management                             │
│                                                     │
│  Layer 2: Couple Code Verification                 │
│  ├─ 6-digit Random Code (1M combinations)          │
│  ├─ Bi-directional Verification                    │
│  ├─ Code Stored in Firestore                       │
│  └─ One user per couple code                       │
│                                                     │
│  Layer 3: Real-time Listeners (optional)           │
│  ├─ PIN/Password Protection                        │
│  ├─ Device Fingerprinting                          │
│  ├─ Access Logging                                 │
│  └─ Rate Limiting                                  │
│                                                     │
│  Layer 4: Firestore Security Rules (To Add)        │
│  ├─ Users can only read/write own profile          │
│  ├─ Couple data restricted to couple members       │
│  └─ Admin can moderate if needed                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 📈 User Count Scaling

```
Each Couple Takes:
├── 2 Firebase Auth accounts (free tier: unlimited)
├── 2 Firestore user documents (free tier: 50k/month)
├── 1 Couple registry entry (free tier: minimal)
└── Couple data collection (free tier: scales)

Free Tier Limits (Google):
├── 50,000 read ops/month → ~1,700 couples
├── 20,000 write ops/month → ~667 couples
├── 20,000 delete ops/month → ~667 couples
└── Bottleneck: Write operations at ~667 concurrent couples

Production Ready At:
├── <100 couples: Single project (free tier)
├── 100-1000 couples: Paid tier (~$25/mo)
├── 1000+ couples: Sharded database design
```

---

**Status: ✅ Complete Architecture Documented**
