import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

// Import routers
import userRouter from './routers/user.js';
import playlistRouter from './routers/playlist.js';
import libraryRouter from './routers/library.js';
import vibeRouter from './routers/vibe.js';
import analyticsRouter from './routers/analytics.js';
import discoverRouter from './routers/discover.js';
import searchRouter from './routers/search.js';
import saavnRouter from './routers/saavn.js';
import appRouter from './routers/app.js';

const app = express();
const server = createServer(app);

// Database connection
const prisma = new PrismaClient();

async function testDbConnection() {
    try {
        await prisma.$connect();
        console.log('Database connected');
    } catch (err) {
        console.error('Database connection error:', err);
    }
}
testDbConnection();

// CORS configuration
const allowedOrigins = [
    'http://localhost:19006',
    'http://localhost:8081',
    'http://127.0.0.1:19006',
    'http://127.0.0.1:8081',
    'https://your-frontend-app-url.com'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

// Socket.IO setup for real-time features
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    // Join vibe session room
    socket.on('vibe:join', async (data) => {
        const { sessionId, userId } = data;
        socket.join(`vibe-${sessionId}`);
        console.log(`🎵 User ${userId} joined vibe session ${sessionId}`);

        // Notify other participants
        socket.to(`vibe-${sessionId}`).emit('vibe:participant_joined', {
            userId,
            sessionId
        });

        // Update user online status in database
        try {
            await prisma.user.update({
                where: { id: userId },
                data: { isOnline: true }
            });
        } catch (err) {
            console.error('Error updating user online status:', err);
        }
    });

    // Leave vibe session room
    socket.on('vibe:leave', async (data) => {
        const { sessionId, userId } = data;
        socket.leave(`vibe-${sessionId}`);
        console.log(`🎵 User ${userId} left vibe session ${sessionId}`);

        // Notify other participants
        socket.to(`vibe-${sessionId}`).emit('vibe:participant_left', {
            userId,
            sessionId
        });
    });

    // Play specific song (host control)
    socket.on('vibe:play_song', (data) => {
        const { sessionId, songId, songName, artistName, imageUrl, audioUrl } = data;
        console.log(`🎵 Playing song in session ${sessionId}: ${songName}`);

        // Broadcast to all participants except sender
        socket.to(`vibe-${sessionId}`).emit('vibe:song_changed', {
            songId,
            songName,
            artistName,
            imageUrl,
            audioUrl
        });
    });

    // Toggle play/pause
    socket.on('vibe:toggle_play_pause', (data) => {
        const { sessionId, isPlaying } = data;
        console.log(`🎵 Session ${sessionId}: ${isPlaying ? 'Playing' : 'Paused'}`);

        socket.to(`vibe-${sessionId}`).emit('vibe:play_pause', {
            isPlaying
        });
    });

    // Seek to position
    socket.on('vibe:seek_to', (data) => {
        const { sessionId, position } = data;
        console.log(`🎵 Session ${sessionId}: Seek to ${position}ms`);

        socket.to(`vibe-${sessionId}`).emit('vibe:seek', {
            position
        });
    });

    // Add song to queue
    socket.on('vibe:add_to_queue', (data) => {
        const { sessionId } = data;
        console.log(`🎵 Song added to queue in session ${sessionId}`);

        // Broadcast queue update to all participants except sender
        io.to(`vibe-${sessionId}`).emit('vibe:queue_updated', {
            queue: data
        });
    });

    // Session ended (host ended)
    socket.on('vibe:end_session', (data) => {
        const { sessionId } = data;
        console.log(`🎵 Session ${sessionId} ended`);

        // Notify all participants
        io.to(`vibe-${sessionId}`).emit('vibe:session_ended');
    });

    // Handle user status updates
    socket.on('user-online', (userId) => {
        socket.broadcast.emit('user-status-change', { userId, isOnline: true });
    });

    socket.on('user-offline', (userId) => {
        socket.broadcast.emit('user-status-change', { userId, isOnline: false });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`❌ User disconnected: ${socket.id}`);
    });
});

// Make io available to routers
app.set('io', io);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API Routes
app.use('/api/user', userRouter);
app.use('/api/playlists', playlistRouter);
app.use('/api/library', libraryRouter);
app.use('/api/vibe', vibeRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/discover', discoverRouter);
app.use('/api/search', searchRouter);
app.use('/api/saavn', saavnRouter);
app.use('/api/app', appRouter);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Diya Music App Backend API',
        version: '1.0.0',
        endpoints: {
            user: '/api/user',
            playlists: '/api/playlists',
            library: '/api/library',
            vibe: '/api/vibe',
            analytics: '/api/analytics',
            discover: '/api/discover',
            search: '/api/search',
            health: '/health'
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await prisma.$disconnect();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    await prisma.$disconnect();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`🎵 Diya Music App Backend running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`🚀 API Documentation: http://localhost:${PORT}/`);
});
