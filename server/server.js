import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureTemplates } from './services/templates.js';
import authRoutes from './routes/auth.js';
import youtubeRoutes from './routes/youtube.js';
import scriptRoutes from './routes/scripts.js';
import thumbnailRoutes from './routes/thumbnails.js';
import pipelineRoutes from './routes/contentPipeline.js';
import setupRoutes from './routes/setup.js';

dotenv.config();
ensureTemplates();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || origin === 'null') {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' }
});

app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/scripts', scriptRoutes);
app.use('/api/thumbnails', thumbnailRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/setup', setupRoutes);

app.use(express.static(path.join(__dirname, '..')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '3.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Creatora API running on port ${PORT}`);
  console.log(`Supabase: ${process.env.SUPABASE_URL ? 'configured' : 'missing'}`);
  console.log(`YouTube API: ${process.env.YOUTUBE_API_KEY ? 'configured' : 'missing'}`);
  console.log(`Groq API: ${process.env.GROQ_API_KEY ? 'configured' : 'missing'}`);
  console.log(`HuggingFace API: ${process.env.HF_ACCESS_TOKEN ? 'configured' : 'missing'}`);
  console.log('Thumbnail templates: loaded');
});
