import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from './user.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all active vibe sessions (public ones)
router.get('/public', authenticateToken, async (req, res) => {
  try {
    const { page = 0, limit = 20 } = req.query;
    
    const sessions = await prisma.vibeSession.findMany({
      where: {
        isPublic: true,
        isActive: true
      },
      include: {
        creator: {
          select: { id: true, fullname: true, avatar: true }
        },
        _count: { select: { participants: true } }
      },
      orderBy: { startedAt: 'desc' },
      skip: parseInt(page) * parseInt(limit),
      take: parseInt(limit)
    });
    
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch public vibe sessions' });
  }
});

// Get user's vibe sessions (created or joined)
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get sessions created by user
    const createdSessions = await prisma.vibeSession.findMany({
      where: {
        creatorId: userId,
        isActive: true
      },
      include: {
        creator: {
          select: { id: true, fullname: true, avatar: true }
        },
        _count: { select: { participants: true } }
      }
    });
    
    // Get sessions user has joined
    const joinedSessions = await prisma.vibeParticipant.findMany({
      where: {
        userId,
        isActive: true
      },
      include: {
        session: {
          include: {
            creator: {
              select: { id: true, fullname: true, avatar: true }
            },
            _count: { select: { participants: true } }
          }
        }
      }
    });
    
    res.json({
      createdSessions,
      joinedSessions: joinedSessions.map(jp => jp.session)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user vibe sessions' });
  }
});

// Create new vibe session
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      description,
      isPublic = false,
      maxMembers = 10,
      allowGuestControl = false,
      queueMode = 'collaborative'
    } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Vibe session name is required' });
    }
    
    const session = await prisma.vibeSession.create({
      data: {
        name: name.trim(),
        description: description?.trim(),
        isPublic,
        maxMembers,
        allowGuestControl,
        queueMode,
        creatorId: req.user.userId
      },
      include: {
        creator: {
          select: { id: true, fullname: true, avatar: true }
        },
        _count: { select: { participants: true } }
      }
    });
    
    // Add creator as first participant with admin role
    await prisma.vibeParticipant.create({
      data: {
        sessionId: session.id,
        userId: req.user.userId,
        role: 'admin'
      }
    });
    
    res.json({ session });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create vibe session' });
  }
});

// Get specific vibe session details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    
    const session = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      include: {
        creator: {
          select: { id: true, fullname: true, avatar: true }
        },
        participants: {
          where: { isActive: true },
          include: {
            user: {
              select: { id: true, fullname: true, avatar: true, isOnline: true }
            }
          },
          orderBy: { joinedAt: 'asc' }
        },
        queue: {
          where: { played: false },
          orderBy: { position: 'asc' }
        }
      }
    });
    
    if (!session) {
      return res.status(404).json({ error: 'Vibe session not found' });
    }
    
    // Check if user has access to this session
    const hasAccess = session.isPublic ||
                     session.creatorId === req.user.userId ||
                     session.participants.some(p => p.userId === req.user.userId);
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({ session });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vibe session' });
  }
});

// Join vibe session
router.post('/:id/join', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const userId = req.user.userId;
    
    // Check if session exists and is active
    const session = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      include: {
        _count: { select: { participants: true } }
      }
    });
    
    if (!session || !session.isActive) {
      return res.status(404).json({ error: 'Vibe session not found or inactive' });
    }
    
    // Check if session is full
    if (session._count.participants >= session.maxMembers) {
      return res.status(400).json({ error: 'Vibe session is full' });
    }
    
    // Check if user is already a participant
    const existingParticipant = await prisma.vibeParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId
        }
      }
    });
    
    if (existingParticipant) {
      if (existingParticipant.isActive) {
        return res.status(400).json({ error: 'Already joined this session' });
      } else {
        // Reactivate participant
        await prisma.vibeParticipant.update({
          where: {
            sessionId_userId: {
              sessionId,
              userId
            }
          },
          data: {
            isActive: true,
            joinedAt: new Date(),
            leftAt: null
          }
        });
      }
    } else {
      // Create new participant
      await prisma.vibeParticipant.create({
        data: {
          sessionId,
          userId,
          role: 'member'
        }
      });
    }
    
    // Get updated session data
    const updatedSession = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      include: {
        creator: {
          select: { id: true, fullname: true, avatar: true }
        },
        participants: {
          where: { isActive: true },
          include: {
            user: {
              select: { id: true, fullname: true, avatar: true, isOnline: true }
            }
          }
        }
      }
    });
    
    res.json({ session: updatedSession });
  } catch (err) {
    res.status(500).json({ error: 'Failed to join vibe session' });
  }
});

// Leave vibe session
router.post('/:id/leave', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const userId = req.user.userId;
    
    const participant = await prisma.vibeParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId
        }
      }
    });
    
    if (!participant || !participant.isActive) {
      return res.status(400).json({ error: 'Not a member of this session' });
    }
    
    // Update participant as inactive
    await prisma.vibeParticipant.update({
      where: {
        sessionId_userId: {
          sessionId,
          userId
        }
      },
      data: {
        isActive: false,
        leftAt: new Date()
      }
    });
    
    // If creator left, end the session
    const session = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      select: { creatorId: true }
    });
    
    if (session.creatorId === userId) {
      await prisma.vibeSession.update({
        where: { id: sessionId },
        data: {
          isActive: false,
          endedAt: new Date()
        }
      });
    }
    
    res.json({ message: 'Left vibe session successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to leave vibe session' });
  }
});

