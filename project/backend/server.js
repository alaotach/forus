const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const rateLimit = require('express-rate-limit');
const mediaRoutes = require('./routes/mediaRoutes');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || `${15 * 60 * 1000}`, 10);
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '120', 10);
const AI_RATE_LIMIT_MAX = parseInt(process.env.AI_RATE_LIMIT_MAX || '40', 10);

if (isProduction) {
  const requiredEnvVars = [
    'HACKCLUB_API_KEY',
    'PUBLIC_BASE_URL',
    'MEDIA_AUTH_JWT_SECRET',
    'AWS_REGION',
    'AWS_S3_BUCKET',
    'AWS_MEDIA_TABLE',
  ];
  const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);
  if (missingEnvVars.length > 0) {
    console.error(`Missing required environment variables in production: ${missingEnvVars.join(', ')}`);
    process.exit(1);
  }
}

app.set('trust proxy', 1);

// Enable CORS; in production restrict to ALLOWED_ORIGINS if provided.
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

const aiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: AI_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many AI requests. Please wait and retry.' },
});

app.use('/api', apiLimiter);
app.use('/', apiLimiter, mediaRoutes);

function requireCoupleCode(req, res, next) {
  const coupleCode = req.body?.coupleCode || req.body?.context?.coupleCode;
  if (!coupleCode) {
    return res.status(401).json({ success: false, error: 'Unauthorized AI request. Couple code required.' });
  }
  next();
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.HACKCLUB_API_KEY,
  baseURL: 'https://ai.hackclub.com/proxy/v1',
});

const MODEL = 'openai/gpt-oss-120b';

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    aiConfigured: Boolean(process.env.HACKCLUB_API_KEY),
    rateLimit: {
      windowMs: RATE_LIMIT_WINDOW_MS,
      apiMax: RATE_LIMIT_MAX_REQUESTS,
      aiMax: AI_RATE_LIMIT_MAX,
    },
  });
});

// Generate daily prompt
app.post('/api/generate-prompt', aiLimiter, requireCoupleCode, async (req, res) => {
  try {
    const { coupleCode, nickname, partnerNickname, mood } = req.body;

    const systemPrompt = `You are a relationship coach creating daily writing prompts for couples. 
    Create intimate, thoughtful prompts that help couples connect emotionally and reflect on their relationship.
    The prompts should be personal, encouraging vulnerability and deep sharing.
    Keep prompts to 1-2 sentences and make them feel warm and inviting.`;

    const userPrompt = `Create a daily writing prompt for a couple. ${nickname ? `One partner is ${nickname}.` : ''} ${partnerNickname ? `The other is ${partnerNickname}.` : ''} 
         ${mood ? `Current mood: ${mood}.` : ''} 
         Make it personal and emotionally connecting.`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 150,
      temperature: 0.8,
    });

    const prompt = completion.choices[0]?.message?.content;
    res.json({ success: true, prompt });
  } catch (error) {
    console.error('Error generating prompt:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      fallback: true 
    });
  }
});

// Generate deep question
app.post('/api/generate-question', aiLimiter, requireCoupleCode, async (req, res) => {
  try {
    const input = req.body?.context || req.body || {};
    const { nickname, partnerNickname, relationshipLength } = input;

    const systemPrompt = `You are a relationship therapist creating deep conversation starters for couples.
    Create questions that promote vulnerability, emotional intimacy, and meaningful dialogue.
    Questions should be thought-provoking but not overwhelming, encouraging both partners to share deeply.
    Keep questions to 1-2 sentences.`;

    const userPrompt = `Create a deep conversation question for a couple. ${nickname && partnerNickname ? `The partners are ${nickname} and ${partnerNickname}.` : ''} 
         ${relationshipLength ? `They've been together ${relationshipLength}.` : ''}
         Make it meaningful and relationship-building.`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 150,
      temperature: 0.8,
    });

    const question = completion.choices[0]?.message?.content;
    res.json({ success: true, question });
  } catch (error) {
    console.error('Error generating question:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      fallback: true 
    });
  }
});

// Generate Echo response
app.post('/api/echo-chat', aiLimiter, requireCoupleCode, async (req, res) => {
  try {
    const { message, userMessage, context, conversationHistory } = req.body;
    const promptMessage = message || userMessage;

    const systemPrompt = `You are Echo, an AI companion for couples. You are warm, empathetic, and wise about relationships.
    You remember their conversations, daily writings, and shared moments. You help them reflect on their love story,
    provide gentle guidance, and offer emotional support. You speak with love and understanding, using emojis naturally.
    
    Context about this couple:
    - User: ${context.nickname || 'User'}
    - Partner: ${context.partnerNickname || 'Partner'}
    ${context.recentMessages?.length ? `- Recent messages: ${context.recentMessages.slice(-3).join(', ')}` : ''}
    ${context.recentParagraphs?.length ? `- Recent writings: ${context.recentParagraphs.slice(-2).join(', ')}` : ''}
    ${context.mood ? `- Current mood: ${context.mood}` : ''}
    
    Respond as their caring AI companion who knows their relationship intimately.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(conversationHistory || []),
      { role: "user", content: promptMessage }
    ];

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: messages.slice(-10),
      max_tokens: 200,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content;
    res.json({ success: true, response });
  } catch (error) {
    console.error('Error generating Echo response:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      fallback: true 
    });
  }
});

// Generate conflict prompt
app.post('/api/generate-conflict-prompt', aiLimiter, requireCoupleCode, async (req, res) => {
  try {
    const { situation } = req.body;

    const systemPrompt = `You are a relationship counselor helping couples work through conflicts.
    Create gentle, non-judgmental prompts that help people express their feelings constructively.
    Focus on "I" statements, emotional awareness, and understanding rather than blame.`;

    const userPrompt = situation 
      ? `Create a helpful prompt for someone dealing with: ${situation}`
      : 'Create a gentle prompt to help someone express their feelings during a relationship conflict.';

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 100,
      temperature: 0.7,
    });

    const prompt = completion.choices[0]?.message?.content;
    res.json({ success: true, prompt });
  } catch (error) {
    console.error('Error generating conflict prompt:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      fallback: true 
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Access at: ${PUBLIC_BASE_URL || `http://localhost:${PORT}`}`);
});
