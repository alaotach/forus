const jwt = require('jsonwebtoken');

const MEDIA_AUTH_TOKEN_TTL_SECONDS = Number.parseInt(process.env.MEDIA_AUTH_TOKEN_TTL_SECONDS || '3600', 10);

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

module.exports = {
  createMediaAccessToken,
  verifyMediaAccessToken,
  MEDIA_AUTH_TOKEN_TTL_SECONDS,
};
