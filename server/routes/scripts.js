import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { generatePremiumScript, generateIdeas, factCheckContent } from '../services/groq.js';

const router = Router();

router.post('/generate', requireAuth, async (req, res) => {
  try {
    const { topic, niche, contentType, channelAnalysis, creatorProfile, marketIntelligence, channelName, channelCategory, language } = req.body;
    if (!topic || !niche) {
      return res.status(400).json({ error: 'Topic and niche required' });
    }

    const script = await generatePremiumScript({
      topic,
      niche,
      contentType: contentType || 'longform',
      channelAnalysis,
      creatorProfile,
      marketIntelligence,
      channelName,
      channelCategory,
      language
    });

    const { data, error } = await supabase.from('scripts').insert({
      user_id: req.user.id,
      title: script.title,
      script: script.script,
      hook: script.hook,
      topic,
      niche,
      content_type: contentType || 'longform',
      word_count: script.wordCount,
      cta: script.cta,
      raw_data: script,
      created_at: new Date().toISOString()
    }).select().single();

    if (error) console.error('Save script error:', error);

    const { error: histError } = await supabase.from('generation_history').insert({
      user_id: req.user.id,
      type: 'script',
      niche,
      content_type: contentType || 'longform',
      input: { topic, niche },
      output: { title: script.title, wordCount: script.wordCount },
      created_at: new Date().toISOString()
    });
    if (histError) console.error('History error:', histError);

    res.json(script);
  } catch (err) {
    console.error('Script generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/ideas', requireAuth, async (req, res) => {
  try {
    const { niche, channelAnalysis, marketIntelligence, contentType, count, recentTitles } = req.body;
    if (!niche) return res.status(400).json({ error: 'Niche required' });

    const ideas = await generateIdeas({
      niche,
      channelAnalysis,
      marketIntelligence,
      contentType: contentType || 'longform',
      count: count || 5,
      recentTitles: recentTitles || []
    });

    const { error: histError2 } = await supabase.from('generation_history').insert({
      user_id: req.user.id,
      type: 'ideas',
      niche,
      content_type: contentType || 'longform',
      input: { niche },
      output: { ideas: ideas.map(i => ({ title: i.title, hook: i.hook })) },
      created_at: new Date().toISOString()
    });
    if (histError2) console.error('History error:', histError2);

    res.json(ideas);
  } catch (err) {
    console.error('Ideas generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/fact-check', requireAuth, async (req, res) => {
  try {
    const { script, topic } = req.body;
    if (!script) return res.status(400).json({ error: 'Script required' });

    const result = await factCheckContent(script, topic || 'the video topic');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('scripts')
      .select('id, title, niche, content_type, word_count, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('scripts')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Script not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/history/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('scripts')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
