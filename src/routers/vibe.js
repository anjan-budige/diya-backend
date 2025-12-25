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
        _count: {
          select: {
            participants: {
              where: { isActive: true } // Only count active participants
            }
          }
        }
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
        _count: {
          select: {
            participants: {
              where: { isActive: true }
            }
          }
        }
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

    // Don't auto-join creator - they must explicitly click join button

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
      // Check if user is the creator
      const isCreator = session.creatorId === userId;

      // Create new participant (admin role if creator, member otherwise)
      await prisma.vibeParticipant.create({
        data: {
          sessionId,
          userId,
          role: isCreator ? 'admin' : 'member'
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

    // Update participant as inactive (session remains active, user can rejoin)
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

    // Session remains active - creator can leave and rejoin later
    // Only explicit delete (end session endpoint) removes the session

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

    // Check if user is creator or participant
    const sessionCheck = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      select: { creatorId: true }
    });

    if (!sessionCheck) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const participant = await prisma.vibeParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId: req.user.userId
        }
      }
    });

    if (sessionCheck.creatorId !== req.user.userId && (!participant || !participant.isActive)) {
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
        duration: duration ? parseInt(duration) : null,
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

// Play (Next) Song
router.post('/:id/next', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const userId = req.user.userId;

    const session = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          where: { userId, isActive: true }
        }
      }
    });

    if (!session) return res.status(404).json({ error: 'Session not found' });

    const isCreator = session.creatorId === userId;
    const participant = session.participants[0];
    const isAdmin = participant && participant.role === 'admin';

    if (!isCreator && !isAdmin && !session.allowGuestControl) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Get next song from queue
    const nextSong = await prisma.vibeQueue.findFirst({
      where: { sessionId, played: false },
      orderBy: { position: 'asc' }
    });

    if (!nextSong) {
      // Queue empty - stop playback
      await prisma.vibeSession.update({
        where: { id: sessionId },
        data: {
          isPlaying: false,
          currentSongId: null,
          currentSongName: null,
          currentArtistName: null,
          currentImageUrl: null
        }
      });
      return res.json({ message: 'Queue finished' });
    }

    // Update Session with new song
    await prisma.vibeSession.update({
      where: { id: sessionId },
      data: {
        currentSongId: nextSong.songId,
        currentSongName: nextSong.songName,
        currentArtistName: nextSong.artistName,
        currentImageUrl: nextSong.imageUrl,
        isPlaying: true,
        currentPosition: 0,
        lastUpdated: new Date()
      }
    });

    // Mark as played
    await prisma.vibeQueue.update({
      where: { id: nextSong.id },
      data: { played: true }
    });

    res.json({ message: 'Playing next song', song: nextSong });
  } catch (err) {
    res.status(500).json({ error: 'Failed to play next song' });
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

// Add this to vibe.js after the leave endpoint

// Send invitations to friends
router.post('/:id/invite', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { userIds } = req.body; // Array of user IDs to invite
    const inviterId = req.user.userId;

    // Check if session exists and is not full
    const session = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      include: {
        _count: {
          select: {
            participants: { where: { isActive: true } }
          }
        }
      }
    });

    if (!session || !session.isActive) {
      return res.status(404).json({ error: 'Session not found or inactive' });
    }

    // Check if session will be full after invitations
    const spotsAvailable = session.maxMembers - session._count.participants;
    if (userIds.length > spotsAvailable) {
      return res.status(400).json({
        error: `Only ${spotsAvailable} spots available in this session`
      });
    }

    // Get inviter info
    const inviter = await prisma.user.findUnique({
      where: { id: inviterId },
      select: { fullname: true }
    });

    // Create invitations
    const invitations = await Promise.all(
      userIds.map(async (userId) => {
        // Check if user is already a participant
        const existingParticipant = await prisma.vibeParticipant.findUnique({
          where: {
            sessionId_userId: { sessionId, userId }
          }
        });

        if (existingParticipant && existingParticipant.isActive) {
          return null; // Skip already joined users
        }

        // Check if invitation already exists
        const existingInvite = await prisma.vibeInvitation.findFirst({
          where: {
            sessionId,
            invitedUserId: userId,
            status: 'pending'
          }
        });

        if (existingInvite) {
          return null; // Skip already invited users
        }

        return prisma.vibeInvitation.create({
          data: {
            sessionId,
            invitedUserId: userId,
            invitedBy: inviterId,
            status: 'pending'
          },
          include: {
            session: {
              select: { id: true, name: true }
            },
            inviter: {
              select: { id: true, fullname: true }
            }
          }
        });
      })
    );

    const sentInvitations = invitations.filter(inv => inv !== null);

    // TODO: Send push notification to invited users

    res.json({
      message: `Sent ${sentInvitations.length} invitation(s)`,
      invitations: sentInvitations
    });
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Failed to send invitations' });
  }
});

