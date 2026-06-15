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

export async function generatePremiumScript({ topic, niche, contentType, channelAnalysis, creatorProfile, marketIntelligence, channelName, channelCategory, language }) {
  const isShorts = contentType === 'shorts';

  const channelContext = channelAnalysis ? `
CHANNEL: avgViews=${channelAnalysis.averageViews || 'N/A'}, engagement=${channelAnalysis.engagementRate || 'N/A'}%, uploadFreq=${channelAnalysis.uploadFrequency || 'N/A'}, topics=${(channelAnalysis.viralTopics || []).slice(0, 3).join(', ')}` : '';

  const profileContext = creatorProfile ? `
PROFILE: topics=${(creatorProfile.bestTopics || []).slice(0, 3).join(', ')}, titles=${(creatorProfile.bestTitleStyles || []).slice(0, 3).join(', ')}, thumbnail=${creatorProfile.thumbnailStyle || 'N/A'}, engagement=${creatorProfile.averageEngagement || 'N/A'}` : '';

  const marketContext = marketIntelligence ? `
MARKET: titles=${(marketIntelligence.viralTopics || []).slice(0, 5).join(', ')}, avgViews=${marketIntelligence.averageViews || 'N/A'}` : '';

  const lengthInfo = isShorts ? '30-60 sec (150-250 words)' : '8-20 min (1500-3000 words)';

  const categoryStyleGuide = channelCategory ? {
    'Dark Mystery': '- Build suspense slowly, use dramatic pauses, Hindi/Hinglish phrases\n- Use ominous, atmospheric language\n- End with a chilling question',
    'Finance': '- Confident, authoritative tone with data points\n- Use relatable financial examples\n- Break down complex concepts simply',
    'Gaming': '- Energetic, conversational with gaming slang\n- Use second-person ("tu", "tum", "aap")\n- Fast-paced, excited delivery',
    'True Crime': '- Journalistic, measured tone\n- Timeline-based narration\n- Present facts dramatically but respectfully',
    'Tech': '- Clear, explanatory tone\n- Balance depth with accessibility\n- Use comparison frameworks',
    'Motivation': '- Inspirational, powerful tone\n- Personal story-driven\n- Call to action at emotional peak',
    'General': '- Conversational, engaging tone\n- Match the topic\'s natural energy'
  }[channelCategory] || '- Conversational, engaging tone' : '- Conversational, engaging tone';

  const systemPrompt = `You are a professional YouTube scriptwriter who deeply understands viral content.

Channel Name: ${channelName || 'the creator'}
Channel Category: ${channelCategory || niche || 'General'}
Video Topic: ${topic}
Format: ${isShorts ? 'Shorts' : 'Long Form'}
Language: ${language || 'en'}
Length: ${lengthInfo}

STRICT RULES:
1. Write the script in the creator's actual niche style (${channelCategory || niche || 'General'}).
${categoryStyleGuide}
2. Use the channel name "${channelName || 'the creator'}" naturally in the script where suitable (e.g., in the CTA).
3. Open with a HOOK that creates immediate curiosity. No filler. No "Namaste doston".
4. Use open loops — raise a question early, answer it late.
5. CTA must say: "${channelName || 'this channel'} pe subscribe karo" or in English if language is English.
6. DO NOT use generic lines. Every line must serve the story.
7. Structure with clear labels: HOOK, SETUP, BUILD, CLIMAX, RESOLUTION, CTA
${channelContext}${profileContext}${marketContext}
Output ONLY valid JSON: {"title":"click-optimized under 70 chars","script":"full script with section labels and [0:00] markers","wordCount":number,"hook":"opening line","estimatedDuration":"","cta":""}`;

  const langHint = language === 'hi' ? ' (in Hindi)' : language === 'en-hi' ? ' (in Hinglish)' : '';
  const result = await callGroq(systemPrompt, `Write a ${isShorts ? 'Shorts' : 'long form'} script for: ${topic} (Niche: ${niche}, Content Type: ${contentType})${langHint}`);
  return JSON.parse(cleanJsonString(result));
}

