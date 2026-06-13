/**
 * ScriptSpark Pipeline — AI content generation via Groq API.
 * All data stays in the browser. Your API key is never sent to our servers.
 */

const Pipeline = (() => {
  const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
  const GROQ_MODEL = 'llama-3.1-8b-instant';

  function getApiKey() {
    try { return localStorage.getItem('ss-groq-key') || ''; } catch (e) { return ''; }
  }

  function getLang() {
    try { return localStorage.getItem('ss-lang') || 'en'; } catch (e) { return 'en'; }
  }

  function cleanJsonString(raw) {
    // Strip markdown code fences
    let s = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Try parsing as-is first (it may already be valid)
    try { JSON.parse(s); return s; } catch (_) { /* continue cleaning */ }

    // Pass 1: Escape control characters inside string values
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
    try { JSON.parse(result); return result; } catch (_) { /* continue cleaning */ }

    // Pass 2: Fix trailing commas before } or ]
    result = result.replace(/,\s*([}\]])/g, '$1');
    try { JSON.parse(result); return result; } catch (_) { /* continue cleaning */ }

    // Pass 3: Fix unescaped quotes inside string values.
    // Strategy: find " that appears between word chars (likely an unescaped inner quote)
    // and escape it. Repeats until parse succeeds or no more changes.
    for (let round = 0; round < 5; round++) {
      const prev = result;
      // Escape quotes surrounded by word chars or spaces (not at JSON structural positions)
      result = result.replace(/(\w)"(\w)/g, '$1\\"$2');
      result = result.replace(/(\w )"(\w)/g, '$1\\"$2');
      result = result.replace(/(\w)"( \w)/g, '$1\\"$2');
      result = result.replace(/(\w )"(\w)/g, '$1\\"$2');
      if (result === prev) break;
      try { JSON.parse(result); return result; } catch (_) { continue; }
    }

    // Pass 4: Last resort — replace any remaining inner quotes with escaped ones
    // by trying to parse with eval-like approach (safe here since input is LLM output)
    try {
      const fn = new Function('return ' + result);
      const obj = fn();
      return JSON.stringify(obj);
    } catch (_) { /* give up */ }

    // Return best attempt — will likely throw from JSON.parse in the caller
    return result;
  }

  async function callGroq(systemPrompt, userMessage) {
    const key = getApiKey();
    if (!key) throw new Error('API key not set. Open Settings to add your Groq API key.');
    const resp = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.8,
        max_tokens: 2000
      })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || 'AI request failed (HTTP ' + resp.status + ')');
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Step 1: Generate 5 viral video ideas for a niche.
   * Returns an array of { title, hook, whyViral } objects.
   */
  async function generateIdeas(niche) {
    const lang = getLang();
    const langName = lang === 'hi' ? 'Hindi' : 'English';
    const systemPrompt = `You are a viral YouTube content strategist for Indian creators. Generate exactly 5 video topic ideas for the niche: "${niche}". Output ONLY valid JSON (no markdown, no backticks). Return a JSON array of 5 objects, each with: "title" (viral YouTube title, under 70 chars), "hook" (one-sentence hook/opening), "whyViral" (1-2 sentence reason this topic will perform well). All text must be in ${langName}. Focus on trending, clickable, high-CTR ideas that would work on Indian YouTube.`;
    const result = await callGroq(systemPrompt, 'Generate 5 viral video ideas for the niche: ' + niche);
    return JSON.parse(cleanJsonString(result));
  }

  /**
   * Step 2: Generate a full video script for a selected topic.
   * Returns { title, script, wordCount }.
   */
  async function generateScript(topic, niche) {
    const lang = getLang();
    const langName = lang === 'hi' ? 'Hindi' : 'English';
    const systemPrompt = `You are an expert YouTube scriptwriter for Indian creators. Write a complete, engaging video script for the topic: "${topic}" in the "${niche}" niche.

Structure: Hook (first 3 seconds) → Problem/Pain Point → Story/Build-up → Reveal/Solution → Call to Action.

Requirements:
- 400 to 600 words total
- Write entirely in ${langName}
- Use conversational, spoken-word style (as if being read aloud)
- Include a compelling YouTube title at the top
- Use short paragraphs and natural transitions
- End with a clear subscribe/follow CTA
- Do NOT include scene directions, camera angles, or visual notes
- Just write the spoken script text

Output ONLY valid JSON (no markdown, no backticks). Return a JSON object with: "title" (YouTube title under 70 chars), "script" (the full script text), "wordCount" (number).`;
    const result = await callGroq(systemPrompt, 'Write a complete YouTube script for: ' + topic + ' (Niche: ' + niche + ')');
    return JSON.parse(cleanJsonString(result));
  }

  /**
   * Step 3: Generate a plain-text image prompt for thumbnail creation.
   * Returns a string only — suitable for Puter.js or any image generator.
   */
  async function generateImagePrompt(topic, niche) {
    const systemPrompt = `Create a YouTube thumbnail image prompt for the video titled "${topic}" in the ${niche} niche. Describe: main subject with strong facial expression, dramatic background, cinematic lighting, bold color scheme. Make it ultra high contrast, emotionally intense, designed to maximize CTR. Return only the image prompt string. Max 40 words.`;
    return await callGroq(systemPrompt, 'Create thumbnail prompt for: ' + topic);
  }

  return { generateIdeas, generateScript, generateImagePrompt, getApiKey, getLang };
})();
