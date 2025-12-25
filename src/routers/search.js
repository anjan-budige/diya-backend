import express from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { searchAcrossSaavn } from '../services/saavnService.js';

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production';

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token is required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Access token has expired' });
      } else if (err.name === 'JsonWebTokenError') {
        return res.status(403).json({ error: 'Invalid access token' });
      }
      return res.status(403).json({ error: 'Token verification failed' });
    }

    if (decoded.type !== 'access') {
      return res.status(403).json({ error: 'Invalid token type' });
    }

    req.user = decoded;
    next();
  });
}

// Global search endpoint - combines JioSaavn API and user library
router.get('/global', authenticateToken, async (req, res) => {
  try {
    const { q, type = 'all', page = 0, limit = 20 } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const userId = req.user.userId;
    const searchQuery = q.toLowerCase();
    
    // Record search in history
    await prisma.searchHistory.create({
      data: {
        userId,
        query: q,
        searchType: type,
        language: req.user.language || 'telugu',
        source: req.headers['x-search-source'] || 'unknown'
      }
    });

    let results = {
      songs: [],
      albums: [],
      artists: [],
      playlists: [],
      userLibrary: {
        songs: [],
        albums: [],
        artists: [],
        playlists: []
      }
    };

    // Search JioSaavn API
    try {
      const saavnResponse = await searchAcrossSaavn({ query: q, page: parseInt(page) + 1 });
      console.log('📡 Global search Saavn response:', JSON.stringify(saavnResponse, null, 2));
      
      if (saavnResponse) {
        // The searchAcrossSaavn function already returns the data directly
        results.songs = saavnResponse.songs?.results || saavnResponse.songs || [];
        results.albums = saavnResponse.albums?.results || saavnResponse.albums || [];
        results.artists = saavnResponse.artists?.results || saavnResponse.artists || [];
        results.playlists = saavnResponse.playlists?.results || saavnResponse.playlists || [];
      }
    } catch (saavnError) {
      console.error('Saavn search error:', saavnError);
      // Continue with user library search even if Saavn fails
    }

    // Search user's library if authenticated
    if (userId) {
      try {
        // Search user's liked songs
        if (type === 'all' || type === 'songs') {
          results.userLibrary.songs = await prisma.likedSong.findMany({
            where: {
              userId,
              OR: [
                { songName: { contains: searchQuery, mode: 'insensitive' } },
                { artistName: { contains: searchQuery, mode: 'insensitive' } },
                { albumName: { contains: searchQuery, mode: 'insensitive' } }
              ]
            },
            take: 10,
            orderBy: { createdAt: 'desc' }
          });
        }

        // Search user's liked albums
        if (type === 'all' || type === 'albums') {
          results.userLibrary.albums = await prisma.likedAlbum.findMany({
            where: {
              userId,
              OR: [
                { albumName: { contains: searchQuery, mode: 'insensitive' } },
                { artistName: { contains: searchQuery, mode: 'insensitive' } }
              ]
            },
            take: 10,
            orderBy: { createdAt: 'desc' }
          });
        }

        // Search user's liked artists
        if (type === 'all' || type === 'artists') {
          results.userLibrary.artists = await prisma.likedArtist.findMany({
            where: {
              userId,
              artistName: { contains: searchQuery, mode: 'insensitive' }
            },
            take: 10,
            orderBy: { createdAt: 'desc' }
          });
        }

        // Search user's liked playlists
        if (type === 'all' || type === 'playlists') {
          results.userLibrary.playlists = await prisma.likedPlaylist.findMany({
            where: {
              userId,
              OR: [
                { playlistName: { contains: searchQuery, mode: 'insensitive' } },
                { description: { contains: searchQuery, mode: 'insensitive' } }
              ]
            },
            take: 10,
            orderBy: { createdAt: 'desc' }
          });
        }
      } catch (dbError) {
        console.error('Database search error:', dbError);
      }
    }

    // Update search history with results count
    const totalResults = results.songs.length + results.albums.length + 
                        results.artists.length + results.playlists.length +
                        results.userLibrary.songs.length + results.userLibrary.albums.length +
                        results.userLibrary.artists.length + results.userLibrary.playlists.length;

    await prisma.searchHistory.updateMany({
      where: {
        userId,
        query: q,
        searchedAt: {
          gte: new Date(Date.now() - 1000) // Within last second
        }
      },
      data: {
        resultsCount: totalResults
      }
    });

    res.json({
      success: true,
      query: q,
      results,
      totalResults,
      hasMore: totalResults >= limit
    });

  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get search suggestions based on user history and trending
router.get('/suggestions', authenticateToken, async (req, res) => {
  try {
    const { q = '', limit = 10 } = req.query;
    const userId = req.user.userId;

    let suggestions = [];

    // Get recent search history
    if (userId && q.length >= 1) {
      const recentSearches = await prisma.searchHistory.findMany({
        where: {
          userId,
          query: {
            contains: q.toLowerCase(),
            mode: 'insensitive'
          }
        },
        select: {
          query: true,
          searchType: true,
          searchedAt: true
        },
        orderBy: { searchedAt: 'desc' },
        take: 5,
        distinct: ['query']
      });

      suggestions = recentSearches.map(search => ({
        type: 'history',
        query: search.query,
        searchType: search.searchType,
        label: `Recent: ${search.query}`
      }));
    }

    // Get trending searches (most searched queries in last 7 days)
    const trendingSearches = await prisma.searchHistory.groupBy({
      by: ['query'],
      where: {
        searchedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        },
        query: q.length > 0 ? {
          contains: q.toLowerCase(),
          mode: 'insensitive'
        } : undefined
      },
      _count: {
        query: true
      },
      orderBy: {
        _count: {
          query: 'desc'
        }
      },
      take: 5
    });

    const trendingSuggestions = trendingSearches.map(search => ({
      type: 'trending',
      query: search.query,
      count: search._count.query,
      label: `Trending: ${search.query}`
    }));

    suggestions = [...suggestions, ...trendingSuggestions];

    // If we have a query and need more suggestions, get them from Saavn API
    if (q.length >= 2 && suggestions.length < limit) {
      try {
        console.log('🔍 Getting Saavn suggestions for:', q);
        const saavnResponse = await searchAcrossSaavn({ query: q, page: 1 });
        console.log('📡 Saavn response structure:', JSON.stringify(saavnResponse, null, 2));
        
        if (saavnResponse && saavnResponse.data) {
          const { albums, songs, artists, playlists } = saavnResponse.data;
          
          // Add song suggestions
          const songSuggestions = (songs?.results || []).slice(0, 3).map(song => ({
            type: 'song',
            query: song.title || song.name,
            songId: song.id,
            artist: song.primaryArtists || song.singers || song.artist,
            label: `${song.title || song.name} - ${song.primaryArtists || song.singers || song.artist}`
          }));

          // Add album suggestions
          const albumSuggestions = (albums?.results || []).slice(0, 2).map(album => ({
            type: 'album',
            query: album.title || album.name,
            albumId: album.id,
            artist: album.artist,
            label: `${album.title || album.name} - ${album.artist}`
          }));

          // Add artist suggestions
          const artistSuggestions = (artists?.results || []).slice(0, 2).map(artist => ({
            type: 'artist',
            query: artist.title || artist.name,
            artistId: artist.id,
            label: artist.title || artist.name
          }));

          // Add playlist suggestions
          const playlistSuggestions = (playlists?.results || []).slice(0, 2).map(playlist => ({
            type: 'playlist',
            query: playlist.title || playlist.name,
            playlistId: playlist.id,
            label: playlist.title || playlist.name
          }));

          // Combine all Saavn suggestions
          const saavnSuggestions = [
            ...songSuggestions,
            ...albumSuggestions,
            ...artistSuggestions,
            ...playlistSuggestions
          ];

          console.log('🎵 Generated Saavn suggestions:', saavnSuggestions);
          suggestions = [...suggestions, ...saavnSuggestions];
        }
      } catch (saavnError) {
        console.error('Saavn suggestions error:', saavnError);
        // Continue without Saavn suggestions
      }
    }

    // Limit and return suggestions
    suggestions = suggestions.slice(0, limit);

    res.json({
      success: true,
      suggestions
    });

  } catch (error) {
    console.error('Search suggestions error:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

// Record search result click
router.post('/click', authenticateToken, async (req, res) => {
  try {
    const { query, resultId, resultType } = req.body;
    const userId = req.user.userId;

    if (!query || !resultId || !resultType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Update the most recent search with clicked result
    await prisma.searchHistory.updateMany({
      where: {
        userId,
        query,
        searchedAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000) // Within last 5 minutes
        }
      },
      data: {
        clickedResult: resultId,
        clickedType: resultType
      }
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Search click error:', error);
    res.status(500).json({ error: 'Failed to record click' });
  }
});

// Get user's search history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const userId = req.user.userId;

    const history = await prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { searchedAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      select: {
        id: true,
        query: true,
        searchType: true,
        resultsCount: true,
        searchedAt: true,
        source: true
      }
    });

    res.json({
      success: true,
      history
    });

  } catch (error) {
    console.error('Search history error:', error);
    res.status(500).json({ error: 'Failed to get search history' });
  }
});

// Clear search history
router.delete('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    await prisma.searchHistory.deleteMany({
      where: { userId }
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Clear search history error:', error);
    res.status(500).json({ error: 'Failed to clear search history' });
  }
});

// Get trending searches across all users
router.get('/trending', async (req, res) => {
  try {
    const { limit = 10, timeframe = '7d' } = req.query;
    
    let timeFilter;
    switch (timeframe) {
      case '1d':
        timeFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        timeFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        timeFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        timeFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    const trending = await prisma.searchHistory.groupBy({
      by: ['query'],
      where: {
        searchedAt: {
          gte: timeFilter
        }
      },
      _count: {
        query: true
      },
      orderBy: {
        _count: {
          query: 'desc'
        }
      },
      take: parseInt(limit)
    });

    res.json({
      success: true,
      trending: trending.map(item => ({
        query: item.query,
        count: item._count.query
      }))
    });

  } catch (error) {
    console.error('Trending searches error:', error);
    res.status(500).json({ error: 'Failed to get trending searches' });
  }
});

export default router;
