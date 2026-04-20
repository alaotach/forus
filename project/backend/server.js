const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');
const mediaRoutes = require('./routes/mediaRoutes');
const { listAllMediaMetadata, listMediaMetadataByOwner, deleteMediaMetadataById } = require('./services/mediaMetadataService');
const { deleteMediaObject } = require('./services/s3Service');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
const PUBLIC_DIR = path.join(__dirname, 'public');
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || `${15 * 60 * 1000}`, 10);
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '120', 10);
const AI_RATE_LIMIT_MAX = parseInt(process.env.AI_RATE_LIMIT_MAX || '40', 10);
const SMTP_PROVIDER = String(process.env.SMTP_PROVIDER || 'google').trim().toLowerCase();
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || '';
const DELETION_CODE_TTL_MS = parseInt(process.env.DELETION_CODE_TTL_MS || `${10 * 60 * 1000}`, 10);
const DELETION_SESSION_TTL_MS = parseInt(process.env.DELETION_SESSION_TTL_MS || `${30 * 60 * 1000}`, 10);
const DELETION_MAX_ATTEMPTS = parseInt(process.env.DELETION_MAX_ATTEMPTS || '5', 10);
const DELETION_CODE_SECRET = process.env.DELETION_CODE_SECRET || crypto.randomBytes(32).toString('hex');
const ACCOUNT_DELETION_FROM_EMAIL = process.env.ACCOUNT_DELETION_FROM_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || '';

const deletionSessions = new Map();
let smtpTransporter = null;

function resolveFirebaseProjectId() {
  const envCandidates = [
    process.env.FIREBASE_PROJECT_ID,
    process.env.GOOGLE_CLOUD_PROJECT,
    process.env.GCLOUD_PROJECT,
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  ].filter(Boolean);

  if (envCandidates.length > 0) {
    return String(envCandidates[0]).trim();
  }

  return undefined;
}

function getFirebaseAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const projectId = resolveFirebaseProjectId();
  const initOptions = {
    credential: admin.credential.applicationDefault(),
  };

  if (projectId) {
    initOptions.projectId = projectId;
  }

  return admin.initializeApp(initOptions);
}

function getSmtpTransporter() {
  if (smtpTransporter) {
    return smtpTransporter;
  }

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || (SMTP_PROVIDER === 'google' || SMTP_PROVIDER === 'gmail' ? '465' : '587'), 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass || !ACCOUNT_DELETION_FROM_EMAIL) {
    return null;
  }

  if ((SMTP_PROVIDER === 'google' || SMTP_PROVIDER === 'gmail') && !host) {
    smtpTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    return smtpTransporter;
  }

  smtpTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return smtpTransporter;
}

function createOtpCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashOtpCode(sessionId, code) {
  return crypto
    .createHash('sha256')
    .update(`${sessionId}:${code}:${DELETION_CODE_SECRET}`)
    .digest('hex');
}

function maskEmail(email) {
  const [localPart, domainPart] = String(email || '').split('@');
  if (!localPart || !domainPart) {
    return 'your email';
  }

  const maskedLocal = `${localPart[0]}${'*'.repeat(Math.max(localPart.length - 2, 1))}${localPart[localPart.length - 1] || ''}`;
  const domainTokens = domainPart.split('.');
  const domainName = domainTokens[0] || '';
  const domainTld = domainTokens.slice(1).join('.') || '***';
  const maskedDomain = `${domainName[0] || '*'}***.${domainTld}`;

  return `${maskedLocal}@${maskedDomain}`;
}

function cleanupExpiredDeletionSessions() {
  const now = Date.now();

  for (const [sessionId, session] of deletionSessions.entries()) {
    if (session.sessionExpiresAt <= now || session.codeExpiresAt <= now) {
      deletionSessions.delete(sessionId);
    }
  }
}

async function sendDeletionOtpEmail(email, code) {
  const transporter = getSmtpTransporter();

  if (!transporter) {
    throw new Error('Deletion email service is not configured on the server.');
  }

  await transporter.sendMail({
    from: ACCOUNT_DELETION_FROM_EMAIL,
    to: email,
    subject: 'For Us account deletion verification code',
    text: [
      'You requested account deletion for your For Us account.',
      '',
      `Your verification code is: ${code}`,
      '',
      `This code expires in ${Math.round(DELETION_CODE_TTL_MS / 60000)} minutes.`,
      'If you did not request this, please ignore this email.',
    ].join('\n'),
  });
}

