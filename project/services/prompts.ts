import { generateDailyPrompt, generateDeepQuestion, generateConflictPrompt, CoupleContext } from './openai';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Legacy fallback prompts (kept for offline scenarios)
export const dailyPrompts = [
  "What made you smile today, and how can you share that joy with your partner?",
  "Describe a moment when you felt most connected to your partner recently.",
  "What's one thing you're grateful for about your relationship today?",
  "Share a memory that always makes you feel warm inside when you think about your partner.",
  "What's something you want to do together in the next week?",
  "How has your partner made you feel loved recently?",
  "What's one way you want to grow together as a couple?",
  "Describe the little things your partner does that mean the world to you.",
  "What's a dream you have for your future together?",
  "How do you feel most understood by your partner?",
  "What's something new you learned about your partner this week?",
  "Describe a challenge you've overcome together and how it made you stronger.",
  "What's your favorite way to show love to your partner?",
  "How do you want to surprise your partner next?",
  "What's something you admire about your partner's character?",
  "Describe a perfect day you'd love to spend together.",
  "What's a fear you have about your relationship, and how can you address it together?",
  "How has your partner helped you become a better person?",
  "What's a tradition you want to start together?",
  "Describe how your partner makes you feel safe and secure.",
  "What's something you want to thank your partner for?",
  "How do you handle disagreements, and what have you learned?",
  "What's your favorite memory from this month?",
  "How do you support each other during difficult times?",
  "What's something you're excited to experience together?",
  "Describe how your love has evolved since you first met.",
  "What's a goal you want to achieve together this year?",
  "How do you maintain intimacy in your relationship?",
  "What's something your partner does that always makes you laugh?",
  "How do you want to celebrate your next milestone together?"
];

export const deepQuestions = [
  "If you could relive one day with your partner, which would it be and why?",
  "What's something you've never told your partner but want them to know?",
  "How do you envision your relationship in 10 years?",
  "What's your biggest fear about love, and how does your partner help you overcome it?",
  "If you could give your partner one superpower, what would it be?",
  "What's the most important lesson your relationship has taught you?",
  "How do you want to be remembered as a couple?",
  "What's something you want to improve about yourself for your relationship?",
  "If you could ask your partner anything and get a completely honest answer, what would it be?",
  "What's your favorite thing about the way your partner loves you?",
  "How has your definition of love changed since being with your partner?",
  "What's a secret dream you have for your relationship?",
  "If you could write a letter to your future selves, what would you say?",
  "What's something you want to promise your partner right now?",
  "How do you want to grow old together?",
  "What's the most romantic thing your partner has ever done?",
  "If you could solve one problem in your relationship instantly, what would it be?",
  "What's something you want to experience together before you die?",
  "How do you want to handle challenges that come your way?",
  "What's your favorite way your partner shows they care about you?"
];

export const conflictPrompts = [
  "What are you feeling right now? Try to name the specific emotions.",
  "What do you wish your partner understood about your perspective?",
  "What do you need from your partner in this moment?",
  "How can you both work together to resolve this?",
  "What's the underlying need behind your feelings?",
  "How can you express your feelings without blame?",
  "What would help you feel heard and understood?",
  "What's one thing you appreciate about your partner even in this difficult moment?",
  "How can you both learn and grow from this situation?",
  "What would a resolution look like for both of you?"
];

// Enhanced functions that use OpenAI when available, fallback to static prompts
export async function getTodaysPrompt(context?: CoupleContext): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    
    // Create a unique key per couple per day (not per user)
    const promptKey = context?.coupleCode 
      ? `${today}_${context.coupleCode}` 
      : today;
    
    // Check if we have a prompt stored for this couple today
    const promptRef = doc(db, 'dailyPrompts', promptKey);
    const promptDoc = await getDoc(promptRef);
    
    if (promptDoc.exists()) {
      // Return cached prompt for this couple today
      return promptDoc.data().prompt;
    }
    
    // Generate new prompt for this couple
    let prompt: string;
    try {
      prompt = await generateDailyPrompt(context);
    } catch (error) {
      console.error('OpenAI error, using static prompt:', error);
      // Use different fallback for each couple by adding their coupleCode to the hash
      const coupleHash = context?.coupleCode 
        ? context.coupleCode.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) 
        : 0;
      prompt = dailyPrompts[(dayOfYear + coupleHash) % dailyPrompts.length];
    }
    
    // Store the prompt for this couple today
    await setDoc(promptRef, {
      prompt,
      createdAt: new Date(),
      date: today,
      coupleCode: context?.coupleCode || 'anonymous',
    });
    
    return prompt;
  } catch (error) {
    console.error('Error in getTodaysPrompt:', error);
    // Final fallback
    const today = new Date();
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
    const coupleHash = context?.coupleCode 
      ? context.coupleCode.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) 
      : 0;
    return dailyPrompts[(dayOfYear + coupleHash) % dailyPrompts.length];
  }
}

export async function getTodaysDeepQuestion(context?: CoupleContext): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    
    // Create a unique key per couple per day (not per user)
    const questionKey = context?.coupleCode 
      ? `${today}_${context.coupleCode}` 
      : today;
    
    // Check if we have a deep question stored for this couple today
    const questionRef = doc(db, 'dailyDeepQuestions', questionKey);
    const questionDoc = await getDoc(questionRef);
    
    if (questionDoc.exists()) {
      // Return cached question for this couple today
      return questionDoc.data().question;
    }
    
    // Generate new question for this couple
    let question: string;
    try {
      question = await generateDeepQuestion(context);
    } catch (error) {
      console.error('OpenAI error, using static question:', error);
      // Use different fallback for each couple
      const coupleHash = context?.coupleCode 
        ? context.coupleCode.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) 
        : 0;
      question = deepQuestions[(dayOfYear + coupleHash) % deepQuestions.length];
    }
    
    // Store the question for this couple today
    await setDoc(questionRef, {
      question,
      createdAt: new Date(),
      date: today,
      coupleCode: context?.coupleCode || 'anonymous',
    });
    
    return question;
  } catch (error) {
    console.error('Error in getTodaysDeepQuestion:', error);
    const today = new Date();
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
    const coupleHash = context?.coupleCode 
      ? context.coupleCode.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) 
      : 0;
    return deepQuestions[(dayOfYear + coupleHash) % deepQuestions.length];
  }
}

export async function getRandomConflictPrompt(situation?: string): Promise<string> {
  try {
    return await generateConflictPrompt(situation);
  } catch (error) {
    console.error('Falling back to static conflict prompt:', error);
    return conflictPrompts[Math.floor(Math.random() * conflictPrompts.length)];
  }
}