import express from 'express';
import Groq from 'groq-sdk';

const router = express.Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Health
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Image proxy
router.get('/image-proxy', async (req, res) => {
  const rawUrl = String(req.query.url || '');

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const allowedHosts = new Set(['image.pollinations.ai', 'gen.pollinations.ai', 'images.unsplash.com', 'placehold.co']);
  if (targetUrl.protocol !== 'https:' || !allowedHosts.has(targetUrl.hostname)) {
    return res.status(400).json({ error: 'Unsupported host' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const imgRes = await fetch(targetUrl, { signal: controller.signal });
    if (!imgRes.ok) throw new Error(`Failed ${imgRes.status}`);
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Unsupported image response: ${contentType}`);
    }
    
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    res.set('Cache-Control', 'public, max-age=3600');
    res.type(contentType);
    res.send(buffer);
  } catch (error) {
    res.status(502).json({ error: 'Proxy fail' });
  } finally {
    clearTimeout(timeout);
  }
});

// Public chat
router.post('/public-chat', async (req, res) => {
  const { message, scanContext = {}, userContext = {} } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  try {
    const completion = await groq.chat.completions.create({
      messages: [{
        role: 'system',
        content: "Archi: helpful interior design guide. Be practical, specific, and concise. Keep replies under 90 words unless the user asks for detail.",
      }, {
        role: 'user',
        content: `Context: ${JSON.stringify({ scanContext, userContext })}\nMessage: ${message}`,
      }],
      model: 'llama-3.3-70b-versatile',
    });
    res.json({ reply: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: 'Chat fail' });
  }
});

// Token (LiveKit)
router.get('/token', async (req, res) => {
  res.json({ token: 'Token logic in server.js (auth required)' });
});

export default router;

