import axios from 'axios';

const DEFAULT_CACHE_TTL = parseInt(process.env.SAAVN_CACHE_TTL || '300000', 10); // 5 minutes
const MAX_CACHE_SIZE = parseInt(process.env.SAAVN_CACHE_MAX_ENTRIES || '200', 10);
const BASE_URL = process.env.JIOSAAVN_API_URL || 'https://jiosaavn-api-sigma-rouge.vercel.app';

const cache = new Map();

const saavnClient = axios.create({
  baseURL: BASE_URL,
  timeout: parseInt(process.env.SAAVN_TIMEOUT || '12000', 10),
});

function buildUrl(path = '') {
  if (!path.startsWith('/')) {
    return `/api/${path}`;
  }
  if (!path.startsWith('/api/')) {
    return `/api${path}`;
  }
  return path;
}

function buildCacheKey(path, params = {}) {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys
    .map((key) => `${key}=${encodeURIComponent(params[key] ?? '')}`)
    .join('&');
  return `${path}?${paramString}`;
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  const isExpired = Date.now() - entry.timestamp > entry.ttl;
  if (isExpired) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttl = DEFAULT_CACHE_TTL) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const keys = Array.from(cache.keys());
    cache.delete(keys[0]);
  }
  cache.set(key, {
    data,
    ttl,
    timestamp: Date.now(),
  });
}

async function fetchFromSaavn(path, params = {}, { ttl } = {}) {
  const normalizedPath = buildUrl(path);
  const cacheKey = buildCacheKey(normalizedPath, params);

  const cached = getFromCache(cacheKey);
  if (cached) {
    return { data: cached, fromCache: true };
  }

  try {
    const response = await saavnClient.get(normalizedPath, { params });
    const payload = response.data;
    setCache(cacheKey, payload, ttl ?? DEFAULT_CACHE_TTL);
    return { data: payload, fromCache: false };
  } catch (error) {
    console.error('Saavn API error:', {
      path: normalizedPath,
      params,
      message: error.message,
      response: error.response?.data,
    });
    throw error;
  }
}

export async function getTrendingSongs({ limit = 20, language, query } = {}) {
  const q = query || (language ? `${language} trending songs` : 'trending');
  const { data } = await fetchFromSaavn('/search/songs', { query: q, limit });
  return data?.results || data;
}

export async function getTopPlaylists({ limit = 12, query = 'featured playlists' } = {}) {
  const { data } = await fetchFromSaavn('/search/playlists', { query, limit });
  return data?.results || data;
}

export async function getNewReleases({ limit = 12, query = 'new releases' } = {}) {
  const { data } = await fetchFromSaavn('/search/albums', { query, limit });
  return data?.results || data;
}

export async function getTopArtists({ limit = 12, query = 'top artists' } = {}) {
  const { data } = await fetchFromSaavn('/search/artists', { query, limit });
  return data?.results || data;
}

export async function getRecommendedMixes({ seedArtist }) {
  const query = seedArtist ? `${seedArtist} mix` : 'mix playlist';
  const { data } = await fetchFromSaavn('/search/playlists', { query, limit: 8 });
  return data?.results || data;
}

export async function searchAcrossSaavn({ query, page = 1 }) {
  if (!query) return { albums: [], songs: [], playlists: [], artists: [] };
  const response = await fetchFromSaavn('/search', { query, page });
  console.log('🔍 searchAcrossSaavn response:', JSON.stringify(response, null, 2));
  
  // Handle nested response structure: response.data.data
  if (response && response.data && response.data.data) {
    console.log('🔍 Returning double-nested data:', response.data.data);
    return response.data.data;
  }
  
  // Handle single-nested response structure: response.data
  if (response && response.data) {
    console.log('🔍 Returning single-nested data:', response.data);
    return response.data;
  }
  
  console.log('🔍 Returning direct response:', response);
  return response;
}

