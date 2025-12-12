import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from './user.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all user's playlists
router.get('/', authenticateToken, async (req, res) => {
  try {
    const playlists = await prisma.playlist.findMany({
      where: { userId: req.user.userId },
      include: {
        _count: { select: { songs: true } },
        user: {
          select: { id: true, fullname: true, avatar: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ playlists });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

// Get public playlists (for discovery)
router.get('/public', authenticateToken, async (req, res) => {
  try {
    const { page = 0, limit = 20 } = req.query;
    
    const playlists = await prisma.playlist.findMany({
      where: { 
        isPublic: true,
        NOT: { userId: req.user.userId } // Exclude own playlists
      },
      include: {
        _count: { select: { songs: true } },
        user: {
          select: { id: true, fullname: true, avatar: true }
        }
      },
      orderBy: { playCount: 'desc' },
      skip: parseInt(page) * parseInt(limit),
      take: parseInt(limit)
    });
    
    res.json({ playlists });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch public playlists' });
  }
});

// Create new playlist
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, isPublic = false, isCollaborative = false, imageUrl } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }
    
    const playlist = await prisma.playlist.create({
      data: {
        name: name.trim(),
        description: description?.trim(),
        isPublic,
        isCollaborative,
        imageUrl,
        userId: req.user.userId
      },
      include: {
        _count: { select: { songs: true } },
        user: {
          select: { id: true, fullname: true, avatar: true }
        }
      }
    });
    
    res.json({ playlist });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

// Get specific playlist details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const playlistId = Number(req.params.id);
    if (!Number.isInteger(playlistId) || playlistId <= 0) {
      return res.status(400).json({ error: 'Invalid playlist id' });
    }

    let playlist;
    try {
      playlist = await prisma.playlist.findUnique({
        where: { id: playlistId },
        include: {
          songs: {
            orderBy: { position: 'asc' }
          },
          user: {
            select: { id: true, fullname: true, avatar: true }
          },
          collaborators: {
            include: {
              user: {
                select: { id: true, fullname: true, avatar: true }
              }
            }
          },
          _count: { select: { songs: true } }
        }
      });
    } catch (prismaErr) {
      // Prisma/schema mismatch (common on deployments with drift) or query error.
      console.error('Failed to fetch playlist (Prisma error):', prismaErr);
      return res.status(500).json({
        error: 'Failed to fetch playlist',
        message: process.env.NODE_ENV === 'development' ? prismaErr?.message : undefined,
      });
    }
    
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    // Check if user has access to this playlist
    const hasAccess = playlist.isPublic || 
                     playlist.userId === req.user.userId ||
                     playlist.collaborators.some(c => c.userId === req.user.userId);
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Increment play count if accessing someone else's playlist
    if (playlist.userId !== req.user.userId) {
      await prisma.playlist.update({
        where: { id: playlistId },
        data: { playCount: { increment: 1 } }
      });
    }
    
    res.json({ playlist });
  } catch (err) {
    console.error('Failed to fetch playlist:', err);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// Update playlist
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const playlistId = parseInt(req.params.id);
    const { name, description, isPublic, isCollaborative, imageUrl } = req.body;
    
    // Check if user owns the playlist
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { userId: true }
    });
    
    if (!playlist || playlist.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updatedPlaylist = await prisma.playlist.update({
      where: { id: playlistId },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(isPublic !== undefined && { isPublic }),
        ...(isCollaborative !== undefined && { isCollaborative }),
        ...(imageUrl !== undefined && { imageUrl }),
        updatedAt: new Date()
      },
      include: {
        _count: { select: { songs: true } },
        user: {
          select: { id: true, fullname: true, avatar: true }
        }
      }
    });
    
    res.json({ playlist: updatedPlaylist });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update playlist' });
  }
});

// Delete playlist
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const playlistId = parseInt(req.params.id);
    
    // Check if user owns the playlist
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { userId: true }
    });
    
    if (!playlist || playlist.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await prisma.playlist.delete({
      where: { id: playlistId }
    });
    
    res.json({ message: 'Playlist deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

// Add song to playlist
router.post('/:id/songs', authenticateToken, async (req, res) => {
  try {
    const playlistId = parseInt(req.params.id);
    const { songId, songName, artistName, albumName, imageUrl, duration } = req.body;
    
    if (!songId || !songName || !artistName) {
      return res.status(400).json({ error: 'Song details are required' });
    }
    
    // Check if user has permission to add songs
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        collaborators: {
          where: { userId: req.user.userId }
        }
      }
    });
    
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    const canAddSongs = playlist.userId === req.user.userId ||
                       playlist.collaborators.some(c => c.canAddSongs);
    
    if (!canAddSongs) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Check if song already exists in playlist
    const existingSong = await prisma.playlistSong.findUnique({
      where: {
        playlistId_songId: {
          playlistId,
          songId
        }
      }
    });
    
    if (existingSong) {
      return res.status(400).json({ error: 'Song already in playlist' });
    }
    
    // Get next position
    const lastSong = await prisma.playlistSong.findFirst({
      where: { playlistId },
      orderBy: { position: 'desc' }
    });
    
    const position = (lastSong?.position || 0) + 1;
    
    const playlistSong = await prisma.playlistSong.create({
      data: {
        playlistId,
        songId,
        songName,
        artistName,
        albumName,
        imageUrl,
        duration,
        position,
        addedBy: req.user.userId
      }
    });
    
    res.json({ playlistSong });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add song to playlist' });
  }
});

