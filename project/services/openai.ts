const DEFAULT_BACKEND_URL = 'http://13.60.188.184:3000';
const REQUEST_TIMEOUT_MS = 12000;
let hasLoggedBackendUrl = false;

function getBackendUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
  const backendUrl = configuredUrl || DEFAULT_BACKEND_URL;

  if (!configuredUrl) {
    console.warn('EXPO_PUBLIC_BACKEND_URL is not set; falling back to default backend URL.');
  }

  const normalizedUrl = backendUrl.replace(/\/+$/, '');
  if (!hasLoggedBackendUrl) {
    hasLoggedBackendUrl = true;
    console.log(`OpenAI service using backend URL: ${normalizedUrl}`);
  }
  return normalizedUrl;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: any) {
    const message = error?.name === 'AbortError'
      ? `Request timeout after ${timeoutMs}ms: ${url}`
      : `Network request failed for ${url}: ${error?.message || 'unknown error'}`;
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkBackendHealth(): Promise<{ ok: boolean; status?: number; body?: any; error?: string }> {
  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/health`;
  try {
    const response = await fetchWithTimeout(url, { method: 'GET' }, 8000);
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      return { ok: false, status: response.status, body, error: `Health check failed with status ${response.status}` };
    }

    return { ok: true, status: response.status, body };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'unknown error' };
  }
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
    const response = await fetchWithTimeout(`${backendUrl}/api/echo-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        coupleCode: context?.coupleCode,
        userMessage, 
        context, 
        conversationHistory 
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to generate Echo response (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    return data.response || getRandomFallbackEchoResponse();
  } catch (error) {
    console.error('Error generating Echo response:', error);
    throw error;
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