// Get album details by ID
export async function getAlbumDetails(albumId) {
  if (!albumId) return null;
  console.log('🎵 SaavnService: Fetching album details for ID:', albumId);
  const response = await fetchFromSaavn('/albums', { id: albumId });
  console.log('🎵 SaavnService: Album response:', response);
  
  // Handle double-nested response structure: response.data.data
  if (response && response.data && response.data.data) {
    console.log('🎵 SaavnService: Returning double-nested data:', response.data.data);
    return response.data.data;
  }
  
  // Handle single-nested response structure: response.data
  if (response && response.data) {
    console.log('🎵 SaavnService: Returning single-nested data:', response.data);
    return response.data;
  }
  
  console.log('🎵 SaavnService: Returning direct response:', response);
  return response;
}

// Get songs by IDs
export async function getSongsByIds(songIds) {
  if (!songIds || !Array.isArray(songIds)) return { songs: [] };
  
  try {
    console.log('🎵 SaavnService: Fetching songs by IDs:', songIds);
    const { data } = await fetchFromSaavn('/songs', { ids: songIds.join(',') });
    console.log('🎵 SaavnService: Songs response:', data);
    return data;
  } catch (error) {
    console.error('🎵 SaavnService: Error fetching songs by IDs:', error);
    // Try alternative approach - fetch individual songs
    try {
      console.log('🎵 SaavnService: Trying individual song fetches...');
      const songPromises = songIds.map(id => fetchFromSaavn(`/songs/${id}`));
      const songResponses = await Promise.all(songPromises);
      const songs = songResponses
        .map(response => response.data)
        .filter(song => song && song.id);
      console.log('🎵 SaavnService: Individual songs result:', songs.length);
      return { songs };
    } catch (individualError) {
      console.error('🎵 SaavnService: Individual song fetch failed:', individualError);
      return { songs: [] };
    }
  }
}

// Get artist details by ID
export async function getArtistDetails(artistId) {
  if (!artistId) return null;
  console.log('🎤 SaavnService: Fetching artist details for ID:', artistId);
  const response = await fetchFromSaavn('/artists', { id: artistId });
  console.log('🎤 SaavnService: Artist response:', response);
  
  // Handle double-nested response structure: response.data.data
  if (response && response.data && response.data.data) {
    console.log('🎤 SaavnService: Returning double-nested data:', response.data.data);
    return response.data.data;
  }
  
  // Handle single-nested response structure: response.data
  if (response && response.data) {
    console.log('🎤 SaavnService: Returning single-nested data:', response.data);
    return response.data;
  }
  
  console.log('🎤 SaavnService: Returning direct response:', response);
  return response;
}

// Get artist songs
export async function getArtistSongs(artistId, limit = 20) {
  if (!artistId) return { songs: [] };
  const { data } = await fetchFromSaavn(`/artists/${artistId}/songs`, { limit });
  return data;
}

// Get artist albums
export async function getArtistAlbums(artistId, limit = 20) {
  if (!artistId) return { albums: [] };
  const { data } = await fetchFromSaavn(`/artists/${artistId}/albums`, { limit });
  return data;
}

// Get playlist details by ID
export async function getPlaylistDetails(playlistId) {
  if (!playlistId) return null;
  console.log('🎶 SaavnService: Fetching playlist details for ID:', playlistId);
  const response = await fetchFromSaavn('/playlists', { id: playlistId });
  console.log('🎶 SaavnService: Playlist response:', response);
  
  // Handle double-nested response structure: response.data.data
  if (response && response.data && response.data.data) {
    console.log('🎶 SaavnService: Returning double-nested data:', response.data.data);
    return response.data.data;
  }
  
  // Handle single-nested response structure: response.data
  if (response && response.data) {
    console.log('🎶 SaavnService: Returning single-nested data:', response.data);
    return response.data;
  }
  
  console.log('🎶 SaavnService: Returning direct response:', response);
  return response;
}

export function clearSaavnCache() {
  cache.clear();
}

export default {
  getTrendingSongs,
  getTopPlaylists,
  getNewReleases,
  getTopArtists,
  getRecommendedMixes,
  searchAcrossSaavn,
  getAlbumDetails,
  getSongsByIds,
  getArtistDetails,
  getArtistSongs,
  getArtistAlbums,
  getPlaylistDetails,
  clearSaavnCache,
};
