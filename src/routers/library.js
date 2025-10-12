import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from './user.js';

const router = express.Router();
const prisma = new PrismaClient();

// ========== LIKED SONGS ==========

// Get user's liked songs
router.get('/songs', authenticateToken, async (req, res) => {
  try {
    const { page = 0, limit = 50, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const validSortFields = ['createdAt', 'songName', 'artistName', 'albumName'];
    const validSortOrders = ['asc', 'desc'];
    
    const sort = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const order = validSortOrders.includes(sortOrder) ? sortOrder : 'desc';
    
    const likedSongs = await prisma.likedSong.findMany({
      where: { userId: req.user.userId },
      orderBy: { [sort]: order },
      skip: parseInt(page) * parseInt(limit),
      take: parseInt(limit)
    });
    
    const total = await prisma.likedSong.count({
      where: { userId: req.user.userId }
    });
    
    res.json({ likedSongs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch liked songs' });
  }
});

// Add song to liked songs
router.post('/songs', authenticateToken, async (req, res) => {
  try {
    const { songId, songName, artistName, albumName, imageUrl, duration } = req.body;
    
    if (!songId || !songName || !artistName) {
      return res.status(400).json({ error: 'Song ID, name, and artist are required' });
    }
    
    const likedSong = await prisma.likedSong.upsert({
      where: {
        userId_songId: {
          userId: req.user.userId,
          songId
        }
      },
      update: {
        songName,
        artistName,
        albumName,
        imageUrl,
        duration
      },
      create: {
        userId: req.user.userId,
        songId,
        songName,
        artistName,
        albumName,
        imageUrl,
        duration
      }
    });
    
    res.json({ likedSong });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add song to liked songs' });
  }
});

// Remove song from liked songs
router.delete('/songs/:songId', authenticateToken, async (req, res) => {
  try {
    const { songId } = req.params;
    
    await prisma.likedSong.delete({
      where: {
        userId_songId: {
          userId: req.user.userId,
          songId
        }
      }
    });
    
    res.json({ message: 'Song removed from liked songs' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Song not found in liked songs' });
    }
    res.status(500).json({ error: 'Failed to remove song from liked songs' });
  }
});

// Check if song is liked
router.get('/songs/:songId/check', authenticateToken, async (req, res) => {
  try {
    const { songId } = req.params;
    
    const likedSong = await prisma.likedSong.findUnique({
      where: {
        userId_songId: {
          userId: req.user.userId,
          songId
        }
      }
    });
    
    res.json({ isLiked: !!likedSong });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check if song is liked' });
  }
});

// ========== LIKED ALBUMS ==========

// Get user's liked albums
router.get('/albums', authenticateToken, async (req, res) => {
  try {
    const { page = 0, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const validSortFields = ['createdAt', 'albumName', 'artistName', 'year'];
    const validSortOrders = ['asc', 'desc'];
    
    const sort = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const order = validSortOrders.includes(sortOrder) ? sortOrder : 'desc';
    
    const likedAlbums = await prisma.likedAlbum.findMany({
      where: { userId: req.user.userId },
      orderBy: { [sort]: order },
      skip: parseInt(page) * parseInt(limit),
      take: parseInt(limit)
    });
    
    const total = await prisma.likedAlbum.count({
      where: { userId: req.user.userId }
    });
    
    res.json({ likedAlbums, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch liked albums' });
  }
});

// Add album to liked albums
router.post('/albums', authenticateToken, async (req, res) => {
  try {
    const { albumId, albumName, artistName, imageUrl, year, songCount } = req.body;
    
    if (!albumId || !albumName || !artistName) {
      return res.status(400).json({ error: 'Album ID, name, and artist are required' });
    }
    
    const likedAlbum = await prisma.likedAlbum.create({
      data: {
        userId: req.user.userId,
        albumId,
        albumName,
        artistName,
        imageUrl,
        year,
        songCount
      }
    });
    
    res.json({ likedAlbum });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Album already in liked albums' });
    }
    res.status(500).json({ error: 'Failed to add album to liked albums' });
  }
});

// Remove album from liked albums
router.delete('/albums/:albumId', authenticateToken, async (req, res) => {
  try {
    const { albumId } = req.params;
    
    await prisma.likedAlbum.delete({
      where: {
        userId_albumId: {
          userId: req.user.userId,
          albumId
        }
      }
    });
    
    res.json({ message: 'Album removed from liked albums' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Album not found in liked albums' });
    }
    res.status(500).json({ error: 'Failed to remove album from liked albums' });
  }
});

// Check if album is liked
router.get('/albums/:albumId/check', authenticateToken, async (req, res) => {
  try {
    const { albumId } = req.params;
    
    const likedAlbum = await prisma.likedAlbum.findUnique({
      where: {
        userId_albumId: {
          userId: req.user.userId,
          albumId
        }
      }
    });
    
    res.json({ isLiked: !!likedAlbum });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check if album is liked' });
  }
});

// ========== LIKED ARTISTS ==========

// Get user's liked artists
router.get('/artists', authenticateToken, async (req, res) => {
  try {
    const { page = 0, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const validSortFields = ['createdAt', 'artistName'];
    const validSortOrders = ['asc', 'desc'];
    
    const sort = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const order = validSortOrders.includes(sortOrder) ? sortOrder : 'desc';
    
    const likedArtists = await prisma.likedArtist.findMany({
      where: { userId: req.user.userId },
      orderBy: { [sort]: order },
      skip: parseInt(page) * parseInt(limit),
      take: parseInt(limit)
    });
    
    const total = await prisma.likedArtist.count({
      where: { userId: req.user.userId }
    });
    
    res.json({ likedArtists, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch liked artists' });
  }
});

// Add artist to liked artists
router.post('/artists', authenticateToken, async (req, res) => {
  try {
    const { artistId, artistName, imageUrl, isVerified } = req.body;
    
    if (!artistId || !artistName) {
      return res.status(400).json({ error: 'Artist ID and name are required' });
    }
    
    const likedArtist = await prisma.likedArtist.create({
      data: {
        userId: req.user.userId,
        artistId,
        artistName,
        imageUrl,
        isVerified: isVerified || false
      }
    });
    
    res.json({ likedArtist });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Artist already in liked artists' });
    }
    res.status(500).json({ error: 'Failed to add artist to liked artists' });
  }
});

// Remove artist from liked artists
router.delete('/artists/:artistId', authenticateToken, async (req, res) => {
  try {
    const { artistId } = req.params;
    
    await prisma.likedArtist.delete({
      where: {
        userId_artistId: {
          userId: req.user.userId,
          artistId
        }
      }
    });
    
    res.json({ message: 'Artist removed from liked artists' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Artist not found in liked artists' });
    }
    res.status(500).json({ error: 'Failed to remove artist from liked artists' });
  }
});

// Check if artist is liked
router.get('/artists/:artistId/check', authenticateToken, async (req, res) => {
  try {
    const { artistId } = req.params;
    
    const likedArtist = await prisma.likedArtist.findUnique({
      where: {
        userId_artistId: {
          userId: req.user.userId,
          artistId
        }
      }
    });
    
    res.json({ isLiked: !!likedArtist });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check if artist is liked' });
  }
});

// ========== LIKED PLAYLISTS ==========

// Get user's liked playlists
router.get('/playlists', authenticateToken, async (req, res) => {
  try {
    const { page = 0, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    const validSortFields = ['createdAt', 'playlistName'];
    const validSortOrders = ['asc', 'desc'];
    
    const sort = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const order = validSortOrders.includes(sortOrder) ? sortOrder : 'desc';
    
    const likedPlaylists = await prisma.likedPlaylist.findMany({
      where: { userId: req.user.userId },
      orderBy: { [sort]: order },
      skip: parseInt(page) * parseInt(limit),
      take: parseInt(limit)
    });
    
    const total = await prisma.likedPlaylist.count({
      where: { userId: req.user.userId }
    });
    
    res.json({ likedPlaylists, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch liked playlists' });
  }
});

// Add playlist to liked playlists
router.post('/playlists', authenticateToken, async (req, res) => {
  try {
    const { playlistId, playlistName, description, imageUrl, isExternal = true } = req.body;
    
    if (!playlistId || !playlistName) {
      return res.status(400).json({ error: 'Playlist ID and name are required' });
    }
    
    const likedPlaylist = await prisma.likedPlaylist.create({
      data: {
        userId: req.user.userId,
        playlistId,
        playlistName,
        description,
        imageUrl,
        isExternal
      }
    });
    
    res.json({ likedPlaylist });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Playlist already in liked playlists' });
    }
    res.status(500).json({ error: 'Failed to add playlist to liked playlists' });
  }
});

// Remove playlist from liked playlists
router.delete('/playlists/:playlistId', authenticateToken, async (req, res) => {
  try {
    const { playlistId } = req.params;
    
    await prisma.likedPlaylist.delete({
      where: {
        userId_playlistId: {
          userId: req.user.userId,
          playlistId
        }
      }
    });
    
    res.json({ message: 'Playlist removed from liked playlists' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Playlist not found in liked playlists' });
    }
    res.status(500).json({ error: 'Failed to remove playlist from liked playlists' });
  }
});

// Check if playlist is liked
router.get('/playlists/:playlistId/check', authenticateToken, async (req, res) => {
  try {
    const { playlistId } = req.params;
    
    const likedPlaylist = await prisma.likedPlaylist.findUnique({
      where: {
        userId_playlistId: {
          userId: req.user.userId,
          playlistId
        }
      }
    });
    
    res.json({ isLiked: !!likedPlaylist });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check if playlist is liked' });
  }
});

// ========== RECENTLY PLAYED ==========

// Add song to recently played (maintains last 10 songs)
router.post('/recent', authenticateToken, async (req, res) => {
  try {
    const { songId, songName, artistName, albumName, imageUrl, duration } = req.body;
    const userId = req.user.userId;
    
    if (!songId || !songName || !artistName) {
      return res.status(400).json({ error: 'Song ID, name, and artist are required' });
    }

    // Use a transaction to ensure data consistency and avoid unique conflicts
    const result = await prisma.$transaction(async (tx) => {
      // Remove any existing instance of this song for this user (idempotent)
      await tx.recentlyPlayed.deleteMany({ where: { userId, songId } });

      // Increment positions for all existing items
      await tx.recentlyPlayed.updateMany({
        where: { userId },
        data: { position: { increment: 1 } },
      });

      // Trim any items that overflow the max list (>= 10)
      await tx.recentlyPlayed.deleteMany({
        where: { userId, position: { gte: 10 } },
      });

      // Insert the new most-recent item at position 0
      const newSong = await tx.recentlyPlayed.create({
        data: {
          userId,
          songId,
          songName,
          artistName,
          albumName,
          imageUrl,
          duration,
          position: 0,
        },
      });

      return newSong;
    });

    res.json({ success: true, song: result });
  } catch (err) {
    console.error('Error adding to recently played:', err);
    // Swallow duplicate unique errors as success to preserve UX in rare race conditions
    if (err && err.code === 'P2002') {
      return res.json({ success: true, duplicate: true });
    }
    res.status(500).json({ error: 'Failed to add song to recently played' });
  }
});

// Get recently played songs
router.get('/recent', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get recently played songs ordered by position (most recent first)
    const recentSongs = await prisma.recentlyPlayed.findMany({
      where: { userId },
      orderBy: { position: 'asc' },
      take: 10
    });
    
    res.json({ recentSongs, total: recentSongs.length });
  } catch (err) {
    console.error('Error fetching recently played:', err);
    res.status(500).json({ error: 'Failed to fetch recently played songs' });
  }
});

// ========== LIBRARY OVERVIEW ==========

// Get library overview
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get counts for all library items
    const [
      likedSongsCount,
      likedAlbumsCount,
      likedArtistsCount,
      likedPlaylistsCount,
      createdPlaylistsCount
    ] = await Promise.all([
      prisma.likedSong.count({ where: { userId } }),
      prisma.likedAlbum.count({ where: { userId } }),
      prisma.likedArtist.count({ where: { userId } }),
      prisma.likedPlaylist.count({ where: { userId } }),
      prisma.playlist.count({ where: { userId } })
    ]);
    
    // Get recently added items (last 10 of each type) and recently played songs
    const [recentSongs, recentAlbums, recentArtists, recentPlaylists, recentlyPlayedSongs] = await Promise.all([
      prisma.likedSong.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      prisma.likedAlbum.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      prisma.likedArtist.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      prisma.playlist.findMany({
        where: { userId },
        include: {
          _count: { select: { songs: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      prisma.recentlyPlayed.findMany({
        where: { userId },
        orderBy: { position: 'asc' },
        take: 10
      })
    ]);
    
    res.json({
      overview: {
        counts: {
          likedSongs: likedSongsCount,
          likedAlbums: likedAlbumsCount,
          likedArtists: likedArtistsCount,
          likedPlaylists: likedPlaylistsCount,
          createdPlaylists: createdPlaylistsCount
        },
        recent: {
          songs: recentSongs,
          albums: recentAlbums,
          artists: recentArtists,
          playlists: recentPlaylists,
          played: recentlyPlayedSongs
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch library overview' });
  }
});

// Search within user's library
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { q, type = 'all' } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const userId = req.user.userId;
    const searchQuery = q.toLowerCase();
    
    let results = {};
    
    if (type === 'all' || type === 'songs') {
      results.songs = await prisma.likedSong.findMany({
        where: {
          userId,
          OR: [
            { songName: { contains: searchQuery, mode: 'insensitive' } },
            { artistName: { contains: searchQuery, mode: 'insensitive' } },
            { albumName: { contains: searchQuery, mode: 'insensitive' } }
          ]
        },
        take: 20
      });
    }
    
    if (type === 'all' || type === 'albums') {
      results.albums = await prisma.likedAlbum.findMany({
        where: {
          userId,
          OR: [
            { albumName: { contains: searchQuery, mode: 'insensitive' } },
            { artistName: { contains: searchQuery, mode: 'insensitive' } }
          ]
        },
        take: 20
      });
    }
    
    if (type === 'all' || type === 'artists') {
      results.artists = await prisma.likedArtist.findMany({
        where: {
          userId,
          artistName: { contains: searchQuery, mode: 'insensitive' }
        },
        take: 20
      });
    }
    
    if (type === 'all' || type === 'playlists') {
      results.playlists = await prisma.playlist.findMany({
        where: {
          userId,
          OR: [
            { name: { contains: searchQuery, mode: 'insensitive' } },
            { description: { contains: searchQuery, mode: 'insensitive' } }
          ]
        },
        include: {
          _count: { select: { songs: true } }
        },
        take: 20
      });
      
      // Also search liked playlists
      const likedPlaylists = await prisma.likedPlaylist.findMany({
        where: {
          userId,
          OR: [
            { playlistName: { contains: searchQuery, mode: 'insensitive' } },
            { description: { contains: searchQuery, mode: 'insensitive' } }
          ]
        },
        take: 20
      });
      
      results.playlists = [...(results.playlists || []), ...likedPlaylists];
    }
    
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search library' });
  }
});

// Bulk operations for library management
router.post('/bulk', authenticateToken, async (req, res) => {
  try {
    const { operation, type, items } = req.body;
    
    if (!operation || !type || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid bulk operation parameters' });
    }
    
    const userId = req.user.userId;
    let result = { success: 0, failed: 0, errors: [] };
    
    if (operation === 'add') {
      for (const item of items) {
        try {
          if (type === 'songs') {
            await prisma.likedSong.create({
              data: { userId, ...item }
            });
          } else if (type === 'albums') {
            await prisma.likedAlbum.create({
              data: { userId, ...item }
            });
          } else if (type === 'artists') {
            await prisma.likedArtist.create({
              data: { userId, ...item }
            });
          } else if (type === 'playlists') {
            await prisma.likedPlaylist.create({
              data: { userId, ...item }
            });
          }
          result.success++;
        } catch (err) {
          result.failed++;
          result.errors.push({ item, error: err.message });
        }
      }
    } else if (operation === 'remove') {
      for (const item of items) {
        try {
          if (type === 'songs') {
            await prisma.likedSong.delete({
              where: { userId_songId: { userId, songId: item.songId } }
            });
          } else if (type === 'albums') {
            await prisma.likedAlbum.delete({
              where: { userId_albumId: { userId, albumId: item.albumId } }
            });
          } else if (type === 'artists') {
            await prisma.likedArtist.delete({
              where: { userId_artistId: { userId, artistId: item.artistId } }
            });
          } else if (type === 'playlists') {
            await prisma.likedPlaylist.delete({
              where: { userId_playlistId: { userId, playlistId: item.playlistId } }
            });
          }
          result.success++;
        } catch (err) {
          result.failed++;
          result.errors.push({ item, error: err.message });
        }
      }
    }
    
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to perform bulk operation' });
  }
});

export default router;