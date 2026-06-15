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

  userMessage = truncateToTokenLimit(systemPrompt, userMessage);
  const promptText = systemPrompt + (userMessage || '');
  if (estimateTokens(promptText) > 5000) {
    console.warn(`Prompt still ~${estimateTokens(promptText)} tokens after truncation`);
  }

  // --- Try Groq First (15s timeout) ---
  try {
    const model = MODELS[modelIndex] || MODELS[0];
    const resp = await fetch(GROQ_ENDPOINT, {
      signal: AbortSignal.timeout(15000),
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
        max_tokens: 4000
      })
    });

    if (resp.status === 404 && modelIndex < MODELS.length - 1) {
      return callGroq(systemPrompt, userMessage, modelIndex + 1);
    }

    if (resp.status === 429) throw new Error('GROQ_QUOTA');

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `AI request failed (HTTP ${resp.status})`);
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('GROQ_EMPTY');

    return text;

  } catch (err) {
    console.warn('Groq failed, switching to OpenRouter...', err.message);
  }

  // --- Fallback to OpenRouter (30s timeout) ---
  try {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');

    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      signal: AbortSignal.timeout(30000),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://scriptspark.onrender.com',
        'X-Title': 'ScriptSpark'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 2000,
        temperature: 0.8
      })
    });

    if (!orRes.ok) throw new Error('OPENROUTER_FAILED');

    const orData = await orRes.json();
    const orText = orData.choices?.[0]?.message?.content;
    if (!orText) throw new Error('OPENROUTER_EMPTY');

    console.log('Used OpenRouter as fallback');
    return orText;

  } catch (err) {
    console.error('OpenRouter also failed:', err.message);
    throw new Error('\u26A0\uFE0F Servers are busy right now. Please try again in 2 minutes.');
  }
}

async function callGroqJson(systemPrompt, userMessage, modelIndex = 0) {
  const result = await callGroq(systemPrompt, userMessage, modelIndex);
  try {
    return JSON.parse(cleanJsonString(result));
  } catch (parseErr) {
    const strictPrompt = systemPrompt + `\n\nCRITICAL: Your previous response was NOT valid JSON. Return ONLY valid JSON. No explanations, no markdown, no text before or after the JSON.`;
    const retryResult = await callGroq(strictPrompt, userMessage, modelIndex);
    return JSON.parse(cleanJsonString(retryResult));
  }
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
  const jsonMatch = s.match(/[\[{].*[\]}]/s);
  if (jsonMatch) {
    try { JSON.parse(jsonMatch[0]); return jsonMatch[0]; } catch (_) { }
  }
  return s;
}

const SCRIPT_TONE = {
  'Dark Mystery': 'suspense-driven, slow build, dramatic pauses, eerie atmosphere',
  'True Crime': 'journalistic, timeline-based, factual but gripping',
  'Finance': 'confident, data-backed, relatable examples, actionable',
  'Gaming': 'energetic, casual, second-person, slang-friendly',
  'Motivation': 'inspiring, emotional, personal story driven, uplifting',
  'Education': 'clear, structured, example-based, curiosity-driven',
  'History': 'storytelling, cinematic narration, era-specific tone',
  'Technology': 'analytical, forward-thinking, jargon explained simply',
  'Tech': 'analytical, forward-thinking, jargon explained simply',
  'Health': 'empathetic, evidence-based, practical, reassuring',
  'Food': 'sensory, warm, descriptive, conversational',
  'Travel': 'adventurous, vivid descriptions, personal experience',
  'Relationships': 'emotional, relatable, honest, conversational',
  'Business': 'strategic, case-study driven, direct, ambitious',
  'Mythology': 'epic, poetic, ancient storytelling style',
  'Astrology': 'mystical, personal, belief-respectful, curious tone',
  'General': 'conversational, curious, well-structured, engaging',
  'Default': 'conversational, curious, well-structured, engaging'
};

