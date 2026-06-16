// Response field name imageUrl matches existing frontend expectation (app.js accesses r.imageUrl)
import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { getChannelIdFromUrl, getChannelStats, getChannelVideos } from '../services/youtube.js';
import { generateIdeas, generatePremiumScript, generateThumbnailPrompt } from '../services/groq.js';
import { generateThumbnail } from '../services/replicate.js';

const router = Router();

const CATEGORY_KEYWORDS = {
  'Dark Mystery': ['raaz', 'mystery', 'horror', 'dark', 'sach', 'bhoot', 'paranormal', 'ghost', 'darr', 'secret', 'haunting', 'strange'],
  'Finance': ['paise', 'invest', 'finance', 'earn', 'money', 'wealth', 'stock', 'crore', 'lakh', 'budget', 'saving', 'profit'],
  'Gaming': ['gaming', 'gameplay', 'trick', 'gta', 'pubg', 'fortnite', 'minecraft', 'gamer', 'game', 'pro player', 'gameplay'],
  'True Crime': ['crime', 'murder', 'case', 'killing', 'mystery crime', 'criminal', 'investigation', 'forensic', 'justice'],
  'Tech': ['tech', 'review', 'gadget', 'mobile', 'iphone', 'android', 'laptop', 'unboxing', 'technology'],
  'Motivation': ['motivation', 'inspire', 'success', 'life', 'mindset', 'goal', 'discipline', 'powerful'],
  'Education': ['education', 'learn', 'science', 'history', 'knowledge', 'fact', 'study', 'course'],
  'History': ['history', 'ancient', 'battle', 'empire', 'war', 'medieval', 'historic', 'archaeology'],
  'Food': ['food', 'recipe', 'cooking', 'kitchen', 'tasty', 'delicious', 'street food', 'restaurant'],
  'Travel': ['travel', 'vlog', 'trip', 'journey', 'wander', 'explore', 'traveling', 'holiday'],
  'Health': ['health', 'fitness', 'yoga', 'exercise', 'workout', 'diet', 'weight loss', 'healthy'],
  'Relationships': ['relationship', 'love', 'dating', 'breakup', 'crush', 'couple', 'emotional', 'heart'],
  'Business': ['business', 'startup', 'entrepreneur', 'hustle', 'business idea', 'marketing', 'sales', 'brand'],
  'Mythology': ['mythology', 'myth', 'god', 'goddess', 'demon', 'legend', 'epic', 'ancient story'],
  'Astrology': ['astrology', 'zodiac', 'horoscope', 'rashi', 'kundli', 'planet', 'star', 'astro']
};

function detectCategory(titles) {
  let detectedCategory = 'General';
  let maxScore = 0;
  const titleText = titles.join(' ').toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = titleText.match(regex);
      if (matches) score += matches.length;
    }
    if (score > maxScore) {
      maxScore = score;
      detectedCategory = category;
    }
  }
  return detectedCategory;
}

function detectLanguage(titles) {
  const combined = titles.join(' ').toLowerCase();
  const hindiPattern = /[।॥ॐ]|क[ा-ौ]|ह[ैं]|म[ें]|क[ो]|स[े]|न[े]|व[ा]|प[र]|ब[ा]|ए[क]|औ[र]|त[क]|[०-९]/;
  if (hindiPattern.test(combined)) {
    const romanizedHindi = /hai|hain|ka|ko|se|mein|ki|ke|tha|the|nahi|aur|ya|bahut|kya|yeh|woh|iska|uska/i;
    if (romanizedHindi.test(combined)) return 'en-hi';
    return 'hi';
  }
  return 'en';
}

function extractTopicTitle(topic) {
  if (typeof topic === 'string') return topic;
  if (topic && typeof topic === 'object' && topic.title) return topic.title;
  return null;
}

// POST /api/pipeline/topics
router.post('/topics', requireAuth, async (req, res) => {
  try {
    const { channelUrl } = req.body;
    if (!channelUrl) return res.status(400).json({ error: 'Channel URL required' });

    const channelId = await getChannelIdFromUrl(channelUrl);
    const stats = await getChannelStats(channelId);
    const videos = await getChannelVideos(channelId, 15);
    const recentTitles = videos.map(v => v.title);

    const category = detectCategory(recentTitles);
    const language = detectLanguage(recentTitles);

    const channelContext = {
      name: stats.title,
      niche: category,
      language
    };

    const topics = await generateIdeas({
      niche: category,
      contentType: 'longform',
      count: 5,
      recentTitles
    });

    await supabase.from('generation_history').insert({
      user_id: req.user.id,
      type: 'pipeline_topics',
      input: { channelUrl, channelName: stats.title },
      output: { channelContext, topics: topics.map(t => ({ title: t.title, hook: t.hook })) },
      created_at: new Date().toISOString()
    }).catch(err => console.error('History error:', err));

    res.json({ channelContext, topics });
  } catch (err) {
    console.error('Pipeline topics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pipeline/script
router.post('/script', requireAuth, async (req, res) => {
  try {
    const { channelContext, selectedTopic, format } = req.body;

    if (!channelContext || !selectedTopic) {
      return res.status(400).json({ error: 'Complete topic selection first.' });
    }

    const topic = extractTopicTitle(selectedTopic);
    if (!topic) {
      return res.status(400).json({ error: 'Complete topic selection first.' });
    }

    const contentType = (format === 'shorts' || format === 'short') ? 'shorts' : 'longform';

    const script = await generatePremiumScript({
      topic,
      niche: channelContext.niche || 'General',
      contentType,
      channelName: channelContext.name || '',
      channelCategory: channelContext.niche || 'General',
      language: channelContext.language || 'en'
    });

    await supabase.from('generation_history').insert({
      user_id: req.user.id,
      type: 'pipeline_script',
      input: { topic, channelContext },
      output: { title: script.title, wordCount: script.wordCount },
      created_at: new Date().toISOString()
    }).catch(err => console.error('History error:', err));

    res.json({ script });
  } catch (err) {
    console.error('Pipeline script error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pipeline/thumbnail
router.post('/thumbnail', requireAuth, async (req, res) => {
  try {
    const { channelContext, script } = req.body;

    if (!script || !script.title || !script.script) {
      return res.status(400).json({ error: 'Generate the script first.' });
    }

    const prompt = await generateThumbnailPrompt({
      title: script.title,
      niche: (channelContext && channelContext.niche) || 'General',
      channelCategory: (channelContext && channelContext.niche) || 'General'
    });

    const result = await generateThumbnail(prompt, (channelContext && channelContext.niche) || 'General');

    await supabase.from('generation_history').insert({
      user_id: req.user.id,
      type: 'pipeline_thumbnail',
      input: { scriptTitle: script.title, channelContext },
      output: { imageUrl: result.url, prompt, provider: result.provider },
      created_at: new Date().toISOString()
    }).catch(err => console.error('History error:', err));

    res.json({
      imageUrl: result.url,
      prompt,
      provider: result.provider
    });
  } catch (err) {
    console.error('Pipeline thumbnail error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
