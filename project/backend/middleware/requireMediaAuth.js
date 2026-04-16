const { verifyMediaAccessToken } = require('../services/mediaAuthService');

function requireMediaAuth(req, res, next) {
  try {
    const authHeader = req.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({
        success: false,
        error: 'Missing Bearer token',
      });
    }

    const token = match[1].trim();
    req.mediaAuth = verifyMediaAccessToken(token);
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired media token',
    });
  }
}

module.exports = {
  requireMediaAuth,
};
