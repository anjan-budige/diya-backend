import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your_refresh_secret_key_change_in_production';
const ACCESS_TOKEN_EXPIRY = '15m'; // Short-lived access tokens
const REFRESH_TOKEN_EXPIRY = '7d'; // Longer-lived refresh tokens

// Register new user
router.post('/register', async (req, res) => {
  const { fullname, email, password, bio, mobile , language} = req.body;
  if (!fullname || !email || !password || !language) return res.status(400).json({ error: 'Missing required fields' });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { fullname, email, password: hashedPassword, bio, mobile , language}
    });
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ 
      where: { email },
      select: {
        id: true,
        fullname: true,
        email: true,
        password: true,
        bio: true,
        mobile: true,
        language: true,
        avatar: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true
      }
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        type: 'access'
      }, 
      JWT_SECRET, 
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Generate refresh token with rotation
    const refreshTokenId = crypto.randomUUID();
    const refreshToken = jwt.sign(
      { 
        userId: user.id, 
        tokenId: refreshTokenId,
        type: 'refresh'
      }, 
      JWT_REFRESH_SECRET, 
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    // Store refresh token in database for rotation
    await prisma.refreshToken.create({
      data: {
        tokenId: refreshTokenId,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        isRevoked: false
      }
    });

    // Update user's last login and online status
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastSeen: new Date(),
        isOnline: true
      }
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({ 
      user: userWithoutPassword, 
      accessToken, 
      refreshToken,
      expiresIn: 15 * 60 // 15 minutes in seconds
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh token with rotation
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token is required' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Check if refresh token exists in database and is not revoked
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenId: decoded.tokenId },
      include: { user: true }
    });

    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { 
        userId: decoded.userId, 
        email: storedToken.user.email,
        type: 'access'
      }, 
      JWT_SECRET, 
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Generate new refresh token (token rotation)
    const newRefreshTokenId = crypto.randomUUID();
    const newRefreshToken = jwt.sign(
      { 
        userId: decoded.userId, 
        tokenId: newRefreshTokenId,
        type: 'refresh'
      }, 
      JWT_REFRESH_SECRET, 
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    // Revoke old refresh token and create new one
    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { tokenId: decoded.tokenId },
        data: { isRevoked: true }
      }),
      prisma.refreshToken.create({
        data: {
          tokenId: newRefreshTokenId,
          userId: decoded.userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          isRevoked: false
        }
      })
    ]);

    res.json({ 
      accessToken: newAccessToken, 
      refreshToken: newRefreshToken,
      expiresIn: 15 * 60 // 15 minutes in seconds
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        
        // Revoke refresh token
        await prisma.refreshToken.updateMany({
          where: { 
            tokenId: decoded.tokenId,
            userId: decoded.userId
          },
          data: { isRevoked: true }
        });

        // Update user's online status
        await prisma.user.update({
          where: { id: decoded.userId },
          data: { 
            isOnline: false,
            lastSeen: new Date()
          }
        });
      } catch (error) {
        // Token might be invalid, but we still want to respond successfully
        console.log('Invalid refresh token during logout:', error.message);
      }
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if user exists
router.post('/exists', async (req, res) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  const profileComplete = !!(user && user.fullname && user.language);
  res.json({ exists: !!user, profileComplete });
});

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

