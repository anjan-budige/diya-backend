# Diya Music App Backend

A robust Node.js/Express backend for the Diya Music App with PostgreSQL database and real-time features.

## Features

### 🎵 Core Music Features
- **User Management**: Registration, authentication, profiles, settings
- **Music Library**: Liked songs, albums, artists, and playlists
- **Playlists**: Create, share, collaborate on playlists
- **Play History**: Track listening habits and analytics
- **Real-time Vibe Sessions**: Multi-user synchronized music listening

### 🚀 Advanced Features
- **Real-time Communication**: Socket.IO for live features
- **Music Analytics**: Listening insights, trends, and statistics
- **Social Features**: Follow users, discover music
- **Collaborative Playlists**: Multiple users can manage playlists
- **Privacy Controls**: Granular privacy settings

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: Socket.IO
- **Authentication**: JWT tokens
- **Password Hashing**: bcryptjs

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL database
- npm or yarn

### Installation

1. **Clone and setup**
   ```bash
   cd backend
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your database and JWT secrets
   ```

3. **Database Setup**
   ```bash
   # Generate Prisma client and run migrations
   npm run db:setup
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

The backend will be running at `http://localhost:4000`

## API Documentation

### Base URL
```
http://localhost:4000/api
```

### Authentication
Include JWT token in Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Main Endpoints

#### User Management
- `POST /api/user/register` - Register new user
- `POST /api/user/login` - User login
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update profile
- `GET /api/user/settings` - Get user settings
- `PUT /api/user/settings` - Update settings

#### Music Library
- `GET /api/library/songs` - Get liked songs
- `POST /api/library/songs` - Add song to liked
- `DELETE /api/library/songs/:songId` - Remove from liked
- `GET /api/library/albums` - Get liked albums
- `GET /api/library/artists` - Get liked artists
- `GET /api/library/playlists` - Get liked playlists

#### Playlists
- `GET /api/playlists` - Get user playlists
- `POST /api/playlists` - Create new playlist
- `GET /api/playlists/:id` - Get playlist details
- `PUT /api/playlists/:id` - Update playlist
- `DELETE /api/playlists/:id` - Delete playlist
- `POST /api/playlists/:id/songs` - Add song to playlist
- `DELETE /api/playlists/:id/songs/:songId` - Remove song

#### Vibe Sessions (Real-time Music Sync)
- `GET /api/vibe/public` - Get public vibe sessions
- `POST /api/vibe` - Create new vibe session
- `GET /api/vibe/:id` - Get vibe session details
- `POST /api/vibe/:id/join` - Join vibe session
- `POST /api/vibe/:id/leave` - Leave vibe session
- `POST /api/vibe/:id/queue` - Add song to queue
- `PUT /api/vibe/:id/current-song` - Update current song

#### Analytics
- `POST /api/analytics/play` - Record song play
- `GET /api/analytics/history` - Get play history
- `GET /api/analytics/analytics` - Get listening analytics
- `GET /api/analytics/discovery` - Get discovery insights

## Database Schema

The backend uses a comprehensive PostgreSQL schema with the following main models:

### Core Models
- **User**: User accounts and profiles
- **UserSettings**: User preferences and privacy settings
- **LikedSong/Album/Artist/Playlist**: User's music library
- **Playlist & PlaylistSong**: User-created playlists
- **PlayHistory**: Listening history and analytics

### Social & Collaborative Features
- **Follow**: User following relationships
- **PlaylistCollaborator**: Collaborative playlist management
- **VibeSession & VibeParticipant**: Real-time music sessions
- **VibeQueue**: Queue management for vibe sessions

## Real-time Features

### Socket.IO Events

#### Vibe Session Events
- `join-vibe` - Join a vibe session room
- `leave-vibe` - Leave a vibe session room
- `vibe-play/pause/seek` - Playback control sync
- `vibe-next-song` - Queue advancement
- `vibe-queue-update` - Queue modifications
- `vibe-user-joined/left` - User presence updates

#### User Presence
- `user-online/offline` - User status updates
- `user-status-change` - Broadcast status changes

## Development

### Scripts
```bash
npm run dev              # Start development server
npm run start            # Start production server
npm run prisma:migrate   # Run database migrations
npm run prisma:generate  # Generate Prisma client
npm run prisma:studio    # Open Prisma Studio
npm run db:setup         # Complete database setup
```

### Project Structure
```
backend/
├── src/
│   ├── index.js           # Main server file
│   └── routers/
│       ├── user.js        # User management
│       ├── playlist.js    # Playlist operations
│       ├── library.js     # Music library
│       ├── vibe.js        # Vibe sessions
│       └── analytics.js   # Play history & analytics
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── migrations/        # Database migrations
└── package.json
```

## Security Features

- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcryptjs with salt rounds
- **CORS Protection**: Configured allowed origins
- **Input Validation**: Request validation and sanitization
- **Rate Limiting**: Built-in Express security

## Deployment

### Environment Variables
Set these in production:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Strong JWT signing secret
- `JWT_REFRESH_SECRET`: Refresh token secret
- `NODE_ENV=production`
- `ALLOWED_ORIGINS`: Production frontend URLs

### Production Considerations
- Use a managed PostgreSQL service
- Set up proper monitoring and logging
- Configure SSL/TLS certificates
- Set up backup strategies
- Use process managers like PM2

## Integration with Frontend

This backend is designed to work with the React Native Diya Music App. The frontend should:

1. **Authentication Flow**
   - Store JWT tokens securely
   - Handle token refresh
   - Implement login/logout

2. **Music Integration**
   - Use JioSaavn API for music data
   - Send play events to analytics endpoint
   - Sync library state with backend

3. **Real-time Features**
   - Connect to Socket.IO for vibe sessions
   - Handle real-time events for music sync
   - Update UI based on socket events

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with proper testing
4. Submit pull request

## License

MIT License - See LICENSE file for details