// Remove song from playlist
router.delete('/:id/songs/:songId', authenticateToken, async (req, res) => {
  try {
    const playlistId = parseInt(req.params.id);
    const { songId } = req.params;
    
    // Check if user has permission to remove songs
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        collaborators: {
          where: { userId: req.user.userId }
        }
      }
    });
    
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    const canRemoveSongs = playlist.userId === req.user.userId ||
                          playlist.collaborators.some(c => c.canRemoveSongs);
    
    if (!canRemoveSongs) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    await prisma.playlistSong.delete({
      where: {
        playlistId_songId: {
          playlistId,
          songId
        }
      }
    });
    
    // Reorder remaining songs
    await prisma.$executeRaw`
      UPDATE playlist_songs 
      SET position = position - 1 
      WHERE playlist_id = ${playlistId} 
      AND position > (
        SELECT position FROM playlist_songs 
        WHERE playlist_id = ${playlistId} AND song_id = ${songId}
      )
    `;
    
    res.json({ message: 'Song removed from playlist' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove song from playlist' });
  }
});

// Reorder songs in playlist
router.put('/:id/songs/reorder', authenticateToken, async (req, res) => {
  try {
    const playlistId = parseInt(req.params.id);
    const { songId, newPosition } = req.body;
    
    // Check if user has edit permission
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        collaborators: {
          where: { userId: req.user.userId }
        }
      }
    });
    
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    const canEdit = playlist.userId === req.user.userId ||
                   playlist.collaborators.some(c => c.canEdit);
    
    if (!canEdit) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Get current song
    const song = await prisma.playlistSong.findUnique({
      where: {
        playlistId_songId: {
          playlistId,
          songId
        }
      }
    });
    
    if (!song) {
      return res.status(404).json({ error: 'Song not found in playlist' });
    }
    
    const oldPosition = song.position;
    
    // Update positions
    if (newPosition > oldPosition) {
      // Moving down
      await prisma.playlistSong.updateMany({
        where: {
          playlistId,
          position: {
            gt: oldPosition,
            lte: newPosition
          }
        },
        data: {
          position: {
            decrement: 1
          }
        }
      });
    } else {
      // Moving up
      await prisma.playlistSong.updateMany({
        where: {
          playlistId,
          position: {
            gte: newPosition,
            lt: oldPosition
          }
        },
        data: {
          position: {
            increment: 1
          }
        }
      });
    }
    
    // Update the moved song
    await prisma.playlistSong.update({
      where: {
        playlistId_songId: {
          playlistId,
          songId
        }
      },
      data: { position: newPosition }
    });
    
    res.json({ message: 'Song reordered successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reorder songs' });
  }
});

// Add collaborator to playlist
router.post('/:id/collaborators', authenticateToken, async (req, res) => {
  try {
    const playlistId = parseInt(req.params.id);
    const { userId, canEdit = false, canAddSongs = true, canRemoveSongs = false } = req.body;
    
    // Check if user owns the playlist
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { userId: true, isCollaborative: true }
    });
    
    if (!playlist || playlist.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!playlist.isCollaborative) {
      return res.status(400).json({ error: 'Playlist is not collaborative' });
    }
    
    // Check if user exists
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });
    
    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const collaborator = await prisma.playlistCollaborator.create({
      data: {
        playlistId,
        userId,
        canEdit,
        canAddSongs,
        canRemoveSongs
      },
      include: {
        user: {
          select: { id: true, fullname: true, avatar: true }
        }
      }
    });
    
    res.json({ collaborator });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'User is already a collaborator' });
    }
    res.status(500).json({ error: 'Failed to add collaborator' });
  }
});

// Update collaborator permissions
router.put('/:id/collaborators/:userId', authenticateToken, async (req, res) => {
  try {
    const playlistId = parseInt(req.params.id);
    const collaboratorUserId = parseInt(req.params.userId);
    const { canEdit, canAddSongs, canRemoveSongs } = req.body;
    
    // Check if user owns the playlist
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { userId: true }
    });
    
    if (!playlist || playlist.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const collaborator = await prisma.playlistCollaborator.update({
      where: {
        playlistId_userId: {
          playlistId,
          userId: collaboratorUserId
        }
      },
      data: {
        ...(canEdit !== undefined && { canEdit }),
        ...(canAddSongs !== undefined && { canAddSongs }),
        ...(canRemoveSongs !== undefined && { canRemoveSongs })
      },
      include: {
        user: {
          select: { id: true, fullname: true, avatar: true }
        }
      }
    });
    
    res.json({ collaborator });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update collaborator permissions' });
  }
});

// Remove collaborator from playlist
router.delete('/:id/collaborators/:userId', authenticateToken, async (req, res) => {
  try {
    const playlistId = parseInt(req.params.id);
    const collaboratorUserId = parseInt(req.params.userId);
    
    // Check if user owns the playlist
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { userId: true }
    });
    
    if (!playlist || playlist.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await prisma.playlistCollaborator.delete({
      where: {
        playlistId_userId: {
          playlistId,
          userId: collaboratorUserId
        }
      }
    });
    
    res.json({ message: 'Collaborator removed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove collaborator' });
  }
});

// Search playlists
router.get('/search/:query', authenticateToken, async (req, res) => {
  try {
    const { query } = req.params;
    const { page = 0, limit = 20 } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const playlists = await prisma.playlist.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } }
            ]
          },
          { isPublic: true }
        ]
      },
      include: {
        _count: { select: { songs: true } },
        user: {
          select: { id: true, fullname: true, avatar: true }
        }
      },
      orderBy: { playCount: 'desc' },
      skip: parseInt(page) * parseInt(limit),
      take: parseInt(limit)
    });
    
    res.json({ playlists });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search playlists' });
  }
});

export default router;