// Update vibe session settings
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const {
      name,
      description,
      isPublic,
      maxMembers,
      allowGuestControl,
      queueMode
    } = req.body;
    
    // Check if user is the creator
    const session = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      select: { creatorId: true }
    });
    
    if (!session || session.creatorId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const updatedSession = await prisma.vibeSession.update({
      where: { id: sessionId },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(isPublic !== undefined && { isPublic }),
        ...(maxMembers && { maxMembers }),
        ...(allowGuestControl !== undefined && { allowGuestControl }),
        ...(queueMode && { queueMode })
      },
      include: {
        creator: {
          select: { id: true, fullname: true, avatar: true }
        },
        _count: { select: { participants: true } }
      }
    });
    
    res.json({ session: updatedSession });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update vibe session' });
  }
});

// Add song to vibe queue
router.post('/:id/queue', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { songId, songName, artistName, imageUrl, duration } = req.body;
    
    if (!songId || !songName || !artistName) {
      return res.status(400).json({ error: 'Song details are required' });
    }
    
    // Check if user is a participant
    const participant = await prisma.vibeParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId: req.user.userId
        }
      }
    });
    
    if (!participant || !participant.isActive) {
      return res.status(403).json({ error: 'Not a member of this session' });
    }
    
    // Get session to check queue mode
    const session = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      select: { queueMode: true, creatorId: true }
    });
    
    // Check permissions based on queue mode
    if (session.queueMode === 'host-only' && session.creatorId !== req.user.userId) {
      return res.status(403).json({ error: 'Only host can add songs to queue' });
    }
    
    // Get next position in queue
    const lastQueueItem = await prisma.vibeQueue.findFirst({
      where: { sessionId },
      orderBy: { position: 'desc' }
    });
    
    const position = (lastQueueItem?.position || 0) + 1;
    
    const queueItem = await prisma.vibeQueue.create({
      data: {
        sessionId,
        songId,
        songName,
        artistName,
        imageUrl,
        duration,
        addedBy: req.user.userId,
        position
      }
    });
    
    res.json({ queueItem });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add song to queue' });
  }
});

// Update current playing song in vibe session
router.put('/:id/current-song', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const {
      songId,
      songName,
      artistName,
      imageUrl,
      isPlaying = true,
      position = 0
    } = req.body;
    
    // Check if user has control permissions
    const session = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          where: {
            userId: req.user.userId,
            isActive: true
          }
        }
      }
    });
    
    if (!session) {
      return res.status(404).json({ error: 'Vibe session not found' });
    }
    
    const participant = session.participants[0];
    const canControl = session.creatorId === req.user.userId ||
                      (session.allowGuestControl && participant) ||
                      (participant && participant.role === 'admin');
    
    if (!canControl) {
      return res.status(403).json({ error: 'No permission to control playback' });
    }
    
    // Update session with current song
    const updatedSession = await prisma.vibeSession.update({
      where: { id: sessionId },
      data: {
        currentSongId: songId,
        currentSongName: songName,
        currentArtistName: artistName,
        currentImageUrl: imageUrl,
        isPlaying,
        currentPosition: position,
        lastUpdated: new Date()
      }
    });
    
    // Mark song as played in queue if it exists
    if (songId) {
      await prisma.vibeQueue.updateMany({
        where: {
          sessionId,
          songId,
          played: false
        },
        data: { played: true }
      });
    }
    
    res.json({ session: updatedSession });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update current song' });
  }
});

// Update playback state (play/pause/seek)
router.put('/:id/playback', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { isPlaying, position } = req.body;
    
    // Check permissions
    const session = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          where: {
            userId: req.user.userId,
            isActive: true
          }
        }
      }
    });
    
    if (!session) {
      return res.status(404).json({ error: 'Vibe session not found' });
    }
    
    const participant = session.participants[0];
    const canControl = session.creatorId === req.user.userId ||
                      (session.allowGuestControl && participant) ||
                      (participant && participant.role === 'admin');
    
    if (!canControl) {
      return res.status(403).json({ error: 'No permission to control playback' });
    }
    
    const updatedSession = await prisma.vibeSession.update({
      where: { id: sessionId },
      data: {
        ...(isPlaying !== undefined && { isPlaying }),
        ...(position !== undefined && { currentPosition: position }),
        lastUpdated: new Date()
      }
    });
    
    res.json({ session: updatedSession });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update playback state' });
  }
});

// Remove song from vibe queue
router.delete('/:id/queue/:queueId', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const queueId = parseInt(req.params.queueId);
    
    // Check if user has permission
    const session = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      select: { creatorId: true, queueMode: true }
    });
    
    const queueItem = await prisma.vibeQueue.findUnique({
      where: { id: queueId },
      select: { addedBy: true }
    });
    
    if (!session || !queueItem) {
      return res.status(404).json({ error: 'Queue item not found' });
    }
    
    // User can remove if they are: creator, or added the song themselves
    const canRemove = session.creatorId === req.user.userId ||
                     queueItem.addedBy === req.user.userId;
    
    if (!canRemove) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    await prisma.vibeQueue.delete({
      where: { id: queueId }
    });
    
    res.json({ message: 'Song removed from queue' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove song from queue' });
  }
});

// End vibe session
router.post('/:id/end', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    
    // Check if user is the creator
    const session = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      select: { creatorId: true }
    });
    
    if (!session || session.creatorId !== req.user.userId) {
      return res.status(403).json({ error: 'Only creator can end the session' });
    }
    
    // End session and deactivate all participants
    await prisma.vibeSession.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        endedAt: new Date()
      }
    });
    
    await prisma.vibeParticipant.updateMany({
      where: { sessionId },
      data: {
        isActive: false,
        leftAt: new Date()
      }
    });
    
    res.json({ message: 'Vibe session ended successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to end vibe session' });
  }
});

export default router;