export async function generateIdeas({ niche, channelAnalysis, marketIntelligence, contentType, count = 5, recentTitles = [] }) {
  const channelContext = channelAnalysis ? `
Channel: bestVideos=${(channelAnalysis.bestVideos || []).slice(0, 3).map(v => v.title).join(', ')}, viralTopics=${(channelAnalysis.viralTopics || []).slice(0, 3).join(', ')}` : '';

  const marketContext = marketIntelligence ? `
Market: competitorTopics=${(marketIntelligence.viralTopics || []).slice(0, 5).join(', ')}` : '';

  const avoidContext = recentTitles.length ? `
STRICT: Do NOT suggest any of these recent video topics (channel already made them): ${recentTitles.slice(0, 10).map(t => `"${t}"`).join(', ')}` : '';

  const systemPrompt = `You are a viral YouTube content strategist. Generate ${count} ${contentType === 'shorts' ? 'Shorts' : 'video'} topic ideas for "${niche}". Each must be trending, curiosity-driven, emotionally charged, high CTR.
${channelContext}${marketContext}${avoidContext}
Output ONLY valid JSON array: [{"title":"under 70 chars","hook":"one-sentence hook","whyViral":"1-2 sentences","estimatedViews":""}]`;

  const result = await callGroq(systemPrompt, `Generate ${count} viral ${contentType} topic ideas for niche: ${niche}`);
  return JSON.parse(cleanJsonString(result));
}

const STORY_ELEMENTS = {
  'Dark Mystery': 'shadow silhouette in background, missing poster texture, abandoned location, fog effect',
  'True Crime': 'newspaper clipping texture overlay, police tape element, dark alley, crime scene tape',
  'Finance': 'stock chart in background, money blur effect, office setting, green screen glow',
  'Gaming': 'neon glow effects, controller silhouette, game UI elements, keyboard backlight',
  'Motivation': 'sunrise background, crowd silhouette, stadium lighting, golden hour glow',
  'Default': 'dramatic lighting, dark background with spotlight, cinematic fog'
};

export async function generateThumbnailPrompt({ title, niche, analysis, channelCategory }) {
  const bestPerforming = analysis?.viralTopics?.slice(0, 3).join(', ') || '';
  const storyElem = STORY_ELEMENTS[channelCategory] || STORY_ELEMENTS['Default'];

  const systemPrompt = `You are an elite YouTube thumbnail designer. Create a thumbnail image prompt for "${title}" (Niche: ${niche}, Category: ${channelCategory || niche || 'General'}).

VISUAL STYLE:
- Photorealistic, ultra detailed, cinematic composition
- 16:9 aspect ratio, no text, no watermarks
- MAX CTR composition

FACE REQUIREMENTS:
- face clearly visible, eyes expressive, text overlay space at bottom
- face 30% brighter than background
- strong rim lighting or screen glow on face
- eyes clearly visible and expressive
- dark background with single light source on subject

STORY ELEMENT:
${storyElem}

${bestPerforming ? `Best performing content reference: ${bestPerforming}` : ''}
Return ONLY the prompt string. Max 100 words. No markdown.`;

  const result = await callGroq(systemPrompt, `Generate thumbnail prompt for: ${title}`);
  return result.replace(/```/g, '').trim();
}

export async function generateThumbnailText(fullTitle) {
  const cleanTitle = fullTitle.split('|')[0].trim();
  const systemPrompt = `Given this YouTube video title: "${cleanTitle}"
Return ONLY 2-3 word dramatic thumbnail text in the same language.
Rules:
- Max 3 words
- Must create curiosity or fear
- No emoji
- Capitalize all words
- Return only the text, nothing else`;

  const result = await callGroq(systemPrompt, `Generate short thumbnail text for: ${cleanTitle}`);
  return result.replace(/["'`\n\r]/g, '').trim();
}

export async function detectThumbnailStyle(recentTitles) {
  const titleAnalysis = recentTitles.join(', ');
  const systemPrompt = `Analyze these YouTube video titles from a creator:
${titleAnalysis}

Detect their thumbnail style pattern and return ONLY a JSON object:
{
  "textStyle": "minimal" | "descriptive" | "question-based" | "number-based",
  "language": "Hindi" | "English" | "Hinglish",
  "emotionType": "fear" | "curiosity" | "shock" | "inspiration" | "humor",
  "usesNumbers": true | false,
  "commonWords": ["word1", "word2"],
  "recommendedTextStyle": "2-3 word dramatic text in their language and emotion style"
}
Return ONLY the JSON. No explanation.`;

  const result = await callGroq(systemPrompt, 'Detect thumbnail style from titles');
  return JSON.parse(cleanJsonString(result));
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