async function verifyFirebasePassword(email, password) {
  if (!FIREBASE_WEB_API_KEY) {
    throw new Error('FIREBASE_WEB_API_KEY is not configured on the server.');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return null;
  }

  return payload;
}

async function verifyFirebaseAuthHeader(req) {
  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) {
    const error = new Error('Missing bearer token.');
    error.statusCode = 401;
    throw error;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    const error = new Error('Missing bearer token.');
    error.statusCode = 401;
    throw error;
  }

  const decoded = await getFirebaseAdminApp().auth().verifyIdToken(idToken);
  return decoded;
}

async function deleteDocsByQuery(db, queryRef) {
  const snapshot = await queryRef.get();
  if (snapshot.empty) {
    return 0;
  }

  const docs = snapshot.docs;
  const chunkSize = 200;
  let deleted = 0;

  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + chunkSize);
    for (const docSnap of chunk) {
      batch.delete(docSnap.ref);
    }
    await batch.commit();
    deleted += chunk.length;
  }

  return deleted;
}

async function deleteDocumentRecursively(docRef) {
  const childCollections = await docRef.listCollections();
  for (const childCollection of childCollections) {
    const childSnapshot = await childCollection.get();
    for (const childDoc of childSnapshot.docs) {
      await deleteDocumentRecursively(childDoc.ref);
    }
  }

  await docRef.delete();
}

async function deleteUserMediaAssets(uid) {
  let ownedMedia = [];
  const allowScanFallback = String(process.env.MEDIA_OWNER_QUERY_SCAN_FALLBACK || '')
    .trim()
    .toLowerCase() === 'true';

  try {
    ownedMedia = await listMediaMetadataByOwner(uid);
  } catch (queryError) {
    const message = String(queryError?.message || queryError || 'Unknown metadata query error');
    const isIndexConfigIssue = message.includes('AWS_MEDIA_OWNER_INDEX is required');

    if (allowScanFallback && isIndexConfigIssue) {
      // Optional fallback for temporary migrations only.
      const allMetadata = await listAllMediaMetadata();
      ownedMedia = allMetadata.filter((item) => item && item.ownerId === uid);
      console.warn('Falling back to metadata scan for user media deletion:', message);
    } else {
      throw new Error(
        `Failed to query media metadata by owner. Ensure AWS_MEDIA_OWNER_INDEX is correct, the index exists, and IAM allows dynamodb:Query on table indexes. Root cause: ${message}`
      );
    }
  }

  if (ownedMedia.length === 0) {
    return { deleted: 0, failed: 0 };
  }

  const results = await Promise.allSettled(
    ownedMedia.map(async (media) => {
      await deleteMediaObject(media.fileKey);
      await deleteMediaMetadataById(media.id);
    })
  );

  const failed = results.filter((result) => result.status === 'rejected').length;
  const deleted = results.length - failed;

  if (failed > 0) {
    throw new Error(`Failed to delete ${failed} media item(s) for user ${uid}`);
  }

  return { deleted, failed };
}

async function deleteUserAccountAndData(uid) {
  const firebaseAdminApp = getFirebaseAdminApp();
  const db = firebaseAdminApp.firestore();
  const auth = firebaseAdminApp.auth();

  const userDocRef = db.collection('users').doc(uid);
  const userDoc = await userDocRef.get();
  const profile = userDoc.exists ? userDoc.data() : {};
  const coupleCode = typeof profile?.coupleCode === 'string' ? profile.coupleCode : '';
  const nickname = typeof profile?.nickname === 'string' ? profile.nickname : '';
  const partnerUid = typeof profile?.partnerUid === 'string' ? profile.partnerUid : '';

  if (coupleCode) {
    const coupleRegistryRef = db.collection('coupleRegistry').doc(coupleCode);
    const coupleRegistryDoc = await coupleRegistryRef.get();
    if (coupleRegistryDoc.exists) {
      const data = coupleRegistryDoc.data() || {};
      if (data.createdByUid === uid || data.partnerUid === uid) {
        await coupleRegistryRef.delete();
      }
    }

    const coupleDocRef = db.collection('couples').doc(coupleCode);
    const coupleUpdates = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (nickname) {
      coupleUpdates[`users.${nickname}`] = admin.firestore.FieldValue.delete();
    }

    if (Object.keys(coupleUpdates).length > 0) {
      await coupleDocRef.set(coupleUpdates, { merge: true });
    }

    // Remove user-authored/shared records that include coupleCode+nickname markers.
    if (nickname) {
      await Promise.allSettled([
        deleteDocsByQuery(
          db,
          db.collection('vault').doc(coupleCode).collection('items').where('author', '==', nickname)
        ),
        deleteDocsByQuery(
          db,
          db.collection('couples').doc(coupleCode).collection('chat').where('sender', '==', nickname)
        ),
        deleteDocsByQuery(
          db,
          db.collection('couples').doc(coupleCode).collection('echoChats').where('ownerNickname', '==', nickname)
        ),
        deleteDocsByQuery(
          db,
          db.collection('conflicts').doc(coupleCode).collection('entries').where('nickname', '==', nickname)
        ),
        deleteDocsByQuery(
          db,
          db.collection('dailyParagraphs').where('coupleCode', '==', coupleCode).where('nickname', '==', nickname)
        ),
        deleteDocsByQuery(
          db,
          db.collection('sharedDiary').where('coupleCode', '==', coupleCode).where('author', '==', nickname)
        ),
      ]);
    }
  }

  if (partnerUid) {
    const partnerRef = db.collection('users').doc(partnerUid);
    await partnerRef.set(
      {
        partnerUid: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await deleteUserMediaAssets(uid);

  if (userDoc.exists) {
    await deleteDocumentRecursively(userDocRef);
  }

  await auth.deleteUser(uid);
}

setInterval(cleanupExpiredDeletionSessions, 60 * 1000).unref();

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

// Public policy and deletion pages (for Google Play and user access requests).
app.get('/delete-data', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'delete-data.html'));
});