const HOOK_STYLE = {
  'Dark Mystery': 'Start with an unsettling fact or unexplained event',
  'True Crime': 'Start with the exact moment the crime happened',
  'Finance': 'Start with a shocking money statistic or common mistake',
  'Gaming': 'Start with the most insane moment or secret in the game',
  'Motivation': 'Start with a relatable failure or low point',
  'Education': 'Start with a surprising fact that contradicts common belief',
  'History': 'Start with the most dramatic moment of the historical event',
  'Technology': 'Start with what this tech can do that seems impossible',
  'Tech': 'Start with what this tech can do that seems impossible',
  'Health': 'Start with a symptom or habit most people ignore',
  'Food': 'Start with a sensory description that makes viewer hungry',
  'Travel': 'Start with the most unexpected thing about the destination',
  'Relationships': 'Start with a situation every viewer has experienced',
  'Business': 'Start with a decision that made or lost someone a fortune',
  'Mythology': 'Start with the most dramatic moment of the myth',
  'Astrology': 'Start with a specific prediction or cosmic event',
  'General': 'Start with the most surprising or counterintuitive point',
  'Default': 'Start with the most surprising or counterintuitive point'
};

const STORY_ELEMENTS = {
  'Dark Mystery': 'shadow silhouette in background, missing poster texture, abandoned location, fog effect',
  'True Crime': 'newspaper clipping texture overlay, police tape element, dark alley, crime scene tape',
  'Finance': 'stock chart in background, money blur effect, office setting, green screen glow',
  'Gaming': 'neon glow effects, controller silhouette, game UI elements, keyboard backlight',
  'Motivation': 'sunrise background, crowd silhouette, stadium lighting, golden hour glow',
  'Education': 'bookshelf background, chalkboard texture, infographic elements, clean desk',
  'History': 'vintage map texture, ancient artifact, period-appropriate setting, parchment overlay',
  'Technology': 'circuit board pattern, holographic UI elements, futuristic cityscape, blue LED glow',
  'Health': 'nature background, fresh ingredients, workout setting, clean white medical environment',
  'Food': 'steam rising from dish, kitchen counter setup, colorful ingredients, restaurant ambiance',
  'Travel': 'landmark in background, passport texture, suitcase element, scenic vista',
  'Relationships': 'warm candlelit setting, couple silhouette, cozy indoor environment',
  'Business': 'city skyline boardroom, graph charts, office tower, minimalist professional setting',
  'Mythology': 'ancient temple ruins, celestial sky, godly silhouette, divine light rays',
  'Astrology': 'night sky with stars, zodiac symbols, moon phase, cosmic nebula background',
  'General': 'clean dynamic composition, gradient background, subtle texture overlay',
  'Default': 'clean dynamic composition, gradient background, subtle texture overlay'
};

const THUMB_LIGHTING = {
  'Dark Mystery': 'dark single spotlight from above, deep shadows',
  'True Crime': 'cold blue dramatic light, harsh shadows',
  'Finance': 'bright clean office lighting, soft shadows',
  'Gaming': 'neon RGB glow from below, colorful ambient light',
  'Motivation': 'sunrise golden hour light, warm rim light',
  'Education': 'bright neutral studio light, even illumination',
  'History': 'sepia cinematic light, warm side lighting',
  'Technology': 'futuristic blue glow, cool rim light',
  'Health': 'clean bright natural light, soft diffusion',
  'Food': 'warm soft restaurant lighting, golden side light',
  'Travel': 'golden hour outdoor light, warm sun flare',
  'Relationships': 'warm soft indoor light, subtle candle glow',
  'Business': 'sharp contrast boardroom light, cool overhead',
  'Mythology': 'epic god-rays from above, golden backlight',
  'Astrology': 'cosmic starfield glow, soft moonlight',
  'General': 'clean neutral lighting, soft rim light',
  'Default': 'clean neutral lighting, soft rim light'
};

