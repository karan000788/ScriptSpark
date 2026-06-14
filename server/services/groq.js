import dotenv from 'dotenv';
dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

if (!GROQ_API_KEY) {
  console.error('Missing GROQ_API_KEY in environment');
}

const MODELS = [
  'llama-3.3-70b-versatile',
  'deepseek-r1-distill-llama-70b'
];

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function truncateToTokenLimit(systemPrompt, userMessage, maxTokens = 5000) {
  let total = systemPrompt + (userMessage || '');
  if (estimateTokens(total) <= maxTokens) return userMessage;
  let trimmed = userMessage || '';
  let attempts = 0;
  while (estimateTokens(systemPrompt + trimmed) > maxTokens && attempts < 20) {
    trimmed = trimmed.slice(0, Math.floor(trimmed.length * 0.8));
    attempts++;
  }
  return trimmed;
}

async function callGroq(systemPrompt, userMessage, modelIndex = 0) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured on server');
  const model = MODELS[modelIndex] || MODELS[0];

  userMessage = truncateToTokenLimit(systemPrompt, userMessage);
  const promptText = systemPrompt + (userMessage || '');
  if (estimateTokens(promptText) > 5000) {
    console.warn(`Prompt still ~${estimateTokens(promptText)} tokens after truncation`);
  }

  const resp = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.8,
      max_tokens: 8000
    })
  });

  if (resp.status === 404 && modelIndex < MODELS.length - 1) {
    return callGroq(systemPrompt, userMessage, modelIndex + 1);
  }

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `AI request failed (HTTP ${resp.status})`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

function cleanJsonString(raw) {
  let s = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { JSON.parse(s); return s; } catch (_) { }
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (escaped) { result += ch; escaped = false; continue; }
    if (inString) {
      if (ch === '\\') { result += ch; escaped = true; continue; }
      if (ch === '"') { result += ch; inString = false; continue; }
      if (code === 0x0A) { result += '\\n'; continue; }
      if (code === 0x0D) { result += '\\r'; continue; }
      if (code === 0x09) { result += '\\t'; continue; }
      if (code < 0x20) { result += '\\u' + code.toString(16).padStart(4, '0'); continue; }
      result += ch;
    } else {
      if (ch === '"') inString = true;
      result += ch;
    }
  }
  try { JSON.parse(result); return result; } catch (_) { }
  result = result.replace(/,\s*([}\]])/g, '$1');
  try { JSON.parse(result); return result; } catch (_) { }
  return s;
}

export async function generatePremiumScript({ topic, niche, contentType, channelAnalysis, creatorProfile, marketIntelligence }) {
  const isShorts = contentType === 'shorts';

  const channelContext = channelAnalysis ? `
CHANNEL: avgViews=${channelAnalysis.averageViews || 'N/A'}, engagement=${channelAnalysis.engagementRate || 'N/A'}%, uploadFreq=${channelAnalysis.uploadFrequency || 'N/A'}, topics=${(channelAnalysis.viralTopics || []).slice(0, 3).join(', ')}` : '';

  const profileContext = creatorProfile ? `
PROFILE: topics=${(creatorProfile.bestTopics || []).slice(0, 3).join(', ')}, titles=${(creatorProfile.bestTitleStyles || []).slice(0, 3).join(', ')}, thumbnail=${creatorProfile.thumbnailStyle || 'N/A'}, engagement=${creatorProfile.averageEngagement || 'N/A'}` : '';

  const marketContext = marketIntelligence ? `
MARKET: titles=${(marketIntelligence.viralTopics || []).slice(0, 5).join(', ')}, avgViews=${marketIntelligence.averageViews || 'N/A'}` : '';

  const lengthInfo = isShorts ? '30-60 sec (150-250 words)' : '8-20 min (1500-3000 words)';

  const systemPrompt = `You are the world's best YouTube scriptwriter. Write a ${isShorts ? 'SHORTS' : 'LONG FORM'} script for "${topic}" (${niche}).

Length: ${lengthInfo}.

Requirements:
- Hook (first ${isShorts ? '3-5s' : '15-30s'}): pattern interrupt, curiosity gap, emotional trigger
- Retention: open loops, curiosity gaps, pattern interrupts, emotional escalation
- Framework: Hero's Journey / Before-After / Problem-Solution / Mystery-Reveal / Contrarian
- Natural conversational tone. NEVER "in today's video", "let's dive in", "without further ado"
- Vary sentence length. Use rhetorical questions.
${isShorts ? `
Structure: 0-5s Hook | 5-20s Setup | 20-40s Escalation | 40-55s Twist | 55-60s CTA` : `
Structure: Act 1 (0-2min) Hook+Setup | Act 2 (2-8min) Escalation | Act 3 (8-15min) Twist | Act 4 (15-20min) Conclusion+CTA`}
- Ending: deliver on hook's promise, natural subscribe CTA, engagement prompt
${channelContext}${profileContext}${marketContext}
Output ONLY valid JSON: {"title":"click-optimized under 70 chars","script":"full script with [0:00] markers","wordCount":number,"hook":"opening line","estimatedDuration":"","cta":""}`;

  const result = await callGroq(systemPrompt, `Write a ${isShorts ? 'Shorts' : 'long form'} script for: ${topic} (Niche: ${niche}, Content Type: ${contentType})`);
  return JSON.parse(cleanJsonString(result));
}

