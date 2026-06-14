/**
 * ScriptSpark Pipeline — AI content generation via Groq API.
 * All data stays in the browser. Your API key is never sent to our servers.
 */

const Pipeline = (() => {
  const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

  const MODELS = [
    'llama-3.3-70b-versatile',
    'deepseek-r1-distill-llama-70b'
  ];

  let activeModel = MODELS[0];

  const DEBUG = true;

  function dbg(...args) {
    if (DEBUG) console.log('[Pipeline]', ...args);
  }

  function getApiKey() {
    try { return localStorage.getItem('ss-groq-key') || ''; } catch (e) { return ''; }
  }

  function getLang() {
    try { return localStorage.getItem('ss-lang') || 'en'; } catch (e) { return 'en'; }
  }

  function cleanJsonString(raw) {
    let s = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try { JSON.parse(s); return s; } catch (_) { /* continue */ }

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
    try { JSON.parse(result); return result; } catch (_) { /* continue */ }

    result = result.replace(/,\s*([}\]])/g, '$1');
    try { JSON.parse(result); return result; } catch (_) { /* continue */ }

    for (let round = 0; round < 5; round++) {
      const prev = result;
      result = result.replace(/(\w)"(\w)/g, '$1\\"$2');
      result = result.replace(/(\w )"(\w)/g, '$1\\"$2');
      result = result.replace(/(\w)"( \w)/g, '$1\\"$2');
      if (result === prev) break;
      try { JSON.parse(result); return result; } catch (_) { continue; }
    }

    try {
      const fn = new Function('return ' + result);
      return JSON.stringify(fn());
    } catch (_) { /* give up */ }

    return result;
  }

  function estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  async function callGroq(systemPrompt, userMessage, modelIndex) {
    const key = getApiKey();
    if (!key) throw new Error('API key not set. Open Settings to add your Groq API key.');

    let total = systemPrompt + (userMessage || '');
    if (estimateTokens(total) > 5000) {
      let trimmed = userMessage || '';
      let attempts = 0;
      while (estimateTokens(systemPrompt + trimmed) > 5000 && attempts < 20) {
        trimmed = trimmed.slice(0, Math.floor(trimmed.length * 0.8));
        attempts++;
      }
      userMessage = trimmed;
      dbg('Prompt truncated to ~' + estimateTokens(systemPrompt + trimmed) + ' tokens');
    }

    modelIndex = modelIndex || 0;
    const model = MODELS[modelIndex] || MODELS[0];
    const start = Date.now();
    dbg('Calling Groq model:', model);

    try {
      const resp = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.8,
          max_tokens: 4000
        })
      });

      if (resp.status === 404 && modelIndex < MODELS.length - 1) {
        dbg('Model', model, 'not found, falling back to', MODELS[modelIndex + 1]);
        activeModel = MODELS[modelIndex + 1];
        return callGroq(systemPrompt, userMessage, modelIndex + 1);
      }

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || 'AI request failed (HTTP ' + resp.status + ')');
      }

      const data = await resp.json();
      const elapsed = Date.now() - start;
      dbg('Groq response in', elapsed + 'ms');
      activeModel = model;
      return data.choices?.[0]?.message?.content || '';
    } catch (err) {
      if (modelIndex < MODELS.length - 1) {
        dbg('Model', model, 'failed, falling back to', MODELS[modelIndex + 1], '-', err.message);
        activeModel = MODELS[modelIndex + 1];
        return callGroq(systemPrompt, userMessage, modelIndex + 1);
      }
      throw err;
    }
  }

  async function generateIdeas(niche) {
    const lang = getLang();
    const langName = lang === 'hi' ? 'Hindi' : 'English';
    const systemPrompt = 'You are a viral YouTube content strategist. Generate exactly 5 video topic ideas for the niche: "' + niche + '". Each idea must be trending, curiosity-driven, emotionally charged, and optimized for high CTR on YouTube. Output ONLY valid JSON (no markdown, no backticks). Return a JSON array of 5 objects, each with: "title" (viral YouTube title, under 70 chars, curiosity gap), "hook" (one powerful sentence hook/opening), "whyViral" (1-2 sentence reason this topic will trend). All text must be in ' + langName + '.';
    const result = await callGroq(systemPrompt, 'Generate 5 trending viral video ideas for niche: ' + niche);
    dbg('generateIdeas raw:', result.slice(0, 200));
    return JSON.parse(cleanJsonString(result));
  }

  async function generateScript(topic, niche) {
    const lang = getLang();
    const langName = lang === 'hi' ? 'Hindi' : 'English';
    const systemPrompt = 'You are one of the best YouTube scriptwriters in the world. Write a highly engaging YouTube script for the topic: "' + topic + '" in the "' + niche + '" niche.\n\nRequirements:\n- 1500 to 2500 words\n- Strong hook within first 10 seconds\n- Curiosity gap throughout\n- Emotional storytelling\n- Suspense building\n- Pattern interrupts every 30-40 seconds\n- Retention optimized\n- Cinematic narration\n- Natural human language, no AI-style wording\n- No repetition\n- Powerful ending with subscribe CTA\n\nStructure:\n1. Hook\n2. Setup\n3. Escalation\n4. Main Story\n5. Revelation\n6. Twist\n7. Conclusion\n\nStyle inspiration: MagnatesMedia, James Jani, Fern, Dark India Files\n\nWrite entirely in ' + langName + '.\n\nOutput ONLY valid JSON (no markdown, no backticks). Return a JSON object with: "title" (YouTube title under 70 chars, click-optimized), "script" (the full script text), "wordCount" (number).';
    const result = await callGroq(systemPrompt, 'Write a complete YouTube video script for: ' + topic + ' (Niche: ' + niche + ')');
    dbg('generateScript raw:', result.slice(0, 200));
    return JSON.parse(cleanJsonString(result));
  }

  async function generateImagePrompt(topic, niche) {
    const systemPrompt = 'You are an elite YouTube thumbnail designer. Create a thumbnail image prompt that maximizes click-through rate for the video titled "' + topic + '" in the ' + niche + ' niche.\n\nRequirements:\n- photorealistic\n- ultra detailed\n- emotional facial expression\n- dramatic lighting\n- cinematic composition\n- vivid colors\n- high contrast\n- professional YouTube thumbnail\n- visually shocking\n- realistic skin texture\n- depth of field\n- viral thumbnail style\n- maximum CTR\n- 16:9 composition\n- no text\n\nReturn only the image prompt string. No explanation. No markdown. Max 80 words.';
    const result = await callGroq(systemPrompt, 'Create a viral YouTube thumbnail prompt for: ' + topic);
    const cleaned = result.replace(/```/g, '').trim();
    dbg('generateImagePrompt:', cleaned);
    return cleaned;
  }

  return { generateIdeas, generateScript, generateImagePrompt, getApiKey, getLang };
})();
