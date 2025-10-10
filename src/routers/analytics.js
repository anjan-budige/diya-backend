import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from './user.js';

const router = express.Router();
const prisma = new PrismaClient();

// Record a song play
router.post('/play', authenticateToken, async (req, res) => {
  try {
    const {
      songId,
      songName,
      artistName,
      albumName,
      imageUrl,
      duration,
      playDuration,
      completed = false,
      source,
      sourceId
    } = req.body;
    
    if (!songId || !songName || !artistName) {
      return res.status(400).json({ error: 'Song ID, name, and artist are required' });
    }
    
    const playRecord = await prisma.playHistory.create({
      data: {
        userId: req.user.userId,
        songId,
        songName,
        artistName,
        albumName,
        imageUrl,
        duration,
        playDuration,
        completed,
        source,
        sourceId
      }
    });
    
    res.json({ playRecord });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record play history' });
  }
});

// Get user's play history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { page = 0, limit = 50, startDate, endDate } = req.query;
    
    let whereClause = { userId: req.user.userId };
    
    // Add date filtering if provided
    if (startDate || endDate) {
      whereClause.playedAt = {};
      if (startDate) whereClause.playedAt.gte = new Date(startDate);
      if (endDate) whereClause.playedAt.lte = new Date(endDate);
    }
    
    const playHistory = await prisma.playHistory.findMany({
      where: whereClause,
      orderBy: { playedAt: 'desc' },
      skip: parseInt(page) * parseInt(limit),
      take: parseInt(limit)
    });
    
    const total = await prisma.playHistory.count({ where: whereClause });
    
    res.json({ 
      playHistory, 
      total, 
      page: parseInt(page), 
      limit: parseInt(limit) 
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch play history' });
  }
});

// Get recently played songs (unique songs)
router.get('/recent', authenticateToken, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // Get unique recent songs by grouping by songId and taking the latest playedAt
    const recentSongs = await prisma.playHistory.findMany({
      where: { userId: req.user.userId },
      orderBy: { playedAt: 'desc' },
      distinct: ['songId'],
      take: parseInt(limit)
    });
    
    res.json({ recentSongs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recent songs' });
  }
});