app.get('/account-deletion', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'account-deletion.html'));
});

app.post('/api/account-deletion/start', async (req, res) => {
  try {
    cleanupExpiredDeletionSessions();

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const firebaseSignIn = await verifyFirebasePassword(email, password);
    if (!firebaseSignIn || !firebaseSignIn.localId) {
      return res.status(401).json({ success: false, error: 'Could not verify account credentials.' });
    }

    const userRecord = await getFirebaseAdminApp().auth().getUser(firebaseSignIn.localId);
    if (!userRecord.email || userRecord.email.toLowerCase() !== email) {
      return res.status(401).json({ success: false, error: 'Could not verify account credentials.' });
    }

    if (userRecord.disabled) {
      return res.status(403).json({ success: false, error: 'This account is disabled. Contact support.' });
    }

    const sessionId = crypto.randomUUID();
    const code = createOtpCode();
    const now = Date.now();

    deletionSessions.set(sessionId, {
      uid: userRecord.uid,
      email,
      codeHash: hashOtpCode(sessionId, code),
      attempts: 0,
      codeExpiresAt: now + DELETION_CODE_TTL_MS,
      sessionExpiresAt: now + DELETION_SESSION_TTL_MS,
    });

    await sendDeletionOtpEmail(email, code);

    return res.json({
      success: true,
      sessionId,
      codeExpiresInSeconds: Math.floor(DELETION_CODE_TTL_MS / 1000),
      destination: maskEmail(email),
    });
  } catch (error) {
    console.error('Failed to start account deletion flow:', error);
    return res.status(500).json({ success: false, error: 'Unable to start account deletion right now.' });
  }
});

app.post('/api/account-deletion/confirm', async (req, res) => {
  try {
    cleanupExpiredDeletionSessions();

    const sessionId = String(req.body?.sessionId || '').trim();
    const code = String(req.body?.code || '').trim();

    if (!sessionId || !code) {
      return res.status(400).json({ success: false, error: 'Session id and verification code are required.' });
    }

    const session = deletionSessions.get(sessionId);
    if (!session) {
      return res.status(400).json({ success: false, error: 'Verification session expired. Start again.' });
    }

    const now = Date.now();
    if (session.codeExpiresAt <= now || session.sessionExpiresAt <= now) {
      deletionSessions.delete(sessionId);
      return res.status(400).json({ success: false, error: 'Verification session expired. Start again.' });
    }

    if (session.attempts >= DELETION_MAX_ATTEMPTS) {
      deletionSessions.delete(sessionId);
      return res.status(429).json({ success: false, error: 'Too many invalid code attempts. Start again.' });
    }

    const providedHash = hashOtpCode(sessionId, code);
    if (providedHash !== session.codeHash) {
      session.attempts += 1;
      deletionSessions.set(sessionId, session);
      return res.status(401).json({ success: false, error: 'Invalid verification code.' });
    }

    await deleteUserAccountAndData(session.uid);
    deletionSessions.delete(sessionId);

    return res.json({
      success: true,
      message: 'Your account and associated data have been deleted successfully.',
    });
  } catch (error) {
    console.error('Failed to confirm account deletion:', error);
    return res.status(500).json({ success: false, error: 'Unable to delete account right now.' });
  }
});