// Get pending invitations for current user
router.get('/invitations/pending', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const invitations = await prisma.vibeInvitation.findMany({
      where: {
        invitedUserId: userId,
        status: 'pending'
      },
      include: {
        session: {
          include: {
            creator: {
              select: { id: true, fullname: true }
            },
            _count: {
              select: {
                participants: { where: { isActive: true } }
              }
            }
          }
        },
        inviter: {
          select: { id: true, fullname: true, avatar: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ invitations });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// Accept invitation
router.post('/invitations/:id/accept', authenticateToken, async (req, res) => {
  try {
    const invitationId = parseInt(req.params.id);
    const userId = req.user.userId;

    const invitation = await prisma.vibeInvitation.findUnique({
      where: { id: invitationId },
      include: {
        session: {
          include: {
            _count: {
              select: {
                participants: { where: { isActive: true } }
              }
            }
          }
        }
      }
    });

    if (!invitation || invitation.invitedUserId !== userId) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: 'Invitation already processed' });
    }

    // Check if session still has space
    if (invitation.session._count.participants >= invitation.session.maxMembers) {
      // Update invitation as expired
      await prisma.vibeInvitation.update({
        where: { id: invitationId },
        data: { status: 'expired' }
      });
      return res.status(400).json({ error: 'Session is now full' });
    }

    // Check if user is already a participant
    const existingParticipant = await prisma.vibeParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: invitation.sessionId,
          userId
        }
      }
    });

    if (existingParticipant && existingParticipant.isActive) {
      // Already joined, just mark invitation as accepted
      await prisma.vibeInvitation.update({
        where: { id: invitationId },
        data: { status: 'accepted' }
      });
      return res.json({ message: 'Already joined this session', session: invitation.session });
    }

    if (existingParticipant && !existingParticipant.isActive) {
      // Rejoin - reactivate participant
      await prisma.vibeParticipant.update({
        where: {
          sessionId_userId: {
            sessionId: invitation.sessionId,
            userId
          }
        },
        data: {
          isActive: true,
          joinedAt: new Date(),
          leftAt: null
        }
      });
    } else {
      // Join for first time
      const isCreator = invitation.session.creatorId === userId;
      await prisma.vibeParticipant.create({
        data: {
          sessionId: invitation.sessionId,
          userId,
          role: isCreator ? 'admin' : 'member'
        }
      });
    }

    // Mark invitation as accepted
    await prisma.vibeInvitation.update({
      where: { id: invitationId },
      data: { status: 'accepted' }
    });

    res.json({ message: 'Joined session successfully', session: invitation.session });
  } catch (err) {
    console.error('Accept invitation error:', err);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// Decline invitation
router.post('/invitations/:id/decline', authenticateToken, async (req, res) => {
  try {
    const invitationId = parseInt(req.params.id);
    const userId = req.user.userId;

    const invitation = await prisma.vibeInvitation.findUnique({
      where: { id: invitationId }
    });

    if (!invitation || invitation.invitedUserId !== userId) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    await prisma.vibeInvitation.update({
      where: { id: invitationId },
      data: { status: 'declined' }
    });

    res.json({ message: 'Invitation declined' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
});

// Get invitations for a session (pending and declined)
router.get('/:id/invitations', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const userId = req.user.userId;

    // Check if user is creator or participant
    const session = await prisma.vibeSession.findUnique({
      where: { id: sessionId },
      select: { creatorId: true }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const participant = await prisma.vibeParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId
        }
      }
    });

    if (session.creatorId !== userId && (!participant || !participant.isActive)) {
      return res.status(403).json({ error: 'Not a member of this session' });
    }

    const invitations = await prisma.vibeInvitation.findMany({
      where: {
        sessionId,
        status: { in: ['pending', 'declined'] }
      },
      include: {
        invitedUser: {
          select: {
            id: true,
            fullname: true,
            avatar: true,
            isOnline: true
          }
        },
        inviter: {
          select: {
            fullname: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ invitations });
  } catch (err) {
    console.error('Get session invitations error:', err);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});


export default router;