export async function generateIdeas({ niche, channelAnalysis, marketIntelligence, contentType, count = 5 }) {
  const channelContext = channelAnalysis ? `
Channel: bestVideos=${(channelAnalysis.bestVideos || []).slice(0, 3).map(v => v.title).join(', ')}, viralTopics=${(channelAnalysis.viralTopics || []).slice(0, 3).join(', ')}` : '';

  const marketContext = marketIntelligence ? `
Market: competitorTopics=${(marketIntelligence.viralTopics || []).slice(0, 5).join(', ')}` : '';

  const systemPrompt = `You are a viral YouTube content strategist. Generate ${count} ${contentType === 'shorts' ? 'Shorts' : 'video'} topic ideas for "${niche}". Each must be trending, curiosity-driven, emotionally charged, high CTR.
${channelContext}${marketContext}
Output ONLY valid JSON array: [{"title":"under 70 chars","hook":"one-sentence hook","whyViral":"1-2 sentences","estimatedViews":""}]`;

  const result = await callGroq(systemPrompt, `Generate ${count} viral ${contentType} topic ideas for niche: ${niche}`);
  return JSON.parse(cleanJsonString(result));
}

export async function generateThumbnailPrompt({ title, niche, analysis }) {
  const bestPerforming = analysis?.viralTopics?.slice(0, 3).join(', ') || '';
  const systemPrompt = `You are an elite YouTube thumbnail designer. Create a thumbnail image prompt for "${title}" (${niche}).

Requirements: photorealistic, ultra detailed, emotional expression (shock/awe/fear/curiosity/anger), dramatic lighting, cinematic composition, vivid colors, high contrast, 16:9, no text, no watermarks, max CTR.

${bestPerforming ? `Best content: ${bestPerforming}` : ''}
Return ONLY the prompt string. Max 100 words. No markdown.`;

  const result = await callGroq(systemPrompt, `Generate thumbnail prompt for: ${title}`);
  return result.replace(/```/g, '').trim();
}

export async function generateScriptIdeas({ channelAnalysis, niche, contentType, count = 5 }) {
  return generateIdeas({ niche, channelAnalysis, contentType, count });
}

export async function generateCreatorProfile({ channelAnalysis, niche, contentType }) {
  const info = channelAnalysis.channelInfo || {};
  const topVids = (channelAnalysis.bestVideos || []).slice(0, 5).map(v => ({
    title: v.title, views: v.views, duration: v.duration
  }));
  const bottomVids = (channelAnalysis.worstVideos || []).slice(0, 3).map(v => ({
    title: v.title, views: v.views
  }));

  const trimmedData = {
    name: info.name,
    subscribers: info.subscribers,
    topVideos: topVids,
    bottomVideos: bottomVids,
    viralTopics: (channelAnalysis.viralTopics || []).slice(0, 5),
    avgViews: channelAnalysis.performance?.averageViews,
    engagementRate: channelAnalysis.performance?.engagementRate,
    uploadFrequency: channelAnalysis.performance?.uploadFrequency
  };

  const systemPrompt = `You are a YouTube channel audit expert. Analyze this channel and create a Creator Profile.

Channel: ${trimmedData.name} (${trimmedData.subscribers} subs, ${trimmedData.avgViews || 'N/A'} avg views, ${trimmedData.engagementRate || 'N/A'}% engagement, ${trimmedData.uploadFrequency || 'N/A'})
Top videos: ${trimmedData.topVideos.map(v => `${v.title} (${v.views} views${v.duration ? ', ' + v.duration : ''})`).join(' | ')}
Bottom videos: ${trimmedData.bottomVideos.map(v => `${v.title} (${v.views} views)`).join(' | ')}
Viral topics: ${(trimmedData.viralTopics || []).join(', ')}
Niche: ${niche}
Content: ${contentType}

Output JSON: {bestTopics[], bestHooks[], bestTitleStyles[], thumbnailStyle, uploadPattern, averageEngagement, recommendedContentType, growthOpportunities[3-5], contentGaps[]}. ONLY valid JSON.`;

  const result = await callGroq(systemPrompt, 'Create a detailed creator profile from the channel analysis data.');
  return JSON.parse(cleanJsonString(result));
}

export async function factCheckContent(script, topic) {
  const systemPrompt = `You are a fact-checking expert. Review this script about "${topic}" for factual accuracy. For each claim: is it true/false/unverifiable? What source supports/refutes it? Suggest corrections.

Output JSON: {accuracy_score:0-100, verified_claims[], questionable_claims[{claim, concern, suggested_correction, suggested_source}], overall_assessment}. ONLY valid JSON.`;

  const result = await callGroq(systemPrompt, `Fact-check this script:\n\n${script}`);
  return JSON.parse(cleanJsonString(result));
}
