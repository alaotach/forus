const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  postMediaAuthToken,
  postGenerateUploadUrl,
  getMediaById,
  deleteMediaById,
  mediaErrorHandler,
} = require('../controllers/mediaController');
const { requireMediaAuth } = require('../middleware/requireMediaAuth');

const router = express.Router();

const mediaAccessLimiter = rateLimit({
  windowMs: Number.parseInt(process.env.MEDIA_RATE_LIMIT_WINDOW_MS || `${5 * 60 * 1000}`, 10),
  max: Number.parseInt(process.env.MEDIA_RATE_LIMIT_MAX || '180', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many media requests. Please retry shortly.' },
});

router.post('/media/auth/token', mediaAccessLimiter, postMediaAuthToken);
router.post('/generate-upload-url', mediaAccessLimiter, requireMediaAuth, postGenerateUploadUrl);
router.get('/media/:id', mediaAccessLimiter, requireMediaAuth, getMediaById);
router.delete('/media/:id', mediaAccessLimiter, requireMediaAuth, deleteMediaById);

router.use(mediaErrorHandler);

module.exports = router;
