const {
  generateUploadUrl,
  MAX_FILE_SIZE_BYTES,
  deleteMediaObject,
  checkObjectExists,
} = require('../services/s3Service');
const {
  createMediaMetadata,
  getMediaMetadataById,
  deleteMediaMetadataById,
} = require('../services/mediaMetadataService');
const { generateDownloadUrl } = require('../services/s3Service');
const {
  createMediaAccessToken,
  createMediaUploadTicket,
  verifyMediaUploadTicket,
} = require('../services/mediaAuthService');
const {
  trackMediaFailureMetric,
  getMediaFailureMetrics,
} = require('../services/mediaMetricsService');

function parseClientErrorStatus(errorMessage) {
  const msg = String(errorMessage || '');
  if (
    msg.includes('Invalid media type') ||
    msg.includes('Unsupported mimeType') ||
    msg.includes('coupleCode is required') ||
    msg.includes('fileSize') ||
    msg.includes('userId is required')
  ) {
    return 400;
  }
  if (msg.includes('max size')) {
    return 413;
  }
  return 500;
}

function getProxyUrl(req, mediaId) {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${publicBaseUrl}/media/${encodeURIComponent(mediaId)}?raw=1`;
}

function isAuthorizedForMedia(identity, metadata) {
  if (!identity || !metadata) return false;
  if (metadata.ownerId === identity.userId) return true;
  return Boolean(metadata.coupleCode && metadata.coupleCode === identity.coupleCode);
}

async function postMediaAuthToken(req, res, next) {
  try {
    const { userId, coupleCode } = req.body || {};
    const { token, expiresIn } = createMediaAccessToken({ userId, coupleCode });

    return res.status(200).json({
      success: true,
      token,
      expiresIn,
    });
  } catch (error) {
    const status = parseClientErrorStatus(error.message);
    if (status !== 500) {
      return res.status(status).json({ success: false, error: error.message });
    }
    return next(error);
  }
}

async function postGenerateUploadUrl(req, res, next) {
  try {
    const { type, userId, coupleCode, mimeType, fileSize, fileExtension } = req.body || {};
    const identity = req.mediaAuth;

    if (!identity) {
      return res.status(401).json({ success: false, error: 'Missing media auth context' });
    }

    if (identity.userId !== userId || identity.coupleCode !== coupleCode) {
      return res.status(403).json({ success: false, error: 'Auth context does not match upload request' });
    }

    const uploadData = await generateUploadUrl({
      type,
      userId,
      mimeType,
      fileSize,
      fileExtension,
    });

    const uploadTicket = createMediaUploadTicket({
      userId,
      coupleCode,
      fileKey: uploadData.fileKey,
      type,
    });

    return res.status(201).json({
      success: true,
      mediaDraft: {
        fileKey: uploadData.fileKey,
        type,
        ownerId: userId,
      },
      upload: {
        method: 'PUT',
        url: uploadData.uploadUrl,
        expiresIn: uploadData.expiresIn,
        maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
        requiredHeaders: {
          'Content-Type': mimeType,
        },
      },
      finalize: {
        uploadTicket: uploadTicket.token,
        expiresIn: uploadTicket.expiresIn,
      },
    });
  } catch (error) {
    const status = parseClientErrorStatus(error.message);
    if (status !== 500) {
      return res.status(status).json({
        success: false,
        error: error.message,
      });
    }
    return next(error);
  }
}

async function postCompleteUpload(req, res, next) {
  try {
    const identity = req.mediaAuth;
    const { uploadTicket } = req.body || {};

    if (!identity) {
      return res.status(401).json({ success: false, error: 'Missing media auth context' });
    }

    const ticket = verifyMediaUploadTicket(uploadTicket);
    if (ticket.userId !== identity.userId || ticket.coupleCode !== identity.coupleCode) {
      return res.status(403).json({ success: false, error: 'Upload ticket does not match auth context' });
    }

    const exists = await checkObjectExists(ticket.fileKey);
    if (!exists) {
      return res.status(409).json({ success: false, error: 'Uploaded object not found in S3' });
    }

    const metadata = await createMediaMetadata({
      fileKey: ticket.fileKey,
      type: ticket.type,
      ownerId: ticket.userId,
      coupleCode: ticket.coupleCode,
      createdAt: new Date().toISOString(),
    });

    return res.status(201).json({
      success: true,
      media: {
        id: metadata.id,
        fileKey: metadata.fileKey,
        type: metadata.type,
        ownerId: metadata.ownerId,
        createdAt: metadata.createdAt,
        proxyUrl: getProxyUrl(req, metadata.id),
      },
    });
  } catch (error) {
    const status = parseClientErrorStatus(error.message);
    if (status !== 500) {
      return res.status(status).json({ success: false, error: error.message });
    }
    return next(error);
  }
}

async function getMediaById(req, res, next) {
  try {
    const { id } = req.params;
    const identity = req.mediaAuth;
    const metadata = await getMediaMetadataById(id);

    if (!metadata) {
      return res.status(404).json({
        success: false,
        error: 'Media not found',
      });
    }

    if (!isAuthorizedForMedia(identity, metadata)) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized media access',
      });
    }

    const { signedUrl, expiresIn } = await generateDownloadUrl(metadata.fileKey);

    const shouldRedirect = req.query.raw === '1';
    if (shouldRedirect) {
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, signedUrl);
    }

    return res.status(200).json({
      success: true,
      media: {
        id,
        fileKey: metadata.fileKey,
        type: metadata.type,
        ownerId: metadata.ownerId,
        createdAt: metadata.createdAt,
        proxyUrl: getProxyUrl(req, id),
      },
      access: {
        url: signedUrl,
        expiresIn,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteMediaById(req, res, next) {
  try {
    const { id } = req.params;
    const identity = req.mediaAuth;
    const metadata = await getMediaMetadataById(id);

    if (!metadata) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }

    if (!isAuthorizedForMedia(identity, metadata)) {
      return res.status(403).json({ success: false, error: 'Unauthorized media delete' });
    }

    await deleteMediaObject(metadata.fileKey);
    await deleteMediaMetadataById(id);

    return res.status(200).json({ success: true, deleted: true });
  } catch (error) {
    return next(error);
  }
}

async function postMediaFailureMetric(req, res, next) {
  try {
    const { stage, statusCode, errorCode, message } = req.body || {};
    const metricEvent = trackMediaFailureMetric({
      stage,
      statusCode: Number.isInteger(statusCode) ? statusCode : undefined,
      errorCode,
      message,
    });

    console.warn(
      `[media-metric] failure stage=${metricEvent.stage} status=${metricEvent.statusCode || '-'} code=${metricEvent.errorCode || '-'} msg=${metricEvent.message || '-'} user=${req.mediaAuth?.userId || '-'} couple=${req.mediaAuth?.coupleCode || '-'}`
    );

    return res.status(202).json({ success: true });
  } catch (error) {
    return next(error);
  }
}

async function getMediaFailureMetricsSnapshot(req, res, next) {
  try {
    const snapshot = getMediaFailureMetrics();
    return res.status(200).json({ success: true, metrics: snapshot });
  } catch (error) {
    return next(error);
  }
}

function mediaErrorHandler(error, req, res, next) {
  console.error('Media API error:', error);
  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    success: false,
    error: 'Internal media service error',
  });
}

module.exports = {
  postMediaAuthToken,
  postGenerateUploadUrl,
  postCompleteUpload,
  getMediaById,
  deleteMediaById,
  postMediaFailureMetric,
  getMediaFailureMetricsSnapshot,
  mediaErrorHandler,
};
