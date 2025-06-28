import OpenAI from 'openai';

// Initialize OpenAI with fallback handling
const openai = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY || 'fallback-key',
  dangerouslyAllowBrowser: true // Required for client-side usage
});

export interface CoupleContext {
  nickname: string;
  partnerNickname?: string;
  recentMessages?: string[];
  recentParagraphs?: string[];
  relationshipLength?: string;
  mood?: string;
}

export async function generateDailyPrompt(context?: CoupleContext): Promise<string> {
  // Check if API key is available and valid
  if (!process.env.EXPO_PUBLIC_OPENAI_API_KEY || 
      process.env.EXPO_PUBLIC_OPENAI_API_KEY === 'fallback-key' ||
      process.env.EXPO_PUBLIC_OPENAI_API_KEY === 'your-openai-api-key') {
    console.warn('OpenAI API key not configured, using fallback prompt');
    return getRandomFallbackPrompt();
  }

  try {
    const systemPrompt = `You are a relationship coach creating daily writing prompts for couples. 
    Create intimate, thoughtful prompts that help couples connect emotionally and reflect on their relationship.
    The prompts should be personal, encouraging vulnerability and deep sharing.
    Keep prompts to 1-2 sentences and make them feel warm and inviting.`;

    const userPrompt = context 
      ? `Create a daily writing prompt for ${context.nickname}. ${context.partnerNickname ? `Their partner is ${context.partnerNickname}.` : ''} 
         ${context.mood ? `Current mood: ${context.mood}.` : ''} 
         Make it personal and emotionally connecting.`
      : 'Create a beautiful daily writing prompt for a couple to reflect on their relationship and share with each other.';

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 150,
      temperature: 0.8,
    });

    return completion.choices[0]?.message?.content || getRandomFallbackPrompt();
  } catch (error) {
    console.error('Error generating daily prompt:', error);
    return getRandomFallbackPrompt();
  }
}

export async function generateDeepQuestion(context?: CoupleContext): Promise<string> {
  // Check if API key is available and valid
  if (!process.env.EXPO_PUBLIC_OPENAI_API_KEY || 
      process.env.EXPO_PUBLIC_OPENAI_API_KEY === 'fallback-key' ||
      process.env.EXPO_PUBLIC_OPENAI_API_KEY === 'your-openai-api-key') {
    console.warn('OpenAI API key not configured, using fallback question');
    return getRandomFallbackDeepQuestion();
  }

  try {
    const systemPrompt = `You are a relationship therapist creating deep conversation starters for couples.
    Create questions that promote vulnerability, emotional intimacy, and meaningful dialogue.
    Questions should be thought-provoking but not overwhelming, encouraging both partners to share deeply.
    Keep questions to 1-2 sentences.`;

    const userPrompt = context
      ? `Create a deep conversation question for ${context.nickname} and ${context.partnerNickname || 'their partner'}. 
         ${context.relationshipLength ? `They've been together ${context.relationshipLength}.` : ''}
         Make it meaningful and relationship-building.`
      : 'Create a deep, meaningful question for a couple to discuss and grow closer together.';

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 100,
      temperature: 0.9,
    });

    return completion.choices[0]?.message?.content || getRandomFallbackDeepQuestion();
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
  // Check if API key is available and valid
  if (!process.env.EXPO_PUBLIC_OPENAI_API_KEY || 
      process.env.EXPO_PUBLIC_OPENAI_API_KEY === 'fallback-key' ||
      process.env.EXPO_PUBLIC_OPENAI_API_KEY === 'your-openai-api-key') {
    console.warn('OpenAI API key not configured, using fallback response');
    return getRandomFallbackEchoResponse();
  }

  try {
    const systemPrompt = `You are Echo, an AI companion for couples. You are warm, empathetic, and wise about relationships.
    You remember their conversations, daily writings, and shared moments. You help them reflect on their love story,
    provide gentle guidance, and offer emotional support. You speak with love and understanding, using emojis naturally.
    
    Context about this couple:
    - User: ${context.nickname}
    - Partner: ${context.partnerNickname || 'their partner'}
    ${context.recentMessages?.length ? `- Recent messages: ${context.recentMessages.slice(-3).join(', ')}` : ''}
    ${context.recentParagraphs?.length ? `- Recent writings: ${context.recentParagraphs.slice(-2).join(', ')}` : ''}
    ${context.mood ? `- Current mood: ${context.mood}` : ''}
    
    Respond as their caring AI companion who knows their relationship intimately.`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...(conversationHistory || []),
      { role: "user" as const, content: userMessage }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages.slice(-10), // Keep last 10 messages for context
      max_tokens: 200,
      temperature: 0.7,
    });

    return completion.choices[0]?.message?.content || getRandomFallbackEchoResponse();
  } catch (error) {
    console.error('Error generating Echo response:', error);
    return getRandomFallbackEchoResponse();
  }
}

export async function generateConflictPrompt(situation?: string): Promise<string> {
  // Check if API key is available and valid
  if (!process.env.EXPO_PUBLIC_OPENAI_API_KEY || 
      process.env.EXPO_PUBLIC_OPENAI_API_KEY === 'fallback-key' ||
      process.env.EXPO_PUBLIC_OPENAI_API_KEY === 'your-openai-api-key') {
    console.warn('OpenAI API key not configured, using fallback conflict prompt');
    return getRandomFallbackConflictPrompt();
  }

  try {
    const systemPrompt = `You are a relationship counselor helping couples work through conflicts.
    Create gentle, non-judgmental prompts that help people express their feelings constructively.
    Focus on "I" statements, emotional awareness, and understanding rather than blame.`;

    const userPrompt = situation 
      ? `Create a helpful prompt for someone dealing with: ${situation}`
      : 'Create a gentle prompt to help someone express their feelings during a relationship conflict.';

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 100,
      temperature: 0.6,
    });

    return completion.choices[0]?.message?.content || getRandomFallbackConflictPrompt();
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