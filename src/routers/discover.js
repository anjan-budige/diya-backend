import express from 'express';
import {
  getTrendingSongs,
  getTopPlaylists,
  getNewReleases,
  getTopArtists,
  getRecommendedMixes,
  searchAcrossSaavn,
  clearSaavnCache
} from '../services/saavnService.js';

const router = express.Router();

function parseLimit(value, fallback) {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

router.get('/summary', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 12);
    const trendingLimit = parseLimit(req.query.trendingLimit, 20);
    const language = req.query.language;

    const [trending, playlists, newReleases, artists] = await Promise.all([
      getTrendingSongs({ limit: trendingLimit, language }),
      getTopPlaylists({ limit }),
      getNewReleases({ limit }),
      getTopArtists({ limit })
    ]);

    res.json({
      trending: Array.isArray(trending) ? trending : [],
      playlists: Array.isArray(playlists) ? playlists : [],
      newReleases: Array.isArray(newReleases) ? newReleases : [],
      artists: Array.isArray(artists) ? artists : []
    });
  } catch (error) {
    console.error('Discover summary error:', error.message);
    res.status(502).json({ error: 'Failed to load discovery data' });
  }
});

router.get('/trending', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 20);
    const { language, query } = req.query;
    const songs = await getTrendingSongs({ limit, language, query });
    res.json({ songs: Array.isArray(songs) ? songs : [] });
  } catch (error) {
    console.error('Discover trending error:', error.message);
    res.status(502).json({ error: 'Failed to load trending songs' });
  }
});

router.get('/playlists', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 12);
    const { query } = req.query;
    const playlists = await getTopPlaylists({ limit, query });
    res.json({ playlists: Array.isArray(playlists) ? playlists : [] });
  } catch (error) {
    console.error('Discover playlists error:', error.message);
    res.status(502).json({ error: 'Failed to load playlists' });
  }
});

router.get('/new-releases', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 12);
    const { query } = req.query;
    const albums = await getNewReleases({ limit, query });
    res.json({ albums: Array.isArray(albums) ? albums : [] });
  } catch (error) {
    console.error('Discover new releases error:', error.message);
    res.status(502).json({ error: 'Failed to load new releases' });
  }
});

router.get('/artists', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 12);
    const { query } = req.query;
    const artists = await getTopArtists({ limit, query });
    res.json({ artists: Array.isArray(artists) ? artists : [] });
  } catch (error) {
    console.error('Discover artists error:', error.message);
    res.status(502).json({ error: 'Failed to load artists' });
  }
});

router.get('/mixes', async (req, res) => {
  try {
    const { seedArtist } = req.query;
    const mixes = await getRecommendedMixes({ seedArtist });
    res.json({ mixes: Array.isArray(mixes) ? mixes : [] });
  } catch (error) {
    console.error('Discover mixes error:', error.message);
    res.status(502).json({ error: 'Failed to load recommended mixes' });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { query, page } = req.query;
    const searchResult = await searchAcrossSaavn({ query, page: parseLimit(page, 1) });
    res.json(searchResult || { albums: [], songs: [], playlists: [], artists: [] });
  } catch (error) {
    console.error('Discover search error:', error.message);
    res.status(502).json({ error: 'Failed to search on Saavn' });
  }
});

router.post('/cache/clear', async (_req, res) => {
  clearSaavnCache();
  res.json({ message: 'Saavn cache cleared' });
});

export default router;
