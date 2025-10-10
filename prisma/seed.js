import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create sample users
  const user1 = await prisma.user.upsert({
    where: { email: 'demo@diyamusic.com' },
    update: {},
    create: {
      email: 'demo@diyamusic.com',
      fullname: 'Demo User',
      password: '$2a$10$xGFQD9q6gTgFQdKQZo9Q5uBQ9QF6DfHXJW8oHvfxTIFG8AaNXKFay', // password: demo123
      language: 'en',
      bio: 'Music lover and demo user for Diya Music App',
      isOnline: false
    }
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'john@example.com' },
    update: {},
    create: {
      email: 'john@example.com',
      fullname: 'John Doe',
      password: '$2a$10$xGFQD9q6gTgFQdKQZo9Q5uBQ9QF6DfHXJW8oHvfxTIFG8AaNXKFay', // password: demo123
      language: 'en',
      bio: 'Indie rock enthusiast',
      isOnline: false
    }
  });

  console.log('✅ Sample users created');

  // Create user settings for demo users
  await prisma.userSettings.upsert({
    where: { userId: user1.id },
    update: {},
    create: {
      userId: user1.id,
      audioQuality: '320',
      downloadQuality: '320',
      profilePublic: true,
      showActivity: true,
      showPlaylists: true
    }
  });

  await prisma.userSettings.upsert({
    where: { userId: user2.id },
    update: {},
    create: {
      userId: user2.id,
      audioQuality: '160',
      downloadQuality: '320',
      profilePublic: true,
      showActivity: false,
      showPlaylists: true
    }
  });

  console.log('✅ User settings created');

  // Create sample playlists
  const playlist1 = await prisma.playlist.create({
    data: {
      name: 'My Favorites',
      description: 'Collection of my all-time favorite songs',
      isPublic: true,
      userId: user1.id
    }
  });

  const playlist2 = await prisma.playlist.create({
    data: {
      name: 'Chill Vibes',
      description: 'Perfect for relaxing and unwinding',
      isPublic: true,
      userId: user1.id
    }
  });

  const playlist3 = await prisma.playlist.create({
    data: {
      name: 'Rock Classics',
      description: 'Best rock songs of all time',
      isPublic: true,
      userId: user2.id
    }
  });

  console.log('✅ Sample playlists created');

  // Add sample liked songs
  const sampleSongs = [
    {
      userId: user1.id,
      songId: 'sample_song_1',
      songName: 'Imagine',
      artistName: 'John Lennon',
      albumName: 'Imagine',
      duration: 183
    },
    {
      userId: user1.id,
      songId: 'sample_song_2',
      songName: 'Bohemian Rhapsody',
      artistName: 'Queen',
      albumName: 'A Night at the Opera',
      duration: 355
    },
    {
      userId: user2.id,
      songId: 'sample_song_3',
      songName: 'Hotel California',
      artistName: 'Eagles',
      albumName: 'Hotel California',
      duration: 391
    }
  ];

  for (const song of sampleSongs) {
    await prisma.likedSong.upsert({
      where: {
        userId_songId: {
          userId: song.userId,
          songId: song.songId
        }
      },
      update: {},
      create: song
    });
  }

  console.log('✅ Sample liked songs created');

  // Add sample liked artists
  const sampleArtists = [
    {
      userId: user1.id,
      artistId: 'artist_1',
      artistName: 'The Beatles',
      isVerified: true
    },
    {
      userId: user1.id,
      artistId: 'artist_2',
      artistName: 'Led Zeppelin',
      isVerified: true
    },
    {
      userId: user2.id,
      artistId: 'artist_3',
      artistName: 'Pink Floyd',
      isVerified: true
    }
  ];

  for (const artist of sampleArtists) {
    await prisma.likedArtist.upsert({
      where: {
        userId_artistId: {
          userId: artist.userId,
          artistId: artist.artistId
        }
      },
      update: {},
      create: artist
    });
  }

  console.log('✅ Sample liked artists created');

  // Add sample play history
  const samplePlayHistory = [
    {
      userId: user1.id,
      songId: 'sample_song_1',
      songName: 'Imagine',
      artistName: 'John Lennon',
      duration: 183,
      playDuration: 183,
      completed: true,
      source: 'search',
      playedAt: new Date(Date.now() - 1000 * 60 * 60 * 2) // 2 hours ago
    },
    {
      userId: user1.id,
      songId: 'sample_song_2',
      songName: 'Bohemian Rhapsody',
      artistName: 'Queen',
      duration: 355,
      playDuration: 200,
      completed: false,
      source: 'playlist',
      sourceId: playlist1.id.toString(),
      playedAt: new Date(Date.now() - 1000 * 60 * 30) // 30 minutes ago
    }
  ];

  for (const play of samplePlayHistory) {
    await prisma.playHistory.create({
      data: play
    });
  }

  console.log('✅ Sample play history created');

  // Create a sample vibe session
  const vibeSession = await prisma.vibeSession.create({
    data: {
      name: 'Weekend Vibes',
      description: 'Chill music for the weekend',
      isPublic: true,
      creatorId: user1.id,
      isActive: true,
      allowGuestControl: true
    }
  });

  // Add user1 as participant in their own vibe session
  await prisma.vibeParticipant.create({
    data: {
      sessionId: vibeSession.id,
      userId: user1.id,
      role: 'admin',
      isActive: true
    }
  });

  console.log('✅ Sample vibe session created');

  console.log('🎉 Database seed completed successfully!');
  console.log(`
📊 Summary:
- Users: 2 (demo@diyamusic.com, john@example.com)
- Playlists: 3
- Liked Songs: 3
- Liked Artists: 3
- Play History: 2 records
- Vibe Sessions: 1

🔑 Demo Login:
Email: demo@diyamusic.com
Password: demo123

Email: john@example.com  
Password: demo123
  `);
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });