// ============================================================
//  ScriptSpark AI Video Production Pipeline
//  14-step automated faceless YouTube video generation
// ============================================================

const PIPELINE = {
  // ---- Step 1: Analyze Topic ----
  async analyzeTopic(topic, lang) {
    const prompt = `You are a YouTube content strategist. Analyze this video topic and return a JSON object.

Topic: "${topic}"
Language: ${lang}

Return ONLY a JSON object (no markdown, no explanation):
{
  "topic": "${topic}",
  "niche": "detect niche from topic (mystery, horror, history, business, technology, crime, science, psychology, etc.)",
  "audience": "primary audience demographic",
  "search_intent": "what viewers search for related to this topic",
  "competition_level": "low|medium|high",
  "virality_potential": "low|medium|high",
  "content_gaps": ["gap1", "gap2", "gap3"],
  "recommended_angle": "the most compelling angle for this topic",
  "emotional_triggers": ["trigger1", "trigger2"],
  "key_questions": ["question1", "question2", "question3"]
}`;

    const response = await callAI(prompt);
    try {
      return JSON.parse(response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      return { topic, niche: "general", audience: "general", recommended_angle: topic };
    }
  },

  // ---- Step 2: Research Topic ----
  async researchTopic(topic, niche, angle) {
    const prompt = `You are a research expert. Research this topic thoroughly and provide detailed facts, statistics, and context.

Topic: "${topic}"
Niche: ${niche}
Angle: ${angle}

Return ONLY a JSON object (no markdown):
{
  "key_facts": ["fact1 with source", "fact2 with source", "fact3 with source", "fact4 with source", "fact5 with source"],
  "statistics": ["stat1", "stat2", "stat3"],
  "timeline": [
    {"year": "event description"},
    {"year": "event description"}
  ],
  "expert_quotes": ["quote1", "quote2"],
  "controversies": ["controversy1"],
  "hidden_secrets": ["secret1", "secret2"],
  "real_world_connections": ["connection1", "connection2"],
  "viewer_takeaways": ["takeaway1", "takeaway2", "takeaway3"]
}`;

    const response = await callAI(prompt);
    try {
      return JSON.parse(response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      return { key_facts: [], statistics: [], timeline: [], viewer_takeaways: [] };
    }
  },

  // ---- Step 3: Find Best Video Angle ----
  async findBestAngle(topic, research, niche) {
    const prompt = `You are a viral content strategist. Based on the research, find the BEST angle that will maximize views and retention.

Topic: "${topic}"
Niche: ${niche}
Key Facts: ${JSON.stringify(research.key_facts?.slice(0, 5) || [])}
Secrets: ${JSON.stringify(research.hidden_secrets || [])}

Return ONLY a JSON object (no markdown):
{
  "primary_angle": "the single most compelling angle — make it specific and curiosity-driven",
  "why_this_angle": "why this angle works for viral content",
  "hook_concept": "the opening concept that grabs attention in 3 seconds",
  "tension_points": ["tension1", "tension2", "tension3"],
  "payoff_promises": ["what the viewer will learn/discover"],
  "emotional_journey": ["curiosity", "surprise", "satisfaction"],
  "target_ctr": "estimated click-through potential: low|medium|high|viral"
}`;

    const response = await callAI(prompt);
    try {
      return JSON.parse(response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      return { primary_angle: topic, hook_concept: topic, tension_points: [] };
    }
  },

  // ---- Step 4: Create Viral Title ----
  async createViralTitle(topic, angle, niche) {
    const prompt = `You are a YouTube title expert. Create 5 viral titles for this video.

Topic: "${topic}"
Angle: ${typeof angle === 'object' ? angle.primary_angle : angle}
Niche: ${niche}

Title rules:
- NEVER use generic titles like "History of X"
- Always create curiosity gaps
- Use power words that trigger emotion
- Reference successful YouTube title patterns
- Make titles specific, not vague
- Max 60 characters for Shorts, 70 for long-form

Examples of GOOD titles:
- "The Lost Underwater Kingdom Scientists Can't Explain"
- "The Hacker Who Disappeared After Stealing Millions"
- "The Manipulation Technique You Never Notice"

Return ONLY a JSON object (no markdown):
{
  "titles": [
    {"title": "title1", "style": "curiosity_gap", "emotional_trigger": "wonder"},
    {"title": "title2", "style": "shock_value", "emotional_trigger": "fear"},
    {"title": "title3", "style": "story_driven", "emotional_trigger": "suspense"},
    {"title": "title4", "style": "educational", "emotional_trigger": "discovery"},
    {"title": "title5", "style": "controversial", "emotional_trigger": "outrage"}
  ],
  "recommended_title": "the single best title",
  "title_rationale": "why this title will perform"
}`;

    const response = await callAI(prompt);
    try {
      return JSON.parse(response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      return { titles: [{ title: topic }], recommended_title: topic };
    }
  },

  // ---- Step 5: Create Thumbnail Concepts ----
  async createThumbnailConcepts(title, niche, angle) {
    const prompt = `You are a YouTube thumbnail expert. Create 3 thumbnail concepts that will maximize CTR.

Title: "${typeof title === 'object' ? title.recommended_title : title}"
Niche: ${niche}
Angle: ${typeof angle === 'object' ? angle.primary_angle : angle}

Return ONLY a JSON object (no markdown):
{
  "thumbnails": [
    {
      "concept": "detailed description of what the thumbnail shows",
      "main_subject": "the focal point of the thumbnail",
      "background": "background environment",
      "text_overlay": "short text on thumbnail (max 5 words)",
      "color_scheme": "dominant colors",
      "mood": "emotional tone",
      "style": "photorealistic|dramatic|cinematic"
    }
  ],
  "recommended_concept": "which thumbnail number to use (1-3)"
}`;

    const response = await callAI(prompt);
    try {
      return JSON.parse(response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      return { thumbnails: [{ concept: title, style: "cinematic" }] };
    }
  },

  // ---- Step 6: Create Story Structure ----
  async createStoryStructure(topic, research, angle, niche) {
    const prompt = `You are a master storyteller. Create a compelling story structure for this video.

Topic: "${topic}"
Angle: ${typeof angle === 'object' ? angle.primary_angle : angle}
Niche: ${niche}
Key Facts: ${JSON.stringify(research.key_facts?.slice(0, 8) || [])}
Secrets: ${JSON.stringify(research.hidden_secrets || [])}
Timeline: ${JSON.stringify(research.timeline?.slice(0, 5) || [])}

Return ONLY a JSON object (no markdown):
{
  "story_type": "documentary|investigation|comparison|timeline|mystery",
  "narrative_arc": {
    "setup": "establish the world/context in first 30 seconds",
    "inciting_incident": "the moment that changes everything",
    "rising_action": ["escalation point 1", "escalation point 2", "escalation point 3"],
    "climax": "the peak moment of tension/discovery",
    "resolution": "the satisfying conclusion"
  },
  "scene_flow": [
    {"scene": 1, "purpose": "hook", "emotion": "curiosity", "duration_sec": 8},
    {"scene": 2, "purpose": "setup", "emotion": "interest", "duration_sec": 12},
    {"scene": 3, "purpose": "conflict", "emotion": "tension", "duration_sec": 15}
  ],
  "pacing_notes": "how to maintain viewer attention throughout"
}`;

    const response = await callAI(prompt);
    try {
      return JSON.parse(response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      return { story_type: "documentary", narrative_arc: {}, scene_flow: [] };
    }
  },

  // ---- Step 7: Write High-Retention Script ----
  async writeScript(title, research, angle, storyStructure, niche, lang, duration) {
    const nicheStyle = {
      mystery: "Use suspense, unanswered questions, and a sense of the unknown. Create curiosity loops that keep viewers watching. Build tension gradually.",
      horror: "Use fear, tension, and cinematic storytelling. Create dread through vivid descriptions. Use short, punchy sentences for impact.",
      history: "Use documentary storytelling with discoveries and historical context. Paint vivid pictures of the past. Make history feel alive and relevant.",
      business: "Use case-study storytelling with insights and lessons. Reference real companies and outcomes. Make business lessons actionable.",
      technology: "Use explanations mixed with curiosity and future implications. Make complex tech accessible. Use analogies viewers understand.",
      crime: "Use investigation style with evidence and timeline. Build the case piece by piece. Create suspense through revelations.",
      science: "Use wonder and discovery. Explain complex concepts simply. Connect science to everyday life.",
      psychology: "Use revelation and self-discovery. Help viewers understand themselves. Reference studies and experiments."
    };

    const style = nicheStyle[niche] || nicheStyle.mystery;

    const prompt = `You are a professional YouTube scriptwriter. Write a high-retention script for this video.

Title: "${typeof title === 'object' ? title.recommended_title : title}"
Niche: ${niche}
Writing Style: ${style}
Language: ${lang}
Target Duration: ${duration} seconds

Key Facts to Include: ${JSON.stringify(research.key_facts?.slice(0, 6) || [])}
Secrets: ${JSON.stringify(research.hidden_secrets || [])}
Timeline: ${JSON.stringify(research.timeline?.slice(0, 4) || [])}
Viewer Takeaways: ${JSON.stringify(research.viewer_takeaways || [])}

CRITICAL RULES:
- Strong hook within first 5 seconds
- Human-sounding narration (write like you talk)
- Curiosity loops throughout
- Pattern interrupts every 20-30 seconds
- Emotional engagement
- NO robotic language
- NO repetitive wording
- NO filler words
- Write in ${lang} language

Return ONLY a JSON object (no markdown):
{
  "script": "the full narration text, written as natural spoken language",
  "hook": "the first 5-second hook",
  "word_count": 0,
  "estimated_duration_sec": 0,
  "curiosity_loops": ["loop1", "loop2"],
  "pattern_interrupts": ["interrupt1", "interrupt2"],
  "emotional_beats": ["beat1", "beat2", "beat3"]
}`;

    const response = await callAI(prompt);
    try {
      const parsed = JSON.parse(response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      // Estimate duration from word count if not provided
      if (!parsed.estimated_duration_sec && parsed.script) {
        const words = parsed.script.split(/\s+/).length;
        parsed.estimated_duration_sec = Math.round(words / 2.5); // ~150 wpm = 2.5 wps
        parsed.word_count = words;
      }
      return parsed;
    } catch {
      // If JSON fails, try to extract the script text
      const scriptText = response.replace(/```[\s\S]*?```/g, "").trim();
      const words = scriptText.split(/\s+/).length;
      return {
        script: scriptText,
        hook: scriptText.split('.')[0] || '',
        word_count: words,
        estimated_duration_sec: Math.round(words / 2.5),
        curiosity_loops: [],
        pattern_interrupts: [],
        emotional_beats: []
      };
    }
  },

  // ---- Step 8: Create Scene Breakdown ----
  async createSceneBreakdown(script, title, niche, duration) {
    const prompt = `You are a video director. Break this script into scenes for a ${duration}-second video.

Script: "${script}"
Title: "${typeof title === 'object' ? title.recommended_title : title}"
Niche: ${niche}

Each scene must have:
- Narration text (a portion of the script)
- Visual description (what should be on screen — NO text overlays, only visuals)
- Camera angle
- Camera movement
- Mood
- Duration in seconds
- Transition to next scene
- Music mood

Return ONLY a JSON object (no markdown):
{
  "scenes": [
    {
      "scene_number": 1,
      "narration": "the exact narration text for this scene",
      "visual_description": "detailed visual — what the viewer SEES (not text, real imagery)",
      "camera_angle": "wide|medium|close-up|extreme-close-up|aerial|low-angle",
      "camera_movement": "static|slow-zoom-in|slow-zoom-out|pan-left|pan-right|tilt-up|tilt-down|tracking|dolly",
      "mood": "mysterious|tense|calm|epic|dark|bright|dramatic",
      "duration_sec": 8,
      "transition": "fade|cut|zoom|dissolve|wipe",
      "music_mood": "suspenseful|ambient|epic|calm|dark|uplifting",
      "visual_prompt": "a detailed prompt for AI image generation — cinematic, realistic, no text"
    }
  ],
  "total_duration_sec": 0,
  "scene_count": 0
}`;

    const response = await callAI(prompt);
    try {
      const parsed = JSON.parse(response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
      parsed.scene_count = parsed.scenes?.length || 0;
      parsed.total_duration_sec = parsed.scenes?.reduce((s, sc) => s + (sc.duration_sec || 0), 0) || 0;
      // Ensure we have at least some scenes
      if (!parsed.scenes || parsed.scenes.length === 0) {
        throw new Error("No scenes in parsed response");
      }
      return parsed;
    } catch (parseErr) {
      console.warn("[createSceneBreakdown] JSON parse failed, generating fallback scenes:", parseErr);
      // Generate fallback scenes from the script text
      const sentences = script.match(/[^.!?]+[.!?]+/g) || [script];
      const sceneCount = Math.max(3, Math.min(10, Math.ceil(duration / 10)));
      const secPerScene = Math.max(4, Math.round(duration / sceneCount));
      const perScene = Math.ceil(sentences.length / sceneCount);
      const fallbackScenes = [];
      for (let i = 0; i < sceneCount; i++) {
        const chunk = sentences.slice(i * perScene, (i + 1) * perScene).join(" ").trim();
        fallbackScenes.push({
          scene_number: i + 1,
          narration: chunk || `Scene ${i + 1}`,
          visual_description: `cinematic scene showing ${niche} content`,
          camera_angle: i === 0 ? "wide" : "medium",
          camera_movement: "slow-zoom-in",
          mood: i === 0 ? "mysterious" : "calm",
          duration_sec: secPerScene,
          transition: "fade",
          music_mood: "ambient",
          visual_prompt: `cinematic ${niche} scene, documentary style, dramatic lighting`
        });
      }
      return { scenes: fallbackScenes, total_duration_sec: duration, scene_count: fallbackScenes.length };
    }
  },

  // ---- Step 9: Create AI Visual Prompts ----
  async createVisualPrompts(scenes, niche) {
    const prompt = `You are an AI image generation expert. Create detailed prompts for each scene to generate cinematic visuals.

Scenes: ${JSON.stringify(scenes.map((s, i) => ({
      scene: i + 1,
      visual: s.visual_description,
      mood: s.mood,
      camera: s.camera_angle
    })))}
Niche: ${niche}

Each prompt must be:
- Cinematic and realistic
- Detailed with lighting, color grading, atmosphere
- NO text in the image
- NO watermarks
- Professional documentary quality
- Optimized for FLUX/DALL-E image generation

Return ONLY a JSON object (no markdown):
{
  "visual_prompts": [
    {
      "scene_number": 1,
      "prompt": "detailed cinematic prompt for image generation",
      "negative_prompt": "what to avoid in the image",
      "style": "photorealistic|cinematic|documentary|dramatic",
      "lighting": "natural|dramatic|moody|bright|golden-hour|blue-hour",
      "color_grading": "warm|cool|desaturated|high-contrast|muted"
    }
  ]
}`;

    const response = await callAI(prompt);
    try {
      return JSON.parse(response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      return { visual_prompts: scenes.map((s, i) => ({
        scene_number: i + 1,
        prompt: s.visual_description || s.visual_prompt || `cinematic scene ${i + 1}`,
        style: "cinematic",
        lighting: "dramatic"
      }))};
    }
  },

  // ---- Step 10: Generate Visual Assets ----
  async generateVisualAssets(visualPrompts, scenes, format) {
    const width = format === "shorts" ? 1080 : 1920;
    const height = format === "shorts" ? 1920 : 1080;
    const assets = [];

    for (let i = 0; i < visualPrompts.length; i++) {
      const vp = visualPrompts[i];
      const prompt = vp.prompt || scenes[i]?.visual_description || `cinematic scene ${i + 1}`;

      try {
        const imageUrl = await generateImage(prompt, width, height, i);
        assets.push({
          scene_number: vp.scene_number || i + 1,
          url: imageUrl,
          prompt: prompt,
          loaded: false,
          el: null
        });
      } catch (e) {
        console.warn(`[Pipeline] Image generation failed for scene ${i + 1}:`, e);
        // Fallback to Pollinations.ai direct URL
        const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=flux&seed=${i * 100}`;
        assets.push({
          scene_number: vp.scene_number || i + 1,
          url: fallbackUrl,
          prompt: prompt,
          loaded: false,
          el: null
        });
      }
    }

    // Pre-load all images
    for (const asset of assets) {
      try {
        const img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.crossOrigin = "anonymous";
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error("load failed"));
          setTimeout(() => reject(new Error("timeout")), 30000);
          i.src = asset.url;
        });
        asset.el = img;
        asset.loaded = true;
      } catch (e) {
        console.warn(`[Pipeline] Failed to load image for scene ${asset.scene_number}:`, e);
      }
    }

    return assets;
  },

  // ---- Step 11: Generate Voiceover ----
  async generateVoiceover(scenes, lang, niche) {
    const voiceMap = {
      mystery: { rate: 0.9, pitch: 0.85, preferred: ["Microsoft David", "Google UK English Male"] },
      horror: { rate: 0.85, pitch: 0.8, preferred: ["Microsoft David", "Google UK English Male"] },
      history: { rate: 0.95, pitch: 1.0, preferred: ["Microsoft Mark", "Google US English Male"] },
      business: { rate: 1.0, pitch: 1.0, preferred: ["Microsoft David", "Google US English Male"] },
      technology: { rate: 1.05, pitch: 1.05, preferred: ["Microsoft Mark", "Google US English Male"] },
      crime: { rate: 0.9, pitch: 0.9, preferred: ["Microsoft David", "Google UK English Male"] },
      science: { rate: 1.0, pitch: 1.0, preferred: ["Microsoft Mark", "Google US English Male"] },
      psychology: { rate: 0.95, pitch: 0.95, preferred: ["Microsoft David", "Google US English Male"] },
    };

    const voiceSettings = voiceMap[niche] || voiceMap.mystery;
    const langVoiceMap = {
      "en": "en-US",
      "hi": "hi-IN",
      "es": "es-ES",
      "fr": "fr-FR",
      "de": "de-DE",
      "ja": "ja-JP",
      "ko": "ko-KR",
      "pt": "pt-BR",
      "ar": "ar-SA",
    };
    const bcpLang = langVoiceMap[lang] || "en-US";

    const voiceovers = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const text = scene.narration || "";
      if (!text.trim()) continue;

      try {
        const audioBlob = await synthesizeSpeech(text, bcpLang, voiceSettings);
        voiceovers.push({
          scene_number: i + 1,
          blob: audioBlob,
          url: audioBlob ? URL.createObjectURL(audioBlob) : null,
          duration_sec: scene.duration_sec || 0,
          text: text
        });
      } catch (e) {
        console.warn(`[Pipeline] TTS failed for scene ${i + 1}:`, e);
        voiceovers.push({
          scene_number: i + 1,
          blob: null,
          url: null,
          duration_sec: scene.duration_sec || 0,
          text: text
        });
      }
    }

    return voiceovers;
  },

  // ---- Step 12: Select Background Music ----
  async selectBackgroundMusic(niche, mood, duration) {
    // Try Pixabay API first (if key available), then fallback to synthesized music
    const pixabayKey = localStorage.getItem("spark_pixabay_key") || "";

    if (pixabayKey) {
      try {
        const query = `${niche} ${mood} background music`;
        const url = `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey)}&q=${encodeURIComponent(query)}&media_type=music&per_page=5`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          if (data.hits?.length) {
            const track = data.hits[0];
            return {
              source: "pixabay",
              name: track.tags || "Background Music",
              url: track.audio || track.previewURL,
              duration: track.duration || duration,
              mood: mood,
              download_url: track.audio
            };
          }
        }
      } catch (e) {
        console.warn("[Pipeline] Pixabay music fetch failed:", e);
      }
    }

    // Fallback: use synthesized music
    return {
      source: "synthesized",
      name: `${niche} ${mood} background`,
      url: null,
      duration: duration,
      mood: mood
    };
  },

  // ---- Step 13: Assemble Video ----
  async assembleVideo(scenes, assets, voiceovers, music, title, format, onProgress) {
    const W = format === "shorts" ? 1080 : 1920;
    const H = format === "shorts" ? 1920 : 1080;
    const fps = 30;
    const totalDuration = scenes.reduce((s, sc) => s + (sc.duration_sec || 0), 0);

    // Create offscreen canvas
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    // Set up MediaRecorder
    const stream = canvas.captureStream(fps);

    // Add audio tracks if available
    if (music && music.source === "synthesized") {
      // Build audio track using Web Audio API
      const audioResult = await buildVideoAudio(totalDuration, scenes, music);
      if (audioResult && audioResult.stream) {
        audioResult.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      }
    }

    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
      .find(m => MediaRecorder.isTypeSupported(m)) || "video/webm";

    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: format === "shorts" ? 8_000_000 : 6_000_000
    });

    const chunks = [];
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    const recordingDone = new Promise(resolve => recorder.onstop = resolve);
    recorder.start(100);

    // Render frames
    let currentTime = 0;
    const framePromises = [];

    for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
      const scene = scenes[sceneIdx];
      const asset = assets[sceneIdx];
      const sceneDuration = scene.duration_sec || 5;
      const sceneFrames = Math.ceil(sceneDuration * fps);

      for (let frame = 0; frame < sceneFrames; frame++) {
        const frameTime = frame / fps;
        const progress = (currentTime + frameTime) / totalDuration;

        // Clear canvas
        ctx.clearRect(0, 0, W, H);

        // Draw background image with Ken Burns effect
        if (asset && asset.el) {
          drawCinematicBackground(ctx, asset.el, W, H, frameTime, sceneDuration, scene);
        } else {
          // Fallback: gradient background
          drawFallbackBackground(ctx, W, H, scene, sceneIdx);
        }

        // Draw dark overlay for readability
        const overlayGrad = ctx.createLinearGradient(0, 0, 0, H);
        overlayGrad.addColorStop(0, "rgba(0,0,0,0.1)");
        overlayGrad.addColorStop(0.5, "rgba(0,0,0,0.2)");
        overlayGrad.addColorStop(1, "rgba(0,0,0,0.6)");
        ctx.fillStyle = overlayGrad;
        ctx.fillRect(0, 0, W, H);

        // Draw subtitles
        drawSubtitles(ctx, scene.narration || "", W, H, frameTime, sceneDuration, format);

        // Draw title bar
        drawTitleBar(ctx, title, W, H, format);

        // Draw progress bar
        drawProgressBar(ctx, W, H, progress, scene.scene_number, scenes.length);

        if (onProgress && frame % 15 === 0) {
          onProgress(progress, `Rendering scene ${sceneIdx + 1}/${scenes.length}...`);
        }
      }

      currentTime += sceneDuration;
    }

    // Stop recording
    recorder.stop();
    await recordingDone;

    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    return blob;
  },

  // ---- Step 14: Export Final Video ----
  async exportVideo(blob, title) {
    const url = URL.createObjectURL(blob);
    const filename = `${title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50)}_${Date.now()}.webm`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 10000);

    return { url, filename, size: blob.size };
  }
};


// ============================================================
//  Helper Functions
// ============================================================

// AI call wrapper (uses existing Groq API or Gemini)
async function callAI(prompt) {
  const groqKey = localStorage.getItem("groqKey") || "";

  if (groqKey) {
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 4096
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.choices?.[0]?.message?.content || "";
      }
    } catch (e) {
      console.warn("[callAI] Groq failed:", e);
    }
  }

  throw new Error("No AI API key available. Please add a Groq key in Settings.");
}

// Generate image using Pollinations.ai
async function generateImage(prompt, width, height, seed) {
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&model=flux&seed=${seed * 137}&nologo=true`;

  // Try fetching as blob to avoid CORS issues
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const blob = await resp.blob();
      return URL.createObjectURL(blob);
    }
  } catch (e) {
    console.warn("[generateImage] Blob fetch failed, using direct URL:", e);
  }

  // Fallback: return direct URL (may have CORS issues for canvas)
  return url;
}

// Synthesize speech using Web Speech API
async function synthesizeSpeech(text, lang, settings) {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      reject(new Error("Speech synthesis not supported"));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = settings.rate || 1.0;
    utterance.pitch = settings.pitch || 1.0;
    utterance.volume = 1.0;

    // Try to find a matching voice
    const voices = speechSynthesis.getVoices();
    const preferred = settings.preferred || [];
    for (const name of preferred) {
      const match = voices.find(v => v.name.includes(name));
      if (match) {
        utterance.voice = match;
        break;
      }
    }

    // Capture audio using AudioContext + MediaRecorder
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();

    utterance.onend = () => {
      audioCtx.close();
      // Web Speech API doesn't expose audio stream directly
      // Return null and use synthesized music instead
      resolve(null);
    };

    utterance.onerror = (e) => {
      audioCtx.close();
      reject(new Error(`TTS error: ${e.error}`));
    };

    // For now, just speak and return null
    // Real audio capture requires tab audio sharing
    speechSynthesis.speak(utterance);

    // Resolve after estimated duration
    const estimatedDuration = (text.split(/\s+/).length / 2.5) * 1000;
    setTimeout(() => resolve(null), estimatedDuration + 500);
  });
}

// Draw cinematic background with Ken Burns effect
function drawCinematicBackground(ctx, img, W, H, time, duration, scene) {
  const progress = Math.min(1, time / duration);
  const scale = 1.0 + progress * 0.08; // Slow zoom in
  const panX = Math.sin(progress * Math.PI) * 30;
  const panY = Math.cos(progress * Math.PI) * 15;

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const targetRatio = W / H;
  const imgRatio = iw / ih;

  let baseW, baseH;
  if (imgRatio > targetRatio) {
    baseH = H * scale;
    baseW = baseH * imgRatio;
  } else {
    baseW = W * scale;
    baseH = baseW / imgRatio;
  }

  const dx = (W - baseW) / 2 + panX;
  const dy = (H - baseH) / 2 + panY;

  ctx.drawImage(img, dx, dy, baseW, baseH);
}

// Draw fallback gradient background
function drawFallbackBackground(ctx, W, H, scene, idx) {
  const hue = (idx * 60 + 200) % 360;
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, `hsl(${hue}, 60%, 25%)`);
  grad.addColorStop(1, `hsl(${(hue + 40) % 360}, 70%, 15%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle radial highlight
  const rg = ctx.createRadialGradient(W * 0.3, H * 0.3, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.6);
  rg.addColorStop(0, "rgba(255,255,255,0.05)");
  rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
}

// Draw subtitles with word highlighting
function drawSubtitles(ctx, text, W, H, time, duration, format) {
  if (!text) return;

  const fontSize = format === "shorts" ? 36 : 28;
  const maxW = W * 0.85;
  const words = text.split(/\s+/);
  const wordsPerScene = Math.ceil(words.length / Math.max(1, Math.ceil(duration / 3)));
  const currentWordIdx = Math.floor((time / duration) * words.length);

  // Show a window of words around current position
  const windowSize = Math.min(wordsPerScene, 12);
  const startIdx = Math.max(0, currentWordIdx - Math.floor(windowSize / 2));
  const endIdx = Math.min(words.length, startIdx + windowSize);
  const displayWords = words.slice(startIdx, endIdx);

  ctx.font = `600 ${fontSize}px 'Inter', 'Poppins', system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  // Word wrap
  const lines = [];
  let currentLine = "";
  for (const word of displayWords) {
    const test = currentLine ? currentLine + " " + word : word;
    if (ctx.measureText(test).width > maxW && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineH = fontSize * 1.4;
  const totalH = lines.length * lineH;
  const startY = H * 0.75 - totalH / 2;

  // Draw text shadow + highlight
  lines.forEach((line, i) => {
    const y = startY + i * lineH;
    const isCurrentLine = i === Math.floor(lines.length / 2);

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillText(line, W / 2 + 1, y + 1);

    // Text
    ctx.fillStyle = isCurrentLine ? "#FFFFFF" : "rgba(255,255,255,0.8)";
    ctx.fillText(line, W / 2, y);
  });
}

// Draw title bar
function drawTitleBar(ctx, title, W, H, format) {
  const barH = format === "shorts" ? 50 : 40;
  const barY = H - barH - 20;

  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, barY, W, barH);

  ctx.font = `700 ${format === "shorts" ? 22 : 18}px 'Inter', system-ui, sans-serif`;
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title?.slice(0, 60) || "", W / 2, barY + barH / 2);
}

// Draw progress bar
function drawProgressBar(ctx, W, H, progress, sceneNum, totalScenes) {
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.fillRect(0, H - 4, W, 4);

  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#4F8CFF");
  grad.addColorStop(1, "#8B5CF6");
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - 4, W * progress, 4);
}

// Build synthesized audio track for video
async function buildVideoAudio(duration, scenes, music) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") await ctx.resume();

    const dest = ctx.createMediaStreamDestination();
    const master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(dest);

    const startTime = ctx.currentTime + 0.1;
    const bpm = 96;
    const beat = 60 / bpm;

    // Kick
    for (let t = 0; t < duration; t += beat) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(140, startTime + t);
      osc.frequency.exponentialRampToValueAtTime(40, startTime + t + 0.12);
      g.gain.setValueAtTime(0.001, startTime + t);
      g.gain.exponentialRampToValueAtTime(0.5, startTime + t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + t + 0.18);
      osc.connect(g).connect(master);
      osc.start(startTime + t);
      osc.stop(startTime + t + 0.2);
    }

    // Hi-hat
    for (let t = 0; t < duration; t += beat / 2) {
      const bs = ctx.sampleRate * 0.05;
      const buffer = ctx.createBuffer(1, bs, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bs; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, startTime + t);
      g.gain.exponentialRampToValueAtTime(0.06, startTime + t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + t + 0.04);
      noise.connect(hp).connect(g).connect(master);
      noise.start(startTime + t);
      noise.stop(startTime + t + 0.05);
    }

    // Bass
    const bassNotes = [55, 55, 73.42, 65.41];
    for (let i = 0, t = 0; t < duration; i++, t += beat * 2) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = bassNotes[i % bassNotes.length];
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 350;
      g.gain.setValueAtTime(0.001, startTime + t);
      g.gain.exponentialRampToValueAtTime(0.2, startTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + t + beat * 1.6);
      osc.connect(lp).connect(g).connect(master);
      osc.start(startTime + t);
      osc.stop(startTime + t + beat * 2);
    }

    // Pad
    const padChords = [
      [130.81, 164.81, 196.00],
      [146.83, 174.61, 220.00],
      [130.81, 164.81, 196.00],
      [110.00, 130.81, 164.81],
    ];
    for (let i = 0, t = 0; t < duration; i++, t += beat * 8) {
      const chord = padChords[i % padChords.length];
      chord.forEach((freq) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.001, startTime + t);
        g.gain.linearRampToValueAtTime(0.05, startTime + t + 0.8);
        g.gain.setValueAtTime(0.05, startTime + t + beat * 6);
        g.gain.linearRampToValueAtTime(0.0, startTime + t + beat * 8);
        osc.connect(g).connect(master);
        osc.start(startTime + t);
        osc.stop(startTime + t + beat * 8 + 0.1);
      });
    }

    return { stream: dest.stream, ctx };
  } catch (e) {
    console.warn("[buildVideoAudio] Failed:", e);
    return null;
  }
}


