import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import {
  getChannelIdFromUrl, analyzeChannel, getChannelStats, getChannelVideos,
  searchTopChannels, generateMarketIntelligence
} from '../services/youtube.js';
import { generateCreatorProfile, generateIdeas } from '../services/groq.js';

const router = Router();

router.post('/analyze', requireAuth, async (req, res) => {
  try {
    const { channelUrl, channelName, contentType } = req.body;
    if (!channelUrl) return res.status(400).json({ error: 'Channel URL required' });

    const channelId = await getChannelIdFromUrl(channelUrl);
    const analysis = await analyzeChannel(channelId, channelName);

    await supabase.from('channel_analysis').insert({
      user_id: req.user.id,
      channel_id: analysis.channelInfo.id,
      channel_name: analysis.channelInfo.name,
      channel_url: channelUrl,
      subscribers: analysis.channelInfo.subscribers,
      total_views: analysis.channelInfo.totalViews,
      total_videos: analysis.channelInfo.totalVideos,
      average_views: analysis.performance.averageViews,
      engagement_rate: analysis.performance.engagementRate,
      upload_frequency: analysis.performance.uploadFrequency,
      best_videos: analysis.bestVideos,
      worst_videos: analysis.worstVideos,
      viral_topics: analysis.viralTopics,
      title_patterns: analysis.titlePatterns,
      raw_data: analysis,
      analysis_date: new Date().toISOString()
    });

    await supabase.from('channels').upsert({
      user_id: req.user.id,
      channel_id: analysis.channelInfo.id,
      name: analysis.channelInfo.name,
      subscribers: analysis.channelInfo.subscribers,
      total_views: analysis.channelInfo.totalViews,
      total_videos: analysis.channelInfo.totalVideos,
      thumbnail: analysis.channelInfo.thumbnail,
      description: analysis.channelInfo.description
    }, { onConflict: 'user_id,channel_id' });

    const creatorProfile = await generateCreatorProfile({
      channelAnalysis: analysis,
      niche: '',
      contentType: contentType || 'longform'
    });

    await supabase.from('creator_profiles').upsert({
      user_id: req.user.id,
      channel_id: analysis.channelInfo.id,
      best_topics: creatorProfile.bestTopics || [],
      best_hooks: creatorProfile.bestHooks || [],
      best_title_styles: creatorProfile.bestTitleStyles || [],
      thumbnail_style: creatorProfile.thumbnailStyle || '',
      upload_pattern: creatorProfile.uploadPattern || '',
      average_engagement: creatorProfile.averageEngagement || '',
      recommended_content_type: creatorProfile.recommendedContentType || '',
      growth_opportunities: creatorProfile.growthOpportunities || [],
      content_gaps: creatorProfile.contentGaps || [],
      raw_data: creatorProfile,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,channel_id' });

    res.json({
      analysis,
      creatorProfile,
      channelId: analysis.channelInfo.id
    });
  } catch (err) {
    console.error('Channel analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/:channelId', requireAuth, async (req, res) => {
  try {
    const stats = await getChannelStats(req.params.channelId);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/search-competitors', requireAuth, async (req, res) => {
  try {
    const { niche, targetAudience, language, country } = req.body;
    if (!niche) return res.status(400).json({ error: 'Niche required' });

    const intelligence = await generateMarketIntelligence(niche, targetAudience, language, country);

    await supabase.from('competitor_analysis').insert({
      user_id: req.user.id,
      niche,
      target_audience: targetAudience || '',
      language: language || 'en',
      country: country || '',
      top_channels: intelligence.topChannels,
      channel_analyses: intelligence.channelAnalyses,
      market_patterns: intelligence.marketPatterns,
      raw_data: intelligence,
      created_at: new Date().toISOString()
    });

    res.json(intelligence);
  } catch (err) {
    console.error('Competitor search error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/auto-fetch', requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    const channelId = await getChannelIdFromUrl(url);
    const stats = await getChannelStats(channelId);
    const videos = await getChannelVideos(channelId, 15);
    const recentTitles = videos.map(v => v.title);

    const categoryKeywords = {
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

    let detectedCategory = 'General';
    let maxScore = 0;
    const titleText = recentTitles.join(' ').toLowerCase();
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
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

    const recentThumbnails = videos.map(v => v.thumbnails?.high?.url || v.thumbnails?.medium?.url || null).filter(Boolean);

    res.json({ channelId: stats.channelId, name: stats.title, description: stats.description, subscribers: stats.subscribers, totalVideos: stats.totalVideos, thumbnail: stats.thumbnail, recentTitles, detectedCategory, recentThumbnails });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/channel-id', requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    const channelId = await getChannelIdFromUrl(url);
    res.json({ channelId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
