import express from 'express';
import * as photoService from '../services/photoService.js';
import { attachUser, requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/photos - Fetch curated photos based on user's style
 * Query params: style, limit (default 30)
 */
router.get('/', attachUser, async (req, res) => {
  try {
    const { style = 'modern', room = '', mood = '', query = '', context = '', limit = 30, page = 1 } = req.query;
    const userId = req.user?.uid;

    const photos = await photoService.getCuratedPhotos({
      style,
      room,
      mood,
      query,
      context,
      limit: parseInt(limit),
      page: parseInt(page),
      userId,
    });

    res.json({
      success: true,
      photos,
      count: photos.length,
    });
  } catch (error) {
    console.error('Error fetching photos:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

/**
 * POST /api/photos/:photoId/save - Save/unsave photo to user's collection
 */
router.post('/:photoId/save', attachUser, requireAuth, async (req, res) => {
  try {
    const { photoId } = req.params;
    const { saved, photo } = req.body;
    const userId = req.user.uid;

    await photoService.savePhoto({
      userId,
      photoId,
      saved,
      photo,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving photo:', error);
    res.status(500).json({ error: 'Failed to save photo' });
  }
});

/**
 * GET /api/photos/saved - Get user's saved photos
 */
router.get('/saved', attachUser, requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const photos = await photoService.getSavedPhotos(userId);

    res.json({
      success: true,
      photos,
      count: photos.length,
    });
  } catch (error) {
    console.error('Error fetching saved photos:', error);
    res.status(500).json({ error: 'Failed to fetch saved photos' });
  }
});

export default router;
