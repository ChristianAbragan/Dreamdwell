import express from 'express';
import { PrismaClient } from '@prisma/client';
import { attachUser, requireAuth } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

router.post('/save-session', attachUser, requireAuth, async (req, res) => {
  const { summary, suggestions, imageUrl, style, goal } = req.body;
  const userId = req.user?.uid;

  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Authentication required to save session.' });
  }

  try {
    const session = await prisma.session.create({
      data: {
        userId,
        summary,
        suggestions: typeof suggestions === 'string' ? suggestions : JSON.stringify(suggestions),
        imageUrl,
        style,
        goal,
        date: new Date().toLocaleDateString(),
      },
    });
    console.log(`Session archived for user: ${userId}`);
    res.json(session);
  } catch (error) {
    console.error('Vault error:', error.message);
    res.status(500).json({ error: 'Vault write failure.' });
  }
});

router.get('/:userId', attachUser, requireAuth, async (req, res) => {
  const { userId } = req.params;

  if (req.user.uid !== userId) {
    return res.status(403).json({ error: 'Forbidden: You can only access your own sessions.' });
  }

  try {
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Could not retrieve archives.' });
  }
});

router.delete('/:sessionId', attachUser, requireAuth, async (req, res) => {
  const sessionId = Number(req.params.sessionId);

  if (!Number.isInteger(sessionId)) {
    return res.status(400).json({ error: 'Invalid session id.' });
  }

  try {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return res.status(404).json({ error: 'Archive item not found.' });
    if (session.userId !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own archive items.' });
    }

    await prisma.session.delete({ where: { id: sessionId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Archive delete error:', error.message);
    res.status(500).json({ error: 'Could not delete archive item.' });
  }
});

router.delete('/user/:userId/clear', attachUser, requireAuth, async (req, res) => {
  const { userId } = req.params;
  const { type = 'all' } = req.query;

  if (req.user.uid !== userId) {
    return res.status(403).json({ error: 'Forbidden: You can only clear your own archive.' });
  }

  const where = { userId };
  if (type === 'inspiration') where.goal = 'INSPIRATION_SAVE';
  if (type === 'analysis') where.goal = { not: 'INSPIRATION_SAVE' };

  try {
    const result = await prisma.session.deleteMany({ where });
    res.json({ success: true, count: result.count });
  } catch (error) {
    console.error('Archive clear error:', error.message);
    res.status(500).json({ error: 'Could not clear archive.' });
  }
});

export default router;

