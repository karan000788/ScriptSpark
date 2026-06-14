import dotenv from 'dotenv';
dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

if (!GROQ_API_KEY) {
  console.error('Missing GROQ_API_KEY in environment');
}

const MODELS = [
  'llama-3.3-70b-versatile',
  'deepseek-r1-distill-llama-70b',
  'llama-3.1-8b-instant'
];

async function callGroq(systemPrompt, userMessage, modelIndex = 0) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured on server');
  const model = MODELS[modelIndex] || MODELS[0];

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
  const lengthGuide = isShorts
    ? '30-60 seconds (150-250 words). Fast pacing, quick cuts, pattern interrupts every 5-7 seconds.'
    : '8-20 minutes (1500-3000 words). Deep storytelling, emotional narrative arcs, pattern interrupts every 30-40 seconds.';

  const channelContext = channelAnalysis ? `
CHANNEL PERFORMANCE DATA:
- Average Views: ${channelAnalysis.averageViews || 'N/A'}
- Best Performing Topics: ${channelAnalysis.viralTopics?.slice(0, 5).join(', ') || 'N/A'}
- Engagement Rate: ${channelAnalysis.engagementRate || 'N/A'}%
- Upload Frequency: ${channelAnalysis.uploadFrequency || 'N/A'}
- Top Title Patterns: ${JSON.stringify(channelAnalysis.titlePatterns || {})}` : '';

  const profileContext = creatorProfile ? `
CREATOR PROFILE:
- Best Topics: ${creatorProfile.bestTopics?.join(', ') || 'N/A'}
- Best Title Styles: ${creatorProfile.bestTitleStyles?.join(', ') || 'N/A'}
- Thumbnail Style: ${creatorProfile.thumbnailStyle || 'N/A'}
- Average Engagement: ${creatorProfile.averageEngagement || 'N/A'}` : '';

  const marketContext = marketIntelligence ? `
MARKET INTELLIGENCE:
- Top Competitor Titles: ${marketIntelligence.viralTopics?.slice(0, 10).join(', ') || 'N/A'}
- Market Average Views: ${marketIntelligence.averageViews || 'N/A'}` : '';

  const systemPrompt = `You are the world's best YouTube scriptwriter. Creators like MrBeast, Alex Hormozi, and Marques Brownlee would hire you.

Your task: Write a highly engaging YouTube ${isShorts ? 'SHORTS' : 'LONG FORM'} video script for the topic: "${topic}" in the "${niche}" niche.

${lengthGuide}

SCRIPT REQUIREMENTS:
1. HOOK (first 3-5 seconds for shorts, first 15-30 seconds for long form):
   - Pattern interrupt that stops the scroll
   - Curiosity gap that demands attention
   - Emotional trigger (fear, anger, awe, greed, or curiosity)

2. RETENTION TECHNIQUES (use throughout):
   - Open loops (start a story, cut away, return later)
   - Curiosity gaps (present a mystery, hint at the answer)
   - Pattern interrupts (unexpected cuts, sudden changes in tone/pacing)
   - Emotional escalation (start calm, build intensity)
   - The "But then..." moment (twist or revelation)

3. STORYTELLING FRAMEWORK:
   - Use one of: Hero's Journey, Before/After, Problem/Solution, Mystery/Reveal, or Contrarian take
   - Show, don't tell — use vivid imagery and specific details
   - Personal anecdotes or case studies that feel authentic

4. LANGUAGE & TONE:
   - Natural, conversational — like a friend telling you something mind-blowing
   - NEVER sound like AI. No "in today's video", "let's dive in", "without further ado"
   - Use rhetorical questions, short sentences, punchy phrases
   - Vary sentence length for rhythm

5. STRUCTURE:
   ${isShorts ? `
   - 0-5s: Hook
   - 5-20s: Setup / Context
   - 20-40s: Main content / Escalation
   - 40-55s: Revelation / Twist
   - 55-60s: CTA (like & subscribe)` : `
   - Act 1 (0-2 min): Hook + Setup
   - Act 2 (2-8 min): Escalation + Story
   - Act 3 (8-15 min): Revelation + Twist
   - Act 4 (15-20 min): Conclusion + CTA
   `}

6. ENDING:
   - Strong conclusion that delivers on the hook's promise
   - Subscribe CTA (make it feel natural, not desperate)
   - Engagement prompt (comment a specific word or thought)

${channelContext}
${profileContext}
${marketContext}

CRITICAL: Never write "welcome back", "in today's video", "let's get into it", "make sure to like and subscribe". Sound 100% human.

Output ONLY valid JSON (no markdown, no backticks). Return JSON with:
- "title": click-optimized YouTube title under 70 chars
- "script": the complete script with timing markers [0:00], [0:15], etc.
- "wordCount": approximate word count
- "hook": the opening hook (first line)
- "estimatedDuration": estimated watch time
- "cta": the call to action used`;

  const result = await callGroq(systemPrompt, `Write a ${isShorts ? 'Shorts' : 'long form'} script for: ${topic} (Niche: ${niche}, Content Type: ${contentType})`);
  return JSON.parse(cleanJsonString(result));
}

