import express from 'express';
import { 
  getAlbumDetails, 
  getSongsByIds, 
  getArtistDetails, 
  getArtistSongs, 
  getArtistAlbums,
  getPlaylistDetails
} from '../services/saavnService.js';

const router = express.Router();

// Get album details by ID
router.get('/albums/:albumId', async (req, res) => {
  try {
    const { albumId } = req.params;
    
    if (!albumId) {
      return res.status(400).json({ error: 'Album ID is required' });
    }

    console.log('🎵 Backend: Fetching album details for ID:', albumId);
    const albumData = await getAlbumDetails(albumId);
    
    if (!albumData) {
      return res.status(404).json({ error: 'Album not found' });
    }

    console.log('🎵 Backend: Album data received:', {
      id: albumData.id,
      name: albumData.name,
      songsCount: albumData.songs?.length || 0
    });

    res.json({
      success: true,
      album: albumData
    });
  } catch (error) {
    console.error('🎵 Backend: Album details error:', error);
    res.status(500).json({ error: 'Failed to fetch album details' });
  }
});

// Get songs by IDs
router.get('/songs', async (req, res) => {
  try {
    const { ids } = req.query;
    
    if (!ids) {
      return res.status(400).json({ error: 'Song IDs are required' });
    }

    const songIds = ids.split(',').map(id => id.trim()).filter(id => id);
    console.log('🎵 Backend: Fetching songs for IDs:', songIds);
    
    const songsData = await getSongsByIds(songIds);
    console.log('🎵 Backend: Songs data received:', songsData);
    
    res.json({
      success: true,
      songs: songsData.songs || songsData || []
    });
  } catch (error) {
    console.error('🎵 Backend: Songs by IDs error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch songs',
      songs: []
    });
  }
});

// Get artist details by ID
router.get('/artists/:artistId', async (req, res) => {
  try {
    const { artistId } = req.params;
    
    if (!artistId) {
      return res.status(400).json({ error: 'Artist ID is required' });
    }

    console.log('🎤 Backend: Fetching artist details for ID:', artistId);
    const artistData = await getArtistDetails(artistId);
    
    if (!artistData) {
      return res.status(404).json({ error: 'Artist not found' });
    }

    console.log('🎤 Backend: Artist data received:', {
      id: artistData.id,
      name: artistData.name,
      topSongsCount: artistData.topSongs?.length || 0,
      topAlbumsCount: artistData.topAlbums?.length || 0
    });

    res.json({
      success: true,
      artist: artistData
    });
  } catch (error) {
    console.error('🎤 Backend: Artist details error:', error);
    res.status(500).json({ error: 'Failed to fetch artist details' });
  }
});

// Get artist songs
router.get('/artists/:artistId/songs', async (req, res) => {
  try {
    const { artistId } = req.params;
    const { limit = 20 } = req.query;
    
    if (!artistId) {
      return res.status(400).json({ error: 'Artist ID is required' });
    }

    const songsData = await getArtistSongs(artistId, parseInt(limit));
    
    res.json({
      success: true,
      songs: songsData.songs || songsData || []
    });
  } catch (error) {
    console.error('Artist songs error:', error);
    res.status(500).json({ error: 'Failed to fetch artist songs' });
  }
});

// Get artist albums
router.get('/artists/:artistId/albums', async (req, res) => {
  try {
    const { artistId } = req.params;
    const { limit = 20 } = req.query;
    
    if (!artistId) {
      return res.status(400).json({ error: 'Artist ID is required' });
    }

    const albumsData = await getArtistAlbums(artistId, parseInt(limit));
    
    res.json({
      success: true,
      albums: albumsData.albums || albumsData || []
    });
  } catch (error) {
    console.error('Artist albums error:', error);
    res.status(500).json({ error: 'Failed to fetch artist albums' });
  }
});

// Get playlist details by ID
router.get('/playlists/:playlistId', async (req, res) => {
  try {
    const { playlistId } = req.params;
    
    if (!playlistId) {
      return res.status(400).json({ error: 'Playlist ID is required' });
    }

    console.log('🎶 Backend: Fetching playlist details for ID:', playlistId);
    const playlistData = await getPlaylistDetails(playlistId);
    
    if (!playlistData) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    console.log('🎶 Backend: Playlist data received:', {
      id: playlistData.id,
      name: playlistData.name,
      songsCount: playlistData.songs?.length || 0
    });

    res.json({
      success: true,
      playlist: playlistData
    });
  } catch (error) {
    console.error('🎶 Backend: Playlist details error:', error);
    res.status(500).json({ error: 'Failed to fetch playlist details' });
  }
});

export default router;