// ============================================================
//  Main Pipeline Orchestrator
// ============================================================

async function runPipeline(topic, lang, format, duration, onProgress) {
  const pipelineState = {
    topic,
    lang,
    format,
    duration,
    analysis: null,
    research: null,
    angle: null,
    titles: null,
    thumbnails: null,
    storyStructure: null,
    script: null,
    scenes: null,
    visualPrompts: null,
    visualAssets: null,
    voiceovers: null,
    music: null,
    videoBlob: null,
  };

  const steps = [
    { name: "Analyzing Topic", fn: async () => {
      pipelineState.analysis = await PIPELINE.analyzeTopic(topic, lang);
      return pipelineState.analysis;
    }},
    { name: "Researching Topic", fn: async () => {
      pipelineState.research = await PIPELINE.researchTopic(
        topic,
        pipelineState.analysis.niche,
        pipelineState.analysis.recommended_angle
      );
      return pipelineState.research;
    }},
    { name: "Finding Best Angle", fn: async () => {
      pipelineState.angle = await PIPELINE.findBestAngle(
        topic,
        pipelineState.research,
        pipelineState.analysis.niche
      );
      return pipelineState.angle;
    }},
    { name: "Creating Viral Title", fn: async () => {
      pipelineState.titles = await PIPELINE.createViralTitle(
        topic,
        pipelineState.angle,
        pipelineState.analysis.niche
      );
      return pipelineState.titles;
    }},
    { name: "Creating Thumbnail Concepts", fn: async () => {
      pipelineState.thumbnails = await PIPELINE.createThumbnailConcepts(
        pipelineState.titles,
        pipelineState.analysis.niche,
        pipelineState.angle
      );
      return pipelineState.thumbnails;
    }},
    { name: "Building Story Structure", fn: async () => {
      pipelineState.storyStructure = await PIPELINE.createStoryStructure(
        topic,
        pipelineState.research,
        pipelineState.angle,
        pipelineState.analysis.niche
      );
      return pipelineState.storyStructure;
    }},
    { name: "Writing High-Retention Script", fn: async () => {
      pipelineState.script = await PIPELINE.writeScript(
        pipelineState.titles,
        pipelineState.research,
        pipelineState.angle,
        pipelineState.storyStructure,
        pipelineState.analysis.niche,
        lang,
        duration
      );
      return pipelineState.script;
    }},
    { name: "Creating Scene Breakdown", fn: async () => {
      pipelineState.scenes = await PIPELINE.createSceneBreakdown(
        pipelineState.script.script,
        pipelineState.titles,
        pipelineState.analysis.niche,
        duration
      );
      return pipelineState.scenes;
    }},
    { name: "Creating Visual Prompts", fn: async () => {
      pipelineState.visualPrompts = await PIPELINE.createVisualPrompts(
        pipelineState.scenes.scenes,
        pipelineState.analysis.niche
      );
      return pipelineState.visualPrompts;
    }},
    { name: "Generating Visual Assets", fn: async () => {
      pipelineState.visualAssets = await PIPELINE.generateVisualAssets(
        pipelineState.visualPrompts.visual_prompts,
        pipelineState.scenes.scenes,
        format
      );
      return pipelineState.visualAssets;
    }},
    { name: "Generating Voiceover", fn: async () => {
      pipelineState.voiceovers = await PIPELINE.generateVoiceover(
        pipelineState.scenes.scenes,
        lang,
        pipelineState.analysis.niche
      );
      return pipelineState.voiceovers;
    }},
    { name: "Selecting Background Music", fn: async () => {
      pipelineState.music = await PIPELINE.selectBackgroundMusic(
        pipelineState.analysis.niche,
        pipelineState.scenes.scenes[0]?.music_mood || "ambient",
        duration
      );
      return pipelineState.music;
    }},
    { name: "Assembling Video", fn: async () => {
      pipelineState.videoBlob = await PIPELINE.assembleVideo(
        pipelineState.scenes.scenes,
        pipelineState.visualAssets,
        pipelineState.voiceovers,
        pipelineState.music,
        pipelineState.titles.recommended_title,
        format,
        onProgress
      );
      return pipelineState.videoBlob;
    }},
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const progress = i / steps.length;

    if (onProgress) {
      onProgress(progress, `Step ${i + 1}/${steps.length}: ${step.name}...`);
    }

    try {
      await step.fn();
    } catch (e) {
      console.error(`[Pipeline] Step ${i + 1} (${step.name}) failed:`, e);
      // Continue with degraded quality
    }
  }

  return pipelineState;
}