// Get profile of authenticated user
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { 
        id: true, 
        fullname: true, 
        email: true, 
        bio: true, 
        mobile: true, 
        language: true,
        avatar: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { fullname, bio, mobile, language, avatar } = req.body;
    
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        ...(fullname && { fullname }),
        ...(bio !== undefined && { bio }),
        ...(mobile && { mobile }),
        ...(language && { language }),
        ...(avatar && { avatar }),
        updatedAt: new Date()
      },
      select: { 
        id: true, 
        fullname: true, 
        email: true, 
        bio: true, 
        mobile: true, 
        language: true,
        avatar: true
      }
    });
    
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get user settings
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    let settings = await prisma.userSettings.findUnique({
      where: { userId: req.user.userId }
    });
    
    // Create default settings if none exist
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: { userId: req.user.userId }
      });
    }
    
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update user settings
router.put('/settings', authenticateToken, async (req, res) => {
  try {
    const {
      audioQuality,
      downloadQuality,
      profilePublic,
      showActivity,
      showPlaylists,
      emailNotifications,
      pushNotifications,
      newFollowerNotif,
      playlistShareNotif
    } = req.body;
    
    const settings = await prisma.userSettings.upsert({
      where: { userId: req.user.userId },
      update: {
        ...(audioQuality && { audioQuality }),
        ...(downloadQuality && { downloadQuality }),
        ...(profilePublic !== undefined && { profilePublic }),
        ...(showActivity !== undefined && { showActivity }),
        ...(showPlaylists !== undefined && { showPlaylists }),
        ...(emailNotifications !== undefined && { emailNotifications }),
        ...(pushNotifications !== undefined && { pushNotifications }),
        ...(newFollowerNotif !== undefined && { newFollowerNotif }),
        ...(playlistShareNotif !== undefined && { playlistShareNotif }),
        updatedAt: new Date()
      },
      create: {
        userId: req.user.userId,
        ...(audioQuality && { audioQuality }),
        ...(downloadQuality && { downloadQuality }),
        ...(profilePublic !== undefined && { profilePublic }),
        ...(showActivity !== undefined && { showActivity }),
        ...(showPlaylists !== undefined && { showPlaylists }),
        ...(emailNotifications !== undefined && { emailNotifications }),
        ...(pushNotifications !== undefined && { pushNotifications }),
        ...(newFollowerNotif !== undefined && { newFollowerNotif }),
        ...(playlistShareNotif !== undefined && { playlistShareNotif })
      }
    });
    
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get user's listening stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get total play count
    const totalPlays = await prisma.playHistory.count({
      where: { userId }
    });
    
    // Get total listening time (in minutes)
    const listeningTime = await prisma.playHistory.aggregate({
      where: { userId },
      _sum: { playDuration: true }
    });
    
    // Get top artists (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const topArtists = await prisma.playHistory.groupBy({
      by: ['artistName'],
      where: {
        userId,
        playedAt: { gte: thirtyDaysAgo }
      },
      _count: { artistName: true },
      orderBy: { _count: { artistName: 'desc' } },
      take: 5
    });
    
    // Get library counts
    const libraryCounts = await Promise.all([
      prisma.likedSong.count({ where: { userId } }),
      prisma.likedAlbum.count({ where: { userId } }),
      prisma.likedArtist.count({ where: { userId } }),
      prisma.playlist.count({ where: { userId } })
    ]);
    
    res.json({
      stats: {
        totalPlays,
        totalListeningTime: Math.round((listeningTime._sum.playDuration || 0) / 60),
        topArtists: topArtists.map(artist => ({
          name: artist.artistName,
          playCount: artist._count.artistName
        })),
        library: {
          likedSongs: libraryCounts[0],
          likedAlbums: libraryCounts[1],
          likedArtists: libraryCounts[2],
          playlists: libraryCounts[3]
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Follow/Unfollow user
router.post('/follow/:userId', authenticateToken, async (req, res) => {
  try {
    const followingId = parseInt(req.params.userId);
    const followerId = req.user.userId;
    
    if (followingId === followerId) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }
    
    // Check if already following
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId
        }
      }
    });
    
    if (existingFollow) {
      // Unfollow
      await prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId,
            followingId
          }
        }
      });
      res.json({ message: 'Unfollowed successfully', following: false });
    } else {
      // Follow
      await prisma.follow.create({
        data: { followerId, followingId }
      });
      res.json({ message: 'Followed successfully', following: true });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to follow/unfollow user' });
  }
});

// Get user's followers
router.get('/followers', authenticateToken, async (req, res) => {
  try {
    const followers = await prisma.follow.findMany({
      where: { followingId: req.user.userId },
      include: {
        follower: {
          select: {
            id: true,
            fullname: true,
            avatar: true,
            isOnline: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ followers: followers.map(f => f.follower) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch followers' });
  }
});

// Get users being followed
router.get('/following', authenticateToken, async (req, res) => {
  try {
    const following = await prisma.follow.findMany({
      where: { followerId: req.user.userId },
      include: {
        following: {
          select: {
            id: true,
            fullname: true,
            avatar: true,
            isOnline: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({ following: following.map(f => f.following) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch following' });
  }
});

// Search users
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { fullname: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } }
        ],
        NOT: { id: req.user.userId } // Exclude current user
      },
      select: {
        id: true,
        fullname: true,
        avatar: true,
        bio: true,
        isOnline: true
      },
      take: 20
    });
    
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Update user online status
router.put('/online-status', authenticateToken, async (req, res) => {
  try {
    const { isOnline } = req.body;
    
    await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        isOnline: isOnline,
        lastSeen: new Date()
      }
    });
    
    res.json({ message: 'Status updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Export the authenticateToken middleware for use in other routers
export { authenticateToken };
export default router;
