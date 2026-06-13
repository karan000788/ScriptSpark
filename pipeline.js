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
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
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
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  }

  /**
   * Step 3: Generate an image prompt for thumbnail creation.
   * Returns { prompt, visualDescription }.
   */
  async function generateThumbnailPrompt(title, script) {
    const lang = getLang();
    const langName = lang === 'hi' ? 'Hindi' : 'English';
    const systemPrompt = `You are a YouTube thumbnail prompt engineer. Based on this video title and script, create a detailed image generation prompt for an eye-catching YouTube thumbnail.

Video Title: "${title}"
Script Summary: "${script.substring(0, 500)}..."

Requirements:
- The prompt should describe a bold, high-contrast thumbnail composition
- Include specific visual elements: a person's expression, key objects, text overlay placement
- Optimal for 1280x720 landscape format
- Style: photorealistic, dramatic lighting, bold colors (red, yellow, orange accents)
- The prompt should be in English (for image generation)
- Also include a brief "visualDescription" in ${langName} explaining what the thumbnail shows

Output ONLY valid JSON (no markdown, no backticks). Return a JSON object with: "prompt" (English image generation prompt, 100-200 words), "visualDescription" (brief description of what the thumbnail shows).`;
    const result = await callGroq(systemPrompt, 'Create a thumbnail prompt for: ' + title);
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  }

  return { generateIdeas, generateScript, generateThumbnailPrompt, getApiKey, getLang };
})();
