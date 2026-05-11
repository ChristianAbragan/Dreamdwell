import express from 'express';
import fs from 'fs';
import cors from 'cors';
import Groq from 'groq-sdk';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import photosRouter from './routes/photos.js';
import sessionsRouter from './routes/sessions.js';
import roomsRouter from './routes/rooms.js';
import publicRouter from './routes/public.js';
import placesRouter from './routes/places.js';

dotenv.config();

const app = express();

// Firebase Admin SDK
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
      console.log('Firebase Admin: Initialized from ENV');
    } else if (fs.existsSync('./serviceAccountKey.json')) {
      const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
      console.log(`Firebase Admin: Initialized with project ${serviceAccount.project_id}`);
    } else {
      admin.initializeApp();
      console.log('Firebase Admin: Default init');
    }
  } catch (error) {
    console.warn(`Firebase skipped: ${error.message}`);
  }
}

// Prisma
let prisma;
try {
  prisma = new PrismaClient();
  prisma.$connect().catch(() => console.warn('Prisma: in-memory mode'));
} catch (e) {
  console.warn('Prisma warning:', e.message);
  prisma = null;
}

// Config
const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Error handling
process.on('unhandledRejection', (err) => console.error('Unhandled:', err.message));
process.on('uncaughtException', (err) => console.error('Crash:', err.message));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Routes
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '25mb' }));

app.use('/api/photos', photosRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/public', publicRouter);
app.use('/api/places', placesRouter);

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

groq.models
  .list()
  .then((list) => console.log('Available models:', list.data.map((model) => model.id)))
  .catch((error) => console.warn('Groq models:', error.message));

app.listen(PORT, () => console.log(`Archi Core active on port ${PORT}`));

// Prevent exit
process.stdin.resume();
