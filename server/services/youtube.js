import dotenv from 'dotenv';
dotenv.config();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const BASE_URL = 'https://www.googleapis.com/youtube/v3';

if (!YOUTUBE_API_KEY) {
  console.error('Missing YOUTUBE_API_KEY in environment');
  process.exit(1);
}

async function fetchYouTube(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set('key', YOUTUBE_API_KEY);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `YouTube API error: ${res.status}`);
  }
  return res.json();
}

export async function getChannelIdFromUrl(channelUrl) {
  channelUrl = channelUrl.trim().replace(/\/$/, '');
  const patterns = [
    /youtube\.com\/channel\/([\w-]+)/,
    /youtube\.com\/@([\w-]+)/,
    /youtube\.com\/c\/([\w-]+)/,
    /youtube\.com\/user\/([\w-]+)/
  ];
  for (const p of patterns) {
    const m = channelUrl.match(p);
    if (m) {
      const handle = m[1];
      if (channelUrl.includes('/channel/')) return handle;
      const data = await searchChannel(handle);
      if (data) return data;
    }
  }
  const name = channelUrl.split('/').pop() || channelUrl;
  const data = await searchChannel(name);
  if (data) return data;
  throw new Error('Could not find channel. Check the URL and try again.');
}

async function searchChannel(query) {
  const data = await fetchYouTube('search', {
    part: 'snippet',
    q: query,
    type: 'channel',
    maxResults: 1
  });
  return data.items?.[0]?.snippet?.channelId || null;
}

export async function getChannelStats(channelId) {
  const data = await fetchYouTube('channels', {
    part: 'statistics,snippet,contentDetails',
    id: channelId
  });
  const item = data.items?.[0];
  if (!item) throw new Error('Channel not found');
  return {
    channelId: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    thumbnail: item.snippet.thumbnails?.default?.url,
    country: item.snippet.country || null,
    publishedAt: item.snippet.publishedAt,
    subscribers: parseInt(item.statistics.subscriberCount) || 0,
    totalViews: parseInt(item.statistics.viewCount) || 0,
    totalVideos: parseInt(item.statistics.videoCount) || 0,
    uploadPlaylistId: item.contentDetails.relatedPlaylists?.uploads
  };
}

export async function getChannelVideos(channelId, maxResults = 50) {
  const stats = await getChannelStats(channelId);
  if (!stats.uploadPlaylistId) throw new Error('No upload playlist found');

  const allVideos = [];
  let nextPageToken = null;

  while (allVideos.length < maxResults) {
    const params = {
      part: 'snippet,contentDetails',
      playlistId: stats.uploadPlaylistId,
      maxResults: Math.min(50, maxResults - allVideos.length)
    };
    if (nextPageToken) params.pageToken = nextPageToken;

    const data = await fetchYouTube('playlistItems', params);
    const items = data.items || [];
    for (const item of items) {
      allVideos.push({
        videoId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        thumbnails: item.snippet.thumbnails
      });
    }
    nextPageToken = data.nextPageToken || null;
    if (!nextPageToken) break;
  }
  return allVideos;
}

export async function getVideoStats(videoIds) {
  const results = [];
  const chunkSize = 50;
  for (let i = 0; i < videoIds.length; i += chunkSize) {
    const chunk = videoIds.slice(i, i + chunkSize);
    const data = await fetchYouTube('videos', {
      part: 'statistics,snippet,contentDetails',
      id: chunk.join(','),
      maxResults: 50
    });
    const items = data.items || [];
    for (const item of items) {
      results.push({
        videoId: item.id,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        views: parseInt(item.statistics.viewCount) || 0,
        likes: parseInt(item.statistics.likeCount) || 0,
        comments: parseInt(item.statistics.commentCount) || 0,
        categoryId: item.snippet.categoryId,
        duration: item.contentDetails?.duration || null
      });
    }
  }
  return results;
}

export async function analyzeChannel(channelId, channelName) {
  const channelInfo = await getChannelStats(channelId);
  const videos = await getChannelVideos(channelId, 50);
  const videoIds = videos.map(v => v.videoId);
  const stats = await getVideoStats(videoIds);

  const videoMap = new Map(stats.map(v => [v.videoId, v]));
  const enriched = videos.map(v => ({
    ...v,
    ...(videoMap.get(v.videoId) || { views: 0, likes: 0, comments: 0, duration: null })
  })).sort((a, b) => b.views - a.views);

  const withViews = enriched.filter(v => v.views > 0);
  const totalViews = withViews.reduce((s, v) => s + v.views, 0);
  const avgViews = withViews.length ? Math.round(totalViews / withViews.length) : 0;

  const bestVideos = enriched.slice(0, 5).map(v => ({
    title: v.title,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    videoId: v.videoId,
    duration: v.duration
  }));

  const worstVideos = enriched.filter(v => v.views > 0).slice(-5).map(v => ({
    title: v.title,
    views: v.views,
    videoId: v.videoId,
    duration: v.duration
  }));

  const titles = enriched.map(v => v.title);
  const titlePatterns = extractPatterns(titles);

  const uploadDates = enriched.map(v => new Date(v.publishedAt).getTime()).filter(t => !isNaN(t));
  const uploadFrequency = calculateUploadFrequency(uploadDates);

  const viralThreshold = avgViews * 3;
  const viralVideos = enriched.filter(v => v.views >= viralThreshold);

  const totalWithViews = enriched.filter(v => v.views > 0).length;
  const engagementRate = totalWithViews > 0
    ? Math.round((stats.reduce((s, v) => s + v.likes + v.comments, 0) / totalViews) * 100)
    : 0;

  return {
    channelInfo: {
      id: channelInfo.channelId,
      name: channelInfo.title,
      subscribers: channelInfo.subscribers,
      totalViews: channelInfo.totalViews,
      totalVideos: channelInfo.totalVideos,
      description: channelInfo.description,
      thumbnail: channelInfo.thumbnail,
      country: channelInfo.country,
      publishedAt: channelInfo.publishedAt
    },
    performance: {
      averageViews: avgViews,
      medianViews: median(withViews.map(v => v.views)),
      totalViews,
      engagementRate,
      uploadFrequency,
      totalAnalyzed: enriched.length
    },
    bestVideos,
    worstVideos,
    viralTopics: viralVideos.map(v => v.title),
    titlePatterns,
    analysisDate: new Date().toISOString()
  };
}