export async function generateIdeas({ niche, channelAnalysis, marketIntelligence, contentType, count = 5 }) {
  const channelContext = channelAnalysis ? `
Channel Performance:
- Best Videos: ${channelAnalysis.bestVideos?.slice(0, 3).map(v => v.title).join(', ')}
- Viral Topics: ${channelAnalysis.viralTopics?.slice(0, 5).join(', ')}
- Title Patterns: ${JSON.stringify(channelAnalysis.titlePatterns)}` : '';

  const marketContext = marketIntelligence ? `
Market Intelligence:
- Competitor Viral Topics: ${marketIntelligence.viralTopics?.slice(0, 10).join(', ') || 'N/A'}
- Market Patterns: ${JSON.stringify(marketIntelligence.marketPatterns?.commonTitlePatterns || {})}` : '';

  const systemPrompt = `You are a viral YouTube content strategist. Generate exactly ${count} video ${contentType === 'shorts' ? 'Shorts' : 'video'} topic ideas for the "${niche}" niche.

Each idea must:
- Be trending and searchable
- Have high curiosity gap
- Feel emotionally charged
- Be optimized for high CTR

${channelContext}
${marketContext}

Output ONLY valid JSON array. Each object: {"title": "viral title under 70 chars", "hook": "powerful one-sentence hook", "whyViral": "why this will trend (1-2 sentences)", "estimatedViews": "estimated view potential"}`;

  const result = await callGroq(systemPrompt, `Generate ${count} viral ${contentType} topic ideas for niche: ${niche}`);
  return JSON.parse(cleanJsonString(result));
}

export async function generateThumbnailPrompt({ title, niche, analysis }) {
  const bestPerforming = analysis?.viralTopics?.slice(0, 3).join(', ') || '';
  const systemPrompt = `You are an elite YouTube thumbnail designer. Create the perfect thumbnail image prompt for the video titled "${title}" in the "${niche}" niche.

Requirements:
- Photorealistic, ultra detailed
- Emotional facial expression (shock, awe, fear, curiosity, anger)
- Dramatic lighting, cinematic composition
- Vivid colors, high contrast
- Professional YouTube thumbnail style
- Visually striking, maximum CTR
- 16:9 composition
- NO text in the image
- NO watermarks

${bestPerforming ? `This creator's best performing content: ${bestPerforming}` : ''}

Return ONLY the image prompt string. Max 100 words. No explanation. No markdown.`;

  const result = await callGroq(systemPrompt, `Generate thumbnail prompt for: ${title}`);
  return result.replace(/```/g, '').trim();
}

export async function generateScriptIdeas({ channelAnalysis, niche, contentType, count = 5 }) {
  return generateIdeas({ niche, channelAnalysis, contentType, count });
}

export async function generateCreatorProfile({ channelAnalysis, niche, contentType }) {
  const systemPrompt = `You are a YouTube channel audit expert. Based on the following channel analysis data, create a detailed Creator Profile.

Channel Data:
${JSON.stringify(channelAnalysis, null, 2)}

Niche: ${niche}
Content Type: ${contentType}

Analyze and output a JSON object with:
- "bestTopics": array of top performing content topics/themes
- "bestHooks": what hook styles work best for this channel
- "bestTitleStyles": what title patterns get the most views
- "thumbnailStyle": what thumbnail elements/style works best
- "uploadPattern": best upload frequency and timing
- "averageEngagement": average like/comment/view ratio
- "recommendedContentType": shorts or long form recommendation
- "growthOpportunities": array of 3-5 growth opportunities
- "contentGaps": what topics they are missing

Output ONLY valid JSON. No markdown.`;

  const result = await callGroq(systemPrompt, 'Create a detailed creator profile from the channel analysis data.');
  return JSON.parse(cleanJsonString(result));
}

export async function factCheckContent(script, topic) {
  const systemPrompt = `You are a fact-checking expert. Review the following script about "${topic}" for factual accuracy.

Identify ANY claims that need verification. For each claim:
1. Is it likely true, false, or unverifiable?
2. What source would support or refute it?
3. Suggest corrections if needed.

Also provide:
- Overall accuracy score (0-100)
- List of verified claims
- List of questionable claims needing sources
- Suggested corrections

Output ONLY valid JSON with: accuracy_score, verified_claims[], questionable_claims[{claim, concern, suggested_correction, suggested_source}], overall_assessment`;

  const result = await callGroq(systemPrompt, `Fact-check this script:\n\n${script}`);
  return JSON.parse(cleanJsonString(result));
}
