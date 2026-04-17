const { randomUUID } = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl: getS3SignedUrl } = require('@aws-sdk/s3-request-presigner');
const { getSignedUrl: getCloudFrontSignedUrl } = require('@aws-sdk/cloudfront-signer');

const s3Region = process.env.AWS_REGION;
const bucketName = process.env.AWS_S3_BUCKET;

const s3Client = new S3Client({ region: s3Region });

const ALLOWED_TYPES = new Set(['image', 'audio']);
const ALLOWED_MIME_TYPES = {
  image: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  audio: new Set(['audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/x-wav', 'audio/aac']),
};

const MAX_FILE_SIZE_BYTES = Number.parseInt(process.env.S3_MAX_UPLOAD_BYTES || `${20 * 1024 * 1024}`, 10);
const UPLOAD_URL_TTL_SECONDS = Number.parseInt(process.env.S3_UPLOAD_URL_TTL_SECONDS || '300', 10);
const DOWNLOAD_URL_TTL_SECONDS = Number.parseInt(process.env.S3_DOWNLOAD_URL_TTL_SECONDS || '120', 10);

const CLOUDFRONT_DOMAIN = String(process.env.CLOUDFRONT_DOMAIN || '')
  .trim()
  .replace(/^https?:\/\//i, '')
  .replace(/\/+$/, '');
const CLOUDFRONT_KEY_PAIR_ID = String(process.env.CLOUDFRONT_KEY_PAIR_ID || '').trim();
const CLOUDFRONT_PRIVATE_KEY = process.env.CLOUDFRONT_PRIVATE_KEY || '';
const CLOUDFRONT_PRIVATE_KEY_BASE64 = process.env.CLOUDFRONT_PRIVATE_KEY_BASE64 || '';

function assertAwsConfigured() {
  if (!s3Region) {
    throw new Error('AWS_REGION is required for S3 media service');
  }

  if (!bucketName) {
    throw new Error('AWS_S3_BUCKET is required for S3 media service');
  }
}

function sanitizePathPart(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'unknown';
}

function getCloudFrontPrivateKey() {
  if (CLOUDFRONT_PRIVATE_KEY) {
    return CLOUDFRONT_PRIVATE_KEY.replace(/\\n/g, '\n');
  }

  if (CLOUDFRONT_PRIVATE_KEY_BASE64) {
    try {
      return Buffer.from(CLOUDFRONT_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }

  return '';
}

function canUseCloudFrontSigning() {
  const privateKey = getCloudFrontPrivateKey();
  return Boolean(CLOUDFRONT_DOMAIN && CLOUDFRONT_KEY_PAIR_ID && privateKey);
}

function buildCloudFrontObjectUrl(fileKey) {
  const encodedKey = String(fileKey || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `https://${CLOUDFRONT_DOMAIN}/${encodedKey}`;
}

function normalizeExtension(fileExtension, mimeType) {
  if (fileExtension) {
    return String(fileExtension).replace(/^\./, '').toLowerCase();
  }

  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/aac': 'aac',
  };

  return map[mimeType] || 'bin';
}

function validateUploadRequest({ type, userId, mimeType, fileSize }) {
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error('Invalid media type. Allowed: image, audio');
  }

  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required');
  }

  if (!mimeType || typeof mimeType !== 'string') {
    throw new Error('mimeType is required');
  }

  const allowedMimeTypes = ALLOWED_MIME_TYPES[type];
  if (!allowedMimeTypes.has(mimeType)) {
    throw new Error(`Unsupported mimeType for ${type}: ${mimeType}`);
  }

  const numericSize = Number(fileSize);
  if (!Number.isFinite(numericSize) || numericSize <= 0) {
    throw new Error('fileSize must be a positive number');
  }

  if (numericSize > MAX_FILE_SIZE_BYTES) {
    throw new Error(`file exceeds max size of ${MAX_FILE_SIZE_BYTES} bytes`);
  }
}

function buildFileKey({ type, userId, fileExtension, mimeType }) {
  const safeType = sanitizePathPart(type);
  const safeUserId = sanitizePathPart(userId);
  const timestamp = Date.now();
  const extension = normalizeExtension(fileExtension, mimeType);
  const objectName = `${randomUUID()}_${timestamp}.${extension}`;
  return `uploads/${safeType}/${safeUserId}/${objectName}`;
}

async function generateUploadUrl({ type, userId, mimeType, fileSize, fileExtension }) {
  assertAwsConfigured();
  validateUploadRequest({ type, userId, mimeType, fileSize });

  const fileKey = buildFileKey({ type, userId, fileExtension, mimeType });

  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileKey,
    ContentType: mimeType,
    ContentLength: Number(fileSize),
    Metadata: {
      mediaType: type,
      userId: sanitizePathPart(userId),
    },
  });

  const uploadUrl = await getS3SignedUrl(s3Client, putCommand, {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
  });

  return {
    fileKey,
    uploadUrl,
    expiresIn: UPLOAD_URL_TTL_SECONDS,
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  };
}

async function generateDownloadUrl(fileKey) {
  assertAwsConfigured();
  if (!fileKey) {
    throw new Error('fileKey is required');
  }

  if (canUseCloudFrontSigning()) {
    const privateKey = getCloudFrontPrivateKey();
    const cloudFrontUrl = buildCloudFrontObjectUrl(fileKey);
    const expiresAt = new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000).toISOString();

    const signedUrl = getCloudFrontSignedUrl({
      url: cloudFrontUrl,
      dateLessThan: expiresAt,
      keyPairId: CLOUDFRONT_KEY_PAIR_ID,
      privateKey,
    });

    return {
      signedUrl,
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
      delivery: 'cloudfront',
    };
  }

  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: fileKey,
  });

  const signedUrl = await getS3SignedUrl(s3Client, getCommand, {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });

  return {
    signedUrl,
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    delivery: 's3',
  };
}

async function deleteMediaObject(fileKey) {
  assertAwsConfigured();
  if (!fileKey) {
    throw new Error('fileKey is required');
  }

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    })
  );
}

async function checkObjectExists(fileKey) {
  assertAwsConfigured();
  if (!fileKey) {
    throw new Error('fileKey is required');
  }

  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
      })
    );
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

async function listMediaObjects(prefix = 'uploads/') {
  assertAwsConfigured();

  const items = [];
  let continuationToken;

  do {
    const output = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of output.Contents || []) {
      if (obj.Key) {
        items.push({
          key: obj.Key,
          lastModified: obj.LastModified ? new Date(obj.LastModified).toISOString() : null,
          size: obj.Size || 0,
        });
      }
    }

    continuationToken = output.IsTruncated ? output.NextContinuationToken : undefined;
  } while (continuationToken);

  return items;
}

module.exports = {
  generateUploadUrl,
  generateDownloadUrl,
  deleteMediaObject,
  checkObjectExists,
  listMediaObjects,
  validateUploadRequest,
  MAX_FILE_SIZE_BYTES,
};
