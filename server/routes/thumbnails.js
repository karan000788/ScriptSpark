import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { generateThumbnailPrompt, generateThumbnailText, detectThumbnailStyle } from '../services/groq.js';
import { generateThumbnail } from '../services/replicate.js';

const router = Router();

router.post('/generate', requireAuth, async (req, res) => {
  try {
    const { title, niche, topic, analysis, channelCategory, customPrompt } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title required' });
    }
    if (!niche && !customPrompt) {
      return res.status(400).json({ error: 'Niche required when no custom prompt' });
    }

    const prompt = customPrompt || await generateThumbnailPrompt({ title, niche, analysis, channelCategory });

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

    if (customPrompt) {
      // Strategy exploration — just return the image, no DB saves or alt generation
      return res.json({
        prompt,
        imageUrl: thumbnailUrl,
        provider,
        altPrompt: null,
        altImageUrl: null,
        error: thumbnailError
      });
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
    const { title, niche, channelCategory } = req.body;
    if (!title || !niche) {
      return res.status(400).json({ error: 'Title and niche required' });
    }
    const prompt = await generateThumbnailPrompt({ title, niche, channelCategory });
    res.json({ prompt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/text', requireAuth, async (req, res) => {
  try {
    const { title, channelCategory } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const thumbText = await generateThumbnailText(title, channelCategory);
    res.json({ thumbText });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/style', requireAuth, async (req, res) => {
  try {
    const { recentTitles } = req.body;
    if (!recentTitles || !recentTitles.length) return res.status(400).json({ error: 'Recent titles required' });
    const style = await detectThumbnailStyle(recentTitles);
    res.json(style);
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
