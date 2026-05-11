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

export default router;

