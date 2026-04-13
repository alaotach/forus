const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MEDIA_ROOT = process.env.MEDIA_ROOT || (process.env.NODE_ENV === 'production' ? '/data/forus-media' : path.join(__dirname, 'uploads'));
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
const UPLOAD_API_TOKEN = process.env.UPLOAD_API_TOKEN || '';
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || `${15 * 60 * 1000}`, 10);
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '120', 10);
const AI_RATE_LIMIT_MAX = parseInt(process.env.AI_RATE_LIMIT_MAX || '40', 10);
const UPLOAD_RATE_LIMIT_MAX = parseInt(process.env.UPLOAD_RATE_LIMIT_MAX || '30', 10);
const MAX_UPLOAD_SIZE_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '15', 10);
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);

if (isProduction) {
  const requiredEnvVars = ['HACKCLUB_API_KEY', 'PUBLIC_BASE_URL', 'UPLOAD_API_TOKEN'];
  const missingEnvVars = requiredEnvVars.filter((name) => !process.env[name]);
  if (missingEnvVars.length > 0) {
    console.error(`Missing required environment variables in production: ${missingEnvVars.join(', ')}`);
    process.exit(1);
  }
}

app.set('trust proxy', true);

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

const uploadLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: UPLOAD_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many upload attempts. Please try again later.' },
});

app.use('/api', apiLimiter);

if (!fs.existsSync(MEDIA_ROOT)) {
  fs.mkdirSync(MEDIA_ROOT, { recursive: true });
}

for (const dir of ['images', 'audio', 'photos']) {
  const fullPath = path.join(MEDIA_ROOT, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
}

app.use('/media', express.static(MEDIA_ROOT));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = typeof req.body.folder === 'string' ? req.body.folder : 'uploads';
    const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '');
    const targetDir = path.join(MEDIA_ROOT, safeFolder || 'uploads');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`Unsupported media type: ${file.mimetype}`));
    }

    cb(null, true);
  },
});

function requireUploadToken(req, res, next) {
  // In development, allow local testing when token is not configured.
  if (!UPLOAD_API_TOKEN && !isProduction) {
    return next();
  }

  const token = req.get('x-upload-token');
  if (!token || token !== UPLOAD_API_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized upload request' });
  }

  next();
}

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
    uploadAuthEnabled: Boolean(UPLOAD_API_TOKEN),
    aiConfigured: Boolean(process.env.HACKCLUB_API_KEY),
    mediaRoot: MEDIA_ROOT,
    maxUploadSizeMB: MAX_UPLOAD_SIZE_MB,
    rateLimit: {
      windowMs: RATE_LIMIT_WINDOW_MS,
      apiMax: RATE_LIMIT_MAX_REQUESTS,
      aiMax: AI_RATE_LIMIT_MAX,
      uploadMax: UPLOAD_RATE_LIMIT_MAX,
    },
  });
});

app.post('/api/upload', uploadLimiter, requireUploadToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const relativePath = path.relative(MEDIA_ROOT, req.file.path).replace(/\\/g, '/');
    const requestBaseUrl = `${req.protocol}://${req.get('host')}`;
    const baseUrl = PUBLIC_BASE_URL || requestBaseUrl;
    const secureUrl = `${baseUrl}/media/${relativePath}`;

    res.json({
      success: true,
      secure_url: secureUrl,
      url: secureUrl,
      fileName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, error: `File too large. Max ${MAX_UPLOAD_SIZE_MB}MB allowed.` });
    }
    return res.status(400).json({ success: false, error: err.message });
  }

  if (err && err.message && err.message.startsWith('Unsupported media type:')) {
    return res.status(415).json({ success: false, error: err.message });
  }

  return next(err);
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
  console.log(`Media root: ${MEDIA_ROOT}`);
  console.log(`Upload auth enabled: ${Boolean(UPLOAD_API_TOKEN)}`);
});