// Get user's music analytics
router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const userId = req.user.userId;
    
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(period));
    
    // Total listening statistics
    const totalStats = await prisma.playHistory.aggregate({
      where: {
        userId,
        playedAt: { gte: daysAgo }
      },
      _count: { id: true },
      _sum: { playDuration: true },
      _avg: { playDuration: true }
    });
    
    // Top artists in the period
    const topArtists = await prisma.playHistory.groupBy({
      by: ['artistName'],
      where: {
        userId,
        playedAt: { gte: daysAgo }
      },
      _count: { artistName: true },
      _sum: { playDuration: true },
      orderBy: { _count: { artistName: 'desc' } },
      take: 10
    });
    
    // Top songs in the period
    const topSongs = await prisma.playHistory.groupBy({
      by: ['songId', 'songName', 'artistName', 'imageUrl'],
      where: {
        userId,
        playedAt: { gte: daysAgo }
      },
      _count: { songId: true },
      _sum: { playDuration: true },
      orderBy: { _count: { songId: 'desc' } },
      take: 10
    });
    
    // Top albums in the period
    const topAlbums = await prisma.playHistory.groupBy({
      by: ['albumName', 'artistName'],
      where: {
        userId,
        playedAt: { gte: daysAgo },
        albumName: { not: null }
      },
      _count: { albumName: true },
      _sum: { playDuration: true },
      orderBy: { _count: { albumName: 'desc' } },
      take: 10
    });
    
    // Listening activity by day
    const dailyActivity = await prisma.$queryRaw`
      SELECT 
        DATE(played_at) as date,
        COUNT(*) as plays,
        SUM(play_duration) as total_duration
      FROM play_history 
      WHERE user_id = ${userId} 
        AND played_at >= ${daysAgo}
      GROUP BY DATE(played_at)
      ORDER BY DATE(played_at) ASC
    `;
    
    // Listening activity by hour
    const hourlyActivity = await prisma.$queryRaw`
      SELECT 
        EXTRACT(HOUR FROM played_at) as hour,
        COUNT(*) as plays,
        SUM(play_duration) as total_duration
      FROM play_history 
      WHERE user_id = ${userId} 
        AND played_at >= ${daysAgo}
      GROUP BY EXTRACT(HOUR FROM played_at)
      ORDER BY EXTRACT(HOUR FROM played_at) ASC
    `;
    
    // Source breakdown (where music was played from)
    const sourceBreakdown = await prisma.playHistory.groupBy({
      by: ['source'],
      where: {
        userId,
        playedAt: { gte: daysAgo },
        source: { not: null }
      },
      _count: { source: true },
      orderBy: { _count: { source: 'desc' } }
    });
    
    // Calculate listening streaks
    const listeningStreaks = await calculateListeningStreaks(userId, parseInt(period));
    
    res.json({
      analytics: {
        period: parseInt(period),
        totalStats: {
          totalPlays: totalStats._count.id,
          totalListeningTime: Math.round((totalStats._sum.playDuration || 0) / 60), // in minutes
          averagePlayDuration: Math.round(totalStats._avg.playDuration || 0) // in seconds
        },
        topArtists: topArtists.map(artist => ({
          name: artist.artistName,
          playCount: artist._count.artistName,
          totalDuration: Math.round((artist._sum.playDuration || 0) / 60)
        })),
        topSongs: topSongs.map(song => ({
          songId: song.songId,
          name: song.songName,
          artist: song.artistName,
          imageUrl: song.imageUrl,
          playCount: song._count.songId,
          totalDuration: Math.round((song._sum.playDuration || 0) / 60)
        })),
        topAlbums: topAlbums.map(album => ({
          name: album.albumName,
          artist: album.artistName,
          playCount: album._count.albumName,
          totalDuration: Math.round((album._sum.playDuration || 0) / 60)
        })),
        dailyActivity: dailyActivity.map(day => ({
          date: day.date,
          plays: Number(day.plays),
          totalDuration: Math.round(Number(day.total_duration || 0) / 60)
        })),
        hourlyActivity: hourlyActivity.map(hour => ({
          hour: Number(hour.hour),
          plays: Number(hour.plays),
          totalDuration: Math.round(Number(hour.total_duration || 0) / 60)
        })),
        sourceBreakdown: sourceBreakdown.map(source => ({
          source: source.source,
          playCount: source._count.source
        })),
        listeningStreaks
      }
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Helper function to calculate listening streaks
async function calculateListeningStreaks(userId, days) {
  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    
    // Get daily activity
    const dailyPlays = await prisma.$queryRaw`
      SELECT 
        DATE(played_at) as date,
        COUNT(*) as plays
      FROM play_history 
      WHERE user_id = ${userId} 
        AND played_at >= ${daysAgo}
      GROUP BY DATE(played_at)
      ORDER BY DATE(played_at) DESC
    `;
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDate = null;
    
    // Calculate streaks
    for (const day of dailyPlays) {
      const currentDate = new Date(day.date);
      
      if (lastDate === null) {
        // First day
        tempStreak = 1;
        if (isToday(currentDate) || isYesterday(currentDate)) {
          currentStreak = 1;
        }
      } else {
        const daysDiff = Math.floor((lastDate - currentDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 1) {
          // Consecutive day
          tempStreak++;
          if (currentStreak > 0 || isToday(currentDate) || isYesterday(currentDate)) {
            currentStreak = tempStreak;
          }
        } else {
          // Streak broken
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
          if (isToday(currentDate) || isYesterday(currentDate)) {
            currentStreak = 1;
          } else {
            currentStreak = 0;
          }
        }
      }
      
      lastDate = currentDate;
    }
    
    longestStreak = Math.max(longestStreak, tempStreak);
    
    return {
      currentStreak,
      longestStreak
    };
  } catch (err) {
    console.error('Error calculating streaks:', err);
    return { currentStreak: 0, longestStreak: 0 };
  }
}

function isToday(date) {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isYesterday(date) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return date.toDateString() === yesterday.toDateString();
}

// Get music discovery insights
router.get('/discovery', authenticateToken, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const userId = req.user.userId;
    
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(period));
    
    // Get unique songs played in period
    const uniqueSongs = await prisma.playHistory.findMany({
      where: {
        userId,
        playedAt: { gte: daysAgo }
      },
      distinct: ['songId'],
      select: { songId: true, playedAt: true }
    });
    
    // Get unique artists played in period
    const uniqueArtists = await prisma.playHistory.findMany({
      where: {
        userId,
        playedAt: { gte: daysAgo }
      },
      distinct: ['artistName'],
      select: { artistName: true, playedAt: true }
    });
    
    // Get unique albums played in period
    const uniqueAlbums = await prisma.playHistory.findMany({
      where: {
        userId,
        playedAt: { gte: daysAgo },
        albumName: { not: null }
      },
      distinct: ['albumName'],
      select: { albumName: true, playedAt: true }
    });
    
    // Calculate diversity score (number of unique artists vs total plays)
    const totalPlays = await prisma.playHistory.count({
      where: {
        userId,
        playedAt: { gte: daysAgo }
      }
    });
    
    const diversityScore = totalPlays > 0 ? 
      Math.round((uniqueArtists.length / totalPlays) * 100) : 0;
    
    // Get completion rate
    const completedPlays = await prisma.playHistory.count({
      where: {
        userId,
        playedAt: { gte: daysAgo },
        completed: true
      }
    });
    
    const completionRate = totalPlays > 0 ? 
      Math.round((completedPlays / totalPlays) * 100) : 0;
    
    // Get skip rate (plays with low completion percentage)
    const skipThreshold = 30; // Consider as skip if played less than 30% of song
    const skippedPlays = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM play_history 
      WHERE user_id = ${userId} 
        AND played_at >= ${daysAgo}
        AND duration > 0
        AND (play_duration * 100.0 / duration) < ${skipThreshold}
    `;
    
    const skipRate = totalPlays > 0 ? 
      Math.round((Number(skippedPlays[0].count) / totalPlays) * 100) : 0;
    
    res.json({
      discovery: {
        period: parseInt(period),
        uniqueSongs: uniqueSongs.length,
        uniqueArtists: uniqueArtists.length,
        uniqueAlbums: uniqueAlbums.length,
        totalPlays,
        diversityScore,
        completionRate,
        skipRate,
        averageNewSongsPerDay: Math.round(uniqueSongs.length / parseInt(period))
      }
    });
  } catch (err) {
    console.error('Discovery insights error:', err);
    res.status(500).json({ error: 'Failed to fetch discovery insights' });
  }
});

// Get listening mood analysis based on time of day
router.get('/mood-analysis', authenticateToken, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const userId = req.user.userId;
    
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(period));
    
    // Analyze listening patterns by time of day
    const timePatterns = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN EXTRACT(HOUR FROM played_at) BETWEEN 6 AND 11 THEN 'Morning'
          WHEN EXTRACT(HOUR FROM played_at) BETWEEN 12 AND 17 THEN 'Afternoon'
          WHEN EXTRACT(HOUR FROM played_at) BETWEEN 18 AND 22 THEN 'Evening'
          ELSE 'Night'
        END as time_period,
        COUNT(*) as plays,
        COUNT(DISTINCT artist_name) as unique_artists,
        SUM(play_duration) as total_duration
      FROM play_history 
      WHERE user_id = ${userId} 
        AND played_at >= ${daysAgo}
      GROUP BY 
        CASE 
          WHEN EXTRACT(HOUR FROM played_at) BETWEEN 6 AND 11 THEN 'Morning'
          WHEN EXTRACT(HOUR FROM played_at) BETWEEN 12 AND 17 THEN 'Afternoon'
          WHEN EXTRACT(HOUR FROM played_at) BETWEEN 18 AND 22 THEN 'Evening'
          ELSE 'Night'
        END
      ORDER BY plays DESC
    `;
    
    // Most active listening time
    const peakHour = await prisma.$queryRaw`
      SELECT 
        EXTRACT(HOUR FROM played_at) as hour,
        COUNT(*) as plays
      FROM play_history 
      WHERE user_id = ${userId} 
        AND played_at >= ${daysAgo}
      GROUP BY EXTRACT(HOUR FROM played_at)
      ORDER BY plays DESC
      LIMIT 1
    `;
    
    res.json({
      moodAnalysis: {
        period: parseInt(period),
        timePatterns: timePatterns.map(pattern => ({
          timePeriod: pattern.time_period,
          plays: Number(pattern.plays),
          uniqueArtists: Number(pattern.unique_artists),
          totalDuration: Math.round(Number(pattern.total_duration || 0) / 60),
          averageDuration: Math.round(Number(pattern.total_duration || 0) / Number(pattern.plays) / 60)
        })),
        peakListeningHour: peakHour.length > 0 ? Number(peakHour[0].hour) : null,
        peakListeningPlays: peakHour.length > 0 ? Number(peakHour[0].plays) : 0
      }
    });
  } catch (err) {
    console.error('Mood analysis error:', err);
    res.status(500).json({ error: 'Failed to fetch mood analysis' });
  }
});

