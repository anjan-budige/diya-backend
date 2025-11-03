import express from 'express';

const router = express.Router();

// Simple in-memory app metadata. In production, move to DB or env vars.
const APP_META = {
  version: process.env.APP_LATEST_VERSION || '1.0.1',
  features: (
    process.env.APP_LATEST_FEATURES ||
    'Improved stability,New dark theme,Better offline playback'
  )
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  downloadUrl:
    process.env.APP_DOWNLOAD_URL ||
    'https://example.com/diya/latest.apk'
};

// Get latest app version and features
router.get('/version', (req, res) => {
  res.json({
    success: true,
    version: APP_META.version,
    features: APP_META.features,
    downloadUrl: APP_META.downloadUrl
  });
});

export default router;