// Request log line for each inbound HTTP call (visible in systemd journal)
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const ip = req.headers['x-forwarded-for'] || req.ip || '-';
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms ip=${ip}`);
  });
  next();
});

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

app.post('/api/push/dispatch', async (req, res) => {
  try {
    const decoded = await verifyFirebaseAuthHeader(req);
    const senderUid = String(decoded?.uid || '').trim();
    const tokenProjectId = String(decoded?.aud || '').trim();
    if (!senderUid) {
      return res.status(401).json({ success: false, error: 'Invalid auth token.' });
    }

    const coupleCode = String(req.body?.coupleCode || '').trim();
    let recipientTokens = Array.isArray(req.body?.recipientTokens)
      ? req.body.recipientTokens.map((token) => String(token || '').trim()).filter(Boolean)
      : [];
    const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {};
    const notification = req.body?.notification && typeof req.body.notification === 'object'
      ? req.body.notification
      : null;
    const ttlSecondsRaw = Number(req.body?.android?.ttlSeconds);
    const ttlSeconds = Number.isFinite(ttlSecondsRaw)
      ? Math.max(0, Math.min(Math.floor(ttlSecondsRaw), 86400))
      : 0;

    if (!coupleCode) {
      return res.status(400).json({ success: false, error: 'coupleCode is required.' });
    }

    let tokenDiagnostics = null;

    if (recipientTokens.length === 0) {
      const coupleDoc = await getFirebaseAdminApp().firestore().collection('couples').doc(coupleCode).get();
      const coupleData = coupleDoc.exists ? (coupleDoc.data() || {}) : {};

      const readTokenMap = (root, nestedKey, dottedPrefix) => {
        const nestedRaw = root?.[nestedKey];
        const nested = nestedRaw && typeof nestedRaw === 'object' && !Array.isArray(nestedRaw)
          ? Object.entries(nestedRaw)
              .map(([key, value]) => [String(key), String(value || '').trim()])
              .filter(([, value]) => Boolean(value))
              .reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
              }, {})
          : {};

        const dotted = Object.entries(root || {})
          .filter(([key]) => String(key).startsWith(dottedPrefix))
          .map(([key, value]) => [String(key).slice(dottedPrefix.length), String(value || '').trim()])
          .filter(([suffix, value]) => Boolean(suffix) && Boolean(value))
          .reduce((acc, [suffix, value]) => {
            acc[suffix] = value;
            return acc;
          }, {});

        return {
          ...dotted,
          ...nested,
        };
      };

      const nativePushTokensByUid = readTokenMap(coupleData, 'nativePushTokensByUid', 'nativePushTokensByUid.');
      const pushTokensByUid = readTokenMap(coupleData, 'pushTokensByUid', 'pushTokensByUid.');
      const pushTokensByNickname = readTokenMap(coupleData, 'pushTokens', 'pushTokens.');
      const usersByNickname = coupleData.users || {};

      const senderNicknameFromData = String(data?.from || '').trim();
      let senderNickname = senderNicknameFromData;
      if (!senderNickname) {
        senderNickname = Object.entries(usersByNickname).find(([, user]) => {
          return String(user?.uid || '').trim() === senderUid;
        })?.[0] || '';
      }

      const nativeTokens = Object.entries(nativePushTokensByUid)
        .filter(([uid]) => String(uid) !== senderUid)
        .map(([, token]) => String(token || '').trim())
        .filter(Boolean);

      const uidTokens = Object.entries(pushTokensByUid)
        .filter(([uid]) => String(uid) !== senderUid)
        .map(([, token]) => String(token || '').trim())
        .filter(Boolean);

      const nicknameTokens = Object.entries(pushTokensByNickname)
        .filter(([nickname]) => !senderNickname || String(nickname) !== senderNickname)
        .map(([, token]) => String(token || '').trim())
        .filter(Boolean);

      recipientTokens = Array.from(new Set([...nativeTokens, ...uidTokens, ...nicknameTokens]));

      const adminProjectId = String(getFirebaseAdminApp().options?.projectId || '').trim();
      tokenDiagnostics = {
        coupleCode,
        coupleDocExists: coupleDoc.exists,
        senderUid,
        senderNickname: senderNickname || null,
        tokenProjectId: tokenProjectId || null,
        adminProjectId: adminProjectId || null,
        projectMatch: Boolean(tokenProjectId && adminProjectId && tokenProjectId === adminProjectId),
        coupleDocFieldKeys: Object.keys(coupleData),
        userNicknames: Object.keys(usersByNickname),
        nativeTokenOwnerCount: Object.keys(nativePushTokensByUid).length,
        uidTokenOwnerCount: Object.keys(pushTokensByUid).length,
        nicknameTokenOwnerCount: Object.keys(pushTokensByNickname).length,
      };
    }

    if (recipientTokens.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No recipient push tokens available. Partner may be web-only (no native/device token registered).',
        diagnostics: tokenDiagnostics,
      });
    }

    const safeData = Object.entries(data).reduce((acc, [key, value]) => {
      if (!key) return acc;
      acc[String(key)] = typeof value === 'string' ? value : JSON.stringify(value ?? '');
      return acc;
    }, {});

    const expoTokenPattern = /^ExponentPushToken\[/;
    const fcmTokens = recipientTokens
      .map((token) => String(token || '').trim())
      .filter(Boolean)
      .filter((token) => !expoTokenPattern.test(token));

    if (fcmTokens.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No recipient native FCM tokens available after filtering Expo tokens.',
      });
    }

    const messaging = getFirebaseAdminApp().messaging();
    const message = {
      tokens: fcmTokens,
      data: {
        ...safeData,
        coupleCode,
      },
      ...(notification?.title || notification?.body
        ? {
            notification: {
              ...(notification?.title ? { title: String(notification.title) } : {}),
              ...(notification?.body ? { body: String(notification.body) } : {}),
            },
          }
        : {}),
      android: {
        priority: 'high',
        ...(ttlSeconds > 0 ? { ttl: ttlSeconds * 1000 } : {}),
      },
    };

    const response = await messaging.sendEachForMulticast(message);

    const errors = response.responses
      .map((entry, index) => ({
        index,
        token: fcmTokens[index],
        success: entry.success,
        error: entry.error ? String(entry.error.message || entry.error) : null,
      }))
      .filter((entry) => !entry.success);

    console.log('push-dispatch', {
      senderUid,
      coupleCode,
      requested: recipientTokens.length,
      filteredFcmTokens: fcmTokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    return res.json({
      success: true,
      requestedCount: recipientTokens.length,
      filteredFcmTokens: fcmTokens.length,
      skippedExpoTokens: recipientTokens.length - fcmTokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      errors,
    });
  } catch (error) {
    console.error('Failed to dispatch push notification:', error);
    const statusCode = Number(error?.statusCode || 500);
    return res.status(statusCode).json({
      success: false,
      error: statusCode === 401
        ? 'Unauthorized push dispatch request.'
        : 'Unable to dispatch push notification right now.',
    });
  }
});

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

    const systemPrompt = `You are ${context.echoDisplayName || 'Echo'}, an AI companion for couples.
    Your style should feel warm, emotionally intelligent, and supportive.
    ${context.echoStyle ? `Preferred style: ${context.echoStyle}` : ''}
    ${context.echoFocus ? `Preferred focus: ${context.echoFocus}` : ''}
    ${context.echoBoundaries ? `Topics to avoid: ${context.echoBoundaries}` : ''}

    Important behavior rules:
    1) Use relationship memories as background context to understand tone and patterns.
    2) Do NOT explicitly quote, summarize, or reference specific private entries unless the user asks for memories/details.
    3) Keep explicit references very rare; at most occasional subtle mentions (roughly one in several replies), and only if they naturally help.
    4) Default to present-focused, gentle conversation.
    5) Keep replies concise (2-5 sentences), caring, and non-judgmental.

    Private couple context (background only):
    - User: ${context.nickname || 'User'}
    - Partner: ${context.partnerNickname || 'Partner'}
    ${context.recentMessages?.length ? `- Recent chat snippets: ${context.recentMessages.slice(0, 5).join(' || ')}` : ''}
    ${context.recentDailyWritingAnswers?.length ? `- Daily writing answers: ${context.recentDailyWritingAnswers.slice(0, 4).join(' || ')}` : ''}
    ${context.recentDeepTalkAnswers?.length ? `- Deep talk answers: ${context.recentDeepTalkAnswers.slice(0, 3).join(' || ')}` : ''}
    ${context.recentVaultLetters?.length ? `- Vault letters: ${context.recentVaultLetters.slice(0, 3).join(' || ')}` : ''}
    ${context.recentSharedDiaryTexts?.length ? `- Shared diary texts: ${context.recentSharedDiaryTexts.slice(0, 4).join(' || ')}` : ''}
    ${context.mood ? `- Current mood: ${context.mood}` : ''}

    Respond as a caring companion with quiet memory-informed understanding.`;

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