export async function generatePremiumScript({ topic, niche, contentType, channelAnalysis, creatorProfile, marketIntelligence, channelName, channelCategory, language }) {
  const isShorts = contentType === 'shorts';

  const channelContext = channelAnalysis ? `
CHANNEL: avgViews=${channelAnalysis.averageViews || 'N/A'}, engagement=${channelAnalysis.engagementRate || 'N/A'}%, uploadFreq=${channelAnalysis.uploadFrequency || 'N/A'}, topics=${(channelAnalysis.viralTopics || []).slice(0, 3).join(', ')}` : '';

  const profileContext = creatorProfile ? `
PROFILE: topics=${(creatorProfile.bestTopics || []).slice(0, 3).join(', ')}, titles=${(creatorProfile.bestTitleStyles || []).slice(0, 3).join(', ')}, thumbnail=${creatorProfile.thumbnailStyle || 'N/A'}, engagement=${creatorProfile.averageEngagement || 'N/A'}` : '';

  const marketContext = marketIntelligence ? `
MARKET: titles=${(marketIntelligence.viralTopics || []).slice(0, 5).join(', ')}, avgViews=${marketIntelligence.averageViews || 'N/A'}` : '';

  const lengthInfo = isShorts ? '30-60 sec (150-250 words)' : '8-20 min (1500-3000 words)';

  const cat = channelCategory || niche || 'General';
  const tone = SCRIPT_TONE[cat] || SCRIPT_TONE['Default'];
  const hook = HOOK_STYLE[cat] || HOOK_STYLE['Default'];

  const systemPrompt = `You are a professional YouTube scriptwriter.

Channel Name: ${channelName || 'the creator'}
Video Topic: ${topic}
Format: ${isShorts ? 'Shorts' : 'Long Form'}
Language: ${language || 'en'}
Length: ${lengthInfo}
Niche: ${cat}
Tone: ${tone}
Hook style: ${hook}

Write entirely in the ${cat} style. Do not use dramatic horror narration for non-horror niches. Do not use casual gaming language for serious niches. Match the tone exactly to the niche above.

STRICT RULES:
1. Use the channel name "${channelName || 'the creator'}" naturally in the script where suitable (e.g., in the CTA).
2. Open with a HOOK that creates immediate curiosity. No filler. No "Namaste doston".
3. Use open loops — raise a question early, answer it late.
4. CTA must say: "${channelName || 'this channel'} pe subscribe karo" or in English if language is English.
5. DO NOT use generic lines. Every line must serve the story.
6. Structure with clear labels: HOOK, SETUP, BUILD, CLIMAX, RESOLUTION, CTA
${channelContext}${profileContext}${marketContext}
Output ONLY valid JSON: {"title":"click-optimized under 70 chars","script":"full script with section labels and [0:00] markers","wordCount":number,"hook":"opening line","estimatedDuration":"","cta":""}`;

  const langHint = language === 'hi' ? ' (in Hindi)' : language === 'en-hi' ? ' (in Hinglish)' : '';
  return callGroqJson(systemPrompt, `Write a ${isShorts ? 'Shorts' : 'long form'} script for: ${topic} (Niche: ${cat}, Content Type: ${contentType})${langHint}`);
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

  return callGroqJson(systemPrompt, `Generate ${count} viral ${contentType} topic ideas for niche: ${niche}`);
}

