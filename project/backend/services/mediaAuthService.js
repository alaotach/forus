const jwt = require('jsonwebtoken');

const MEDIA_AUTH_TOKEN_TTL_SECONDS = Number.parseInt(process.env.MEDIA_AUTH_TOKEN_TTL_SECONDS || '3600', 10);
const MEDIA_UPLOAD_TICKET_TTL_SECONDS = Number.parseInt(process.env.MEDIA_UPLOAD_TICKET_TTL_SECONDS || '900', 10);

function getJwtSecret() {
  const secret = process.env.MEDIA_AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error('MEDIA_AUTH_JWT_SECRET is required for media auth');
  }
  return secret;
}

function assertAuthIdentity({ userId, coupleCode }) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required');
  }
  if (!coupleCode || typeof coupleCode !== 'string') {
    throw new Error('coupleCode is required');
  }
}

function createMediaAccessToken(identity) {
  assertAuthIdentity(identity);

  const payload = {
    userId: identity.userId,
    coupleCode: identity.coupleCode,
    scope: 'media',
  };

  const token = jwt.sign(payload, getJwtSecret(), {
    expiresIn: MEDIA_AUTH_TOKEN_TTL_SECONDS,
    issuer: 'forus-backend',
    audience: 'forus-media',
  });

  return {
    token,
    expiresIn: MEDIA_AUTH_TOKEN_TTL_SECONDS,
  };
}

function verifyMediaAccessToken(token) {
  if (!token) {
    throw new Error('Missing media access token');
  }

  const payload = jwt.verify(token, getJwtSecret(), {
    issuer: 'forus-backend',
    audience: 'forus-media',
  });

  if (payload.scope !== 'media') {
    throw new Error('Invalid token scope');
  }

  assertAuthIdentity({
    userId: payload.userId,
    coupleCode: payload.coupleCode,
  });

  return {
    userId: payload.userId,
    coupleCode: payload.coupleCode,
  };
}

function createMediaUploadTicket(payload) {
  assertAuthIdentity({
    userId: payload.userId,
    coupleCode: payload.coupleCode,
  });

  if (!payload.fileKey || typeof payload.fileKey !== 'string') {
    throw new Error('fileKey is required');
  }
  if (!payload.type || typeof payload.type !== 'string') {
    throw new Error('type is required');
  }

  const ticketPayload = {
    userId: payload.userId,
    coupleCode: payload.coupleCode,
    fileKey: payload.fileKey,
    type: payload.type,
    scope: 'media-upload-complete',
  };

  const token = jwt.sign(ticketPayload, getJwtSecret(), {
    expiresIn: MEDIA_UPLOAD_TICKET_TTL_SECONDS,
    issuer: 'forus-backend',
    audience: 'forus-media',
  });

  return {
    token,
    expiresIn: MEDIA_UPLOAD_TICKET_TTL_SECONDS,
  };
}

function verifyMediaUploadTicket(token) {
  if (!token) {
    throw new Error('Missing media upload ticket');
  }

  const payload = jwt.verify(token, getJwtSecret(), {
    issuer: 'forus-backend',
    audience: 'forus-media',
  });

  if (payload.scope !== 'media-upload-complete') {
    throw new Error('Invalid upload ticket scope');
  }

  assertAuthIdentity({
    userId: payload.userId,
    coupleCode: payload.coupleCode,
  });

  if (!payload.fileKey || typeof payload.fileKey !== 'string') {
    throw new Error('Invalid upload ticket fileKey');
  }
  if (!payload.type || typeof payload.type !== 'string') {
    throw new Error('Invalid upload ticket type');
  }

  return {
    userId: payload.userId,
    coupleCode: payload.coupleCode,
    fileKey: payload.fileKey,
    type: payload.type,
  };
}

module.exports = {
  createMediaAccessToken,
  verifyMediaAccessToken,
  createMediaUploadTicket,
  verifyMediaUploadTicket,
  MEDIA_AUTH_TOKEN_TTL_SECONDS,
  MEDIA_UPLOAD_TICKET_TTL_SECONDS,
};
