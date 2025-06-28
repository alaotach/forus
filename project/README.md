# Couples Connection App 💕

A private, intimate app built with React Native (Expo) and Firebase for couples to stay connected, share memories, and grow together emotionally. Now powered by OpenAI for intelligent prompts and AI companionship.

## ✨ Features

### 🔗 Connection System
- Simple pairing with nicknames and 6-digit couple codes
- No traditional authentication - just shared access codes
- Automatic couple space creation
- Real-time data syncing between partners

### 💬 Real-time Chat
- Private messaging between partners
- Message reactions with heart emojis
- Typing indicators and timestamps
- Media sharing (photos, audio) - Coming Soon
- Cozy, intimate chat design with gradient backgrounds

### 📝 Daily Paragraph Writing Challenge
- **AI-generated writing prompts** using OpenAI GPT-4
- Personalized prompts based on your relationship context
- Both partners write responses to the same prompt
- View partner's writing after completing your own
- Streak tracking for consistency
- Mood tracking with each entry
- Word count and writing statistics

### 🔥 Streak Counter
- Track daily app usage streaks
- Monitor writing consistency streaks
- Visual streak indicators with fire emojis
- Best streak records
- Encouragement to maintain daily connection

### 💝 Memory Vault
- Store letters, photos, and audio recordings
- Organized by type (letters, photos, audio)
- Tag memories with moods and themes
- Favorite important memories
- Private archive of your relationship
- Beautiful card-based layout

### 🎯 Shared Goals
- Create relationship goals together
- Set priority levels (low, medium, high)
- Track completion status with visual indicators
- See who completed each goal and when
- Add detailed descriptions to goals
- Delete completed or outdated goals

### 🤖 Echo AI Companion
- **Powered by OpenAI GPT-4** for intelligent conversations
- Learns from your relationship context (chats, writings, shared moments)
- Provides personalized emotional support and relationship insights
- Remembers your conversation history for contextual responses
- Helps recall beautiful memories and provides guidance
- Natural, empathetic conversation flow

### 💭 Deep Questions
- **AI-generated deep conversation starters** using OpenAI
- Personalized questions based on your relationship dynamics
- Both partners must answer to unlock responses
- Promotes meaningful conversations and emotional intimacy
- Question history and progress tracking
- Tips for deeper conversations

### 🤝 Conflict Helper
- **AI-powered guidance** for working through disagreements
- Intelligent prompts that adapt to your situation
- Step-by-step emotional expression process
- Safe space to share feelings with AI support
- Option to send thoughts as messages
- Helpful communication tips and non-judgmental guidance

### ✨ Additional Features (Coming Soon)
- **Mood Check-In**: Daily emotional tracking with partner visibility
- **Milestones**: Important date tracking and countdowns
- **Photo Sharing**: Enhanced media vault with editing
- **Voice Messages**: Audio recording and playback
- **Relationship Analytics**: AI-powered insights into your connection patterns

## 🎨 Design Philosophy

This app prioritizes:
- **Intimacy**: Private, secure space for just two people
- **Intelligence**: AI-powered features that understand your relationship
- **Beauty**: Soft gradients, cozy design, and thoughtful animations
- **Simplicity**: Easy to use without overwhelming features
- **Connection**: Tools to strengthen emotional bonds daily
- **Privacy**: No external sharing or social features
- **Growth**: Features that help couples grow together with AI guidance

## 🛠 Tech Stack

- **Frontend**: React Native with Expo SDK 52
- **Backend**: Firebase Firestore & Storage
- **AI**: OpenAI GPT-4 for prompts and Echo bot
- **Navigation**: Expo Router with tab-based navigation
- **Styling**: StyleSheet with LinearGradient backgrounds
- **Animations**: React Native Reanimated
- **Icons**: Lucide React Native
- **Fonts**: Inter & Playfair Display (Google Fonts)
- **State Management**: React Hooks & Context
- **Storage**: AsyncStorage for local data

## 📱 Setup Instructions

### 1. Firebase Configuration

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Enable Firestore Database and Storage
3. Update the Firebase configuration in `services/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};
```

### 2. OpenAI Configuration

1. Get your OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Add it to your environment variables (see step 3)

### 3. Environment Variables

Create a `.env` file in the root directory:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id
EXPO_PUBLIC_OPENAI_API_KEY=your-openai-api-key
```

### 4. Firestore Security Rules

Set up your Firestore security rules for development:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access for development
    // In production, implement proper security rules
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### 5. Install Dependencies

```bash
npm install
```

### 6. Run the App

```bash
npm run dev
```

## 🤖 AI Features Explained

### OpenAI Integration
- **Daily Prompts**: GPT-4 generates personalized writing prompts based on your relationship context
- **Deep Questions**: AI creates meaningful conversation starters tailored to your connection
- **Echo Companion**: Intelligent chatbot that learns from your relationship data and provides contextual support
- **Conflict Guidance**: AI-powered prompts that help navigate difficult conversations

### Context Awareness
The AI features use relationship context including:
- Partner nicknames and relationship dynamics
- Recent chat messages and conversations
- Daily writing entries and moods
- Relationship length and milestones
- Current emotional states

### Fallback System
All AI features include fallback mechanisms:
- Static prompts when OpenAI is unavailable
- Graceful error handling
- Offline functionality with cached content

## 📊 Data Structure

The app uses the following Firestore structure:

```
couples/{coupleCode}/
├── users/{nickname}
└── chat/{messageId}

dailyParagraphs/{coupleCode}/{date}/{nickname}
streaks/{coupleCode}
vault/{coupleCode}/items/{itemId}
goals/{coupleCode}/items/{goalId}
deepTalks/{coupleCode}/{date}
conflicts/{coupleCode}/entries/{entryId}
moods/{coupleCode}/{date}/{nickname}
milestones/{coupleCode}/{milestoneId}
echoMemories/{coupleCode}/{memoryId}
```

## 🔒 Privacy & Security

- No user accounts or personal information required
- Data is isolated by couple codes
- No external sharing or social features
- All data stays within your private couple space
- Firebase security rules protect data access
- OpenAI API calls are made securely with proper key management

## 🚀 Future AI Enhancements

- Advanced relationship analytics and insights
- Personalized milestone suggestions
- Mood pattern analysis and recommendations
- Conflict resolution strategies based on your communication style
- Memory timeline generation from your shared experiences
- Relationship goal suggestions based on your interactions

## 💝 Perfect For

- Long-distance couples wanting to stay connected
- Couples looking to deepen their emotional bond with AI guidance
- Partners who want to build daily connection habits
- Anyone wanting a private space to grow together with intelligent support
- Couples working on communication skills with AI assistance

---

Made with 💕 and 🤖 for couples who want to stay connected and grow together every day with the power of AI.