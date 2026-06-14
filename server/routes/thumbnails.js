import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { generateThumbnailPrompt } from '../services/groq.js';
import { generateThumbnail } from '../services/replicate.js';

const router = Router();

router.post('/generate', requireAuth, async (req, res) => {
  try {
    const { title, niche, topic, analysis } = req.body;
    if (!title || !niche) {
      return res.status(400).json({ error: 'Title and niche required' });
    }

    const prompt = await generateThumbnailPrompt({ title, niche, analysis });

    let thumbnailUrl = null;
    let provider = null;
    let thumbnailError = null;

    try {
      const result = await generateThumbnail(prompt);
      thumbnailUrl = result.url;
      provider = result.provider;
    } catch (err) {
      thumbnailError = err.message;
      console.error('Thumbnail generation failed:', err.message);
    }

    const record = {
      user_id: req.user.id,
      prompt,
      title,
      niche,
      image_url: thumbnailUrl,
      provider,
      alt_prompt: null,
      raw_data: { prompt, error: thumbnailError },
      created_at: new Date().toISOString()
    };

    const { error: dbError } = await supabase.from('thumbnails').insert(record);
    if (dbError) console.error('Save thumbnail error:', dbError);

    const { error: histError } = await supabase.from('generation_history').insert({
      user_id: req.user.id,
      type: 'thumbnail',
      niche,
      input: { title, niche },
      output: { prompt, image_url: thumbnailUrl, provider },
      created_at: new Date().toISOString()
    });
    if (histError) console.error('History error:', histError);

    const altPrompt = prompt + ' (alternative version with warmer tones and different composition)';
    let altThumbnailUrl = null;
    try {
      const altResult = await generateThumbnail(altPrompt);
      altThumbnailUrl = altResult.url;
    } catch (_) {}

    res.json({
      prompt,
      imageUrl: thumbnailUrl,
      provider,
      altPrompt,
      altImageUrl: altThumbnailUrl,
      error: thumbnailError
    });
  } catch (err) {
    console.error('Thumbnail route error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/prompt-only', requireAuth, async (req, res) => {
  try {
    const { title, niche } = req.body;
    if (!title || !niche) {
      return res.status(400).json({ error: 'Title and niche required' });
    }
    const prompt = await generateThumbnailPrompt({ title, niche });
    res.json({ prompt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('thumbnails')
      .select('id, title, niche, prompt, image_url, provider, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