export async function generateThumbnailPrompt({ title, niche, analysis, channelCategory }) {
  const bestPerforming = analysis?.viralTopics?.slice(0, 3).join(', ') || '';
  const cat = channelCategory || niche || 'General';
  const storyElem = STORY_ELEMENTS[cat] || STORY_ELEMENTS['Default'];
  const lighting = THUMB_LIGHTING[cat] || THUMB_LIGHTING['Default'];

  const systemPrompt = `You are an elite YouTube thumbnail designer. Create a thumbnail image prompt for "${title}" (Niche: ${niche}, Category: ${cat}).

VISUAL STYLE:
- Photorealistic, ultra detailed, cinematic composition
- 16:9 aspect ratio, no text, no watermarks
- MAX CTR composition

FACE REQUIREMENTS:
- face clearly visible, eyes expressive, text overlay space at bottom
- face 30% brighter than background
- strong rim lighting or screen glow on face
- eyes clearly visible and expressive
- ${lighting}

STORY ELEMENT:
${storyElem}

${bestPerforming ? `Best performing content reference: ${bestPerforming}` : ''}
Return ONLY the prompt string. Max 100 words. No markdown.`;

  const result = await callGroq(systemPrompt, `Generate thumbnail prompt for: ${title}`);
  return result.replace(/```/g, '').trim();
}

const THUMB_EMOTION = {
  'Dark Mystery': 'fear and curiosity',
  'True Crime': 'shock and intrigue',
  'Finance': 'aspiration and greed',
  'Gaming': 'excitement and FOMO',
  'Motivation': 'inspiration and urgency',
  'Education': 'curiosity and surprise',
  'History': 'awe and fascination',
  'Technology': 'fascination and wonder',
  'Tech': 'fascination and wonder',
  'Health': 'trust and concern',
  'Food': 'desire and craving',
  'Travel': 'wanderlust and adventure',
  'Relationships': 'empathy and recognition',
  'Business': 'ambition and curiosity',
  'Mythology': 'awe and mystery',
  'Astrology': 'mystery and personal relevance',
  'General': 'curiosity and surprise',
  'Default': 'curiosity and surprise'
};

export async function generateThumbnailText(fullTitle, channelCategory) {
  const cleanTitle = fullTitle.split('|')[0].trim();
  const emotion = THUMB_EMOTION[channelCategory] || THUMB_EMOTION['Default'];
  const systemPrompt = `Given this YouTube video title: "${cleanTitle}"
Return ONLY 2-3 word dramatic thumbnail text in the same language.
Rules:
- Max 3 words
- Must create ${emotion}
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

  return callGroqJson(systemPrompt, 'Detect thumbnail style from titles');
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

  return callGroqJson(systemPrompt, 'Create a detailed creator profile from the channel analysis data.');
}

export async function factCheckContent(script, topic) {
  const systemPrompt = `You are a fact-checking expert. Review this script about "${topic}" for factual accuracy. For each claim: is it true/false/unverifiable? What source supports/refutes it? Suggest corrections.

Output JSON: {accuracy_score:0-100, verified_claims[], questionable_claims[{claim, concern, suggested_correction, suggested_source}], overall_assessment}. ONLY valid JSON.`;

  return callGroqJson(systemPrompt, `Fact-check this script:\n\n${script}`);
}

export async function analyzeCompetitorTitles(titles, channelName) {
  const systemPrompt = `You are a YouTube competitor analysis expert. Analyze these ${titles.length} video titles from a competitor channel:

${titles.join('\n')}

Return ONLY a JSON object with EXACTLY these fields (no markdown, no explanation):
{
  "commonTopics": ["topic1", "topic2", "topic3"],
  "titlePatterns": ["pattern1", "pattern2"],
  "emotionType": "fear | curiosity | shock | inspiration | humor",
  "avgTitleLength": "short | medium | long",
  "languageStyle": "Hindi | English | Hinglish",
  "contentGaps": ["topic not covered 1", "topic not covered 2"],
  "thumbnailStyle": "face-based | text-based | scene-based | mixed",
  "hookWords": ["word1", "word2", "word3"],
  "whatIsWorking": "one sentence summary of their winning formula"
}
Return ONLY valid JSON. No explanation. No markdown.`;

  return callGroqJson(systemPrompt, 'Analyze these competitor YouTube titles and return the JSON analysis.');
}
