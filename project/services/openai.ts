import { Platform } from 'react-native';

function getBackendUrl(): string {
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    throw new Error('EXPO_PUBLIC_BACKEND_URL is required in production');
  }

  return backendUrl;
}

export interface CoupleContext {
  nickname: string;
  partnerNickname?: string;
  recentMessages?: string[];
  recentParagraphs?: string[];
  relationshipLength?: string;
  mood?: string;
  coupleCode?: string;
}

export async function generateDailyPrompt(context?: CoupleContext): Promise<string> {
  try {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/generate-prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coupleCode: context?.coupleCode,
        nickname: context?.nickname,
        partnerNickname: context?.partnerNickname,
        mood: context?.mood,
      }),
    });

    const data = await response.json();
    
    if (data.success && data.prompt) {
      return data.prompt;
    }
    
    throw new Error('Failed to generate prompt');
  } catch (error) {
    console.error('Error generating daily prompt:', error);
    return getRandomFallbackPrompt();
  }
}

export async function generateDeepQuestion(context?: CoupleContext): Promise<string> {
  try {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/generate-question`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coupleCode: context?.coupleCode,
        nickname: context?.nickname,
        partnerNickname: context?.partnerNickname,
        relationshipLength: context?.relationshipLength,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate deep question');
    }

    const data = await response.json();
    return data.question || getRandomFallbackDeepQuestion();
  } catch (error) {
    console.error('Error generating deep question:', error);
    return getRandomFallbackDeepQuestion();
  }
}

export async function generateEchoResponse(
  userMessage: string, 
  context: CoupleContext,
  conversationHistory?: { role: 'user' | 'assistant', content: string }[]
): Promise<string> {
  try {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/echo-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        userMessage, 
        context, 
        conversationHistory 
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate Echo response');
    }

    const data = await response.json();
    return data.response || getRandomFallbackEchoResponse();
  } catch (error) {
    console.error('Error generating Echo response:', error);
    return getRandomFallbackEchoResponse();
  }
}

export async function generateConflictPrompt(situation?: string, coupleCode?: string): Promise<string> {
  try {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/generate-conflict-prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ situation, coupleCode }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate conflict prompt');
    }

    const data = await response.json();
    return data.prompt || getRandomFallbackConflictPrompt();
  } catch (error) {
    console.error('Error generating conflict prompt:', error);
    return getRandomFallbackConflictPrompt();
  }
}

// Fallback functions for when OpenAI is unavailable
function getRandomFallbackPrompt(): string {
  const prompts = [
    "What made you smile today, and how can you share that joy with your partner?",
    "Describe a moment when you felt most connected to your partner recently.",
    "What's one thing you're grateful for about your relationship today?",
    "Share a memory that always makes you feel warm inside when you think about your partner.",
    "What's something you want to do together in the next week?"
  ];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

function getRandomFallbackDeepQuestion(): string {
  const questions = [
    "If you could relive one day with your partner, which would it be and why?",
    "What's something you've never told your partner but want them to know?",
    "How do you envision your relationship in 10 years?",
    "What's your biggest fear about love, and how does your partner help you overcome it?",
    "What's the most important lesson your relationship has taught you?"
  ];
  return questions[Math.floor(Math.random() * questions.length)];
}

function getRandomFallbackEchoResponse(): string {
  const responses = [
    "I can sense the love in your words. Your relationship is truly special to witness. Tell me more about what's on your heart today. 💕",
    "That's really meaningful. I love learning more about your connection together. How are you feeling about everything? 🌟",
    "Your emotions are so valuable to me. I'm here to listen and remember everything that matters to you both. What else would you like to share? 💭"
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function getRandomFallbackConflictPrompt(): string {
  const prompts = [
    "What are you feeling right now? Try to name the specific emotions.",
    "What do you wish your partner understood about your perspective?",
    "What do you need from your partner in this moment?",
    "How can you express your feelings without blame?"
  ];
  return prompts[Math.floor(Math.random() * prompts.length)];
}