// Clear play history
router.delete('/history', authenticateToken, async (req, res) => {
  try {
    const { beforeDate } = req.body;
    
    let whereClause = { userId: req.user.userId };
    
    if (beforeDate) {
      whereClause.playedAt = { lte: new Date(beforeDate) };
    }
    
    const deletedCount = await prisma.playHistory.deleteMany({
      where: whereClause
    });
    
    res.json({ 
      message: 'Play history cleared successfully',
      deletedCount: deletedCount.count 
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear play history' });
  }
});

// Export play history data
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { format = 'json', startDate, endDate } = req.query;
    
    let whereClause = { userId: req.user.userId };
    
    if (startDate || endDate) {
      whereClause.playedAt = {};
      if (startDate) whereClause.playedAt.gte = new Date(startDate);
      if (endDate) whereClause.playedAt.lte = new Date(endDate);
    }
    
    const playHistory = await prisma.playHistory.findMany({
      where: whereClause,
      orderBy: { playedAt: 'desc' },
      select: {
        songId: true,
        songName: true,
        artistName: true,
        albumName: true,
        duration: true,
        playDuration: true,
        completed: true,
        source: true,
        playedAt: true
      }
    });
    
    if (format === 'csv') {
      // Convert to CSV format
      const csv = convertToCSV(playHistory);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=listening-history.csv');
      res.send(csv);
    } else {
      // Return as JSON
      res.json({ playHistory, exportedAt: new Date() });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to export play history' });
  }
});

// Helper function to convert array to CSV
function convertToCSV(data) {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      return `"${val !== null && val !== undefined ? val.toString().replace(/"/g, '""') : ''}"`;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

export default router;