function extractPatterns(titles) {
  const patterns = {
    questionTitles: 0,
    numberTitles: 0,
    emotionalWords: 0,
    commonWords: {}
  };
  const emotions = ['shocking', 'crazy', 'insane', 'unbelievable', 'mind blowing', 'huge', 'secret', 'truth', 'worst', 'best', 'scary', 'strange', 'amazing', 'incredible', 'terrifying', 'heartbreaking'];
  for (const title of titles) {
    if (title.includes('?')) patterns.questionTitles++;
    if (/\d+/.test(title)) patterns.numberTitles++;
    const lower = title.toLowerCase();
    for (const word of emotions) {
      if (lower.includes(word)) {
        patterns.emotionalWords++;
        break;
      }
    }
    const words = lower.split(/\s+/);
    for (const w of words) {
      if (w.length > 3) {
        patterns.commonWords[w] = (patterns.commonWords[w] || 0) + 1;
      }
    }
  }
  patterns.topWords = Object.entries(patterns.commonWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));
  delete patterns.commonWords;
  const total = titles.length || 1;
  patterns.questionTitlePct = Math.round((patterns.questionTitles / total) * 100);
  patterns.numberTitlePct = Math.round((patterns.numberTitles / total) * 100);
  patterns.emotionalTitlePct = Math.round((patterns.emotionalWords / total) * 100);
  return patterns;
}

function calculateUploadFrequency(dates) {
  if (dates.length < 2) return 'insufficient data';
  dates.sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push(dates[i] - dates[i - 1]);
  }
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const days = avgGap / (1000 * 60 * 60 * 24);
  if (days < 1.5) return 'daily';
  if (days < 4) return '2-3 times per week';
  if (days < 8) return 'weekly';
  if (days < 15) return 'bi-weekly';
  return 'monthly';
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export async function searchTopChannels(niche, maxResults = 10) {
  const data = await fetchYouTube('search', {
    part: 'snippet',
    q: niche,
    type: 'channel',
    order: 'relevance',
    maxResults
  });
  const channels = data.items || [];
  const results = [];
  for (const ch of channels) {
    const id = ch.snippet.channelId;
    const stats = await getChannelStats(id).catch(() => null);
    if (stats) {
      results.push({
        channelId: id,
        name: ch.snippet.title,
        subscribers: stats.subscribers,
        totalViews: stats.totalViews,
        totalVideos: stats.totalVideos,
        thumbnail: ch.snippet.thumbnails?.default?.url
      });
    }
  }
  return results.sort((a, b) => b.subscribers - a.subscribers);
}

export async function analyzeCompetitor(channelId) {
  return analyzeChannel(channelId, '');
}

export async function generateMarketIntelligence(niche, targetAudience, language, country) {
  const topChannels = await searchTopChannels(niche, 5);
  const channelAnalyses = [];
  for (const ch of topChannels.slice(0, 3)) {
    try {
      const analysis = await analyzeChannel(ch.channelId, ch.name);
      channelAnalyses.push(analysis);
    } catch (e) {
      console.error(`Failed to analyze ${ch.name}:`, e.message);
    }
  }

  const allBestTitles = channelAnalyses.flatMap(a => a.bestVideos.map(v => v.title));
  const allViralTopics = channelAnalyses.flatMap(a => a.viralTopics);

  return {
    topChannels,
    channelAnalyses,
    marketPatterns: {
      commonTitlePatterns: extractPatterns(allBestTitles),
      viralTopics: [...new Set(allViralTopics)].slice(0, 20),
      averageSubscribers: Math.round(topChannels.reduce((s, c) => s + c.subscribers, 0) / topChannels.length),
      averageViews: channelAnalyses.length
        ? Math.round(channelAnalyses.reduce((s, a) => s + a.performance.averageViews, 0) / channelAnalyses.length)
        : 0
    },
    niche,
    targetAudience,
    language,
    country,
    generatedAt: new Date().toISOString()
  };
}
