import Replicate from 'replicate';
import dotenv from 'dotenv';
dotenv.config();

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

const replicate = new Replicate({
  auth: REPLICATE_API_TOKEN,
});

const MODEL = 'black-forest-labs/flux-schnell';
const TIMEOUT_MS = 40000;

const SENSITIVE_MAP = [
  [/murderer|killer|serial killer|rapist/i, 'mysterious figure'],
  [/murder|kill(ing|ed|er)?/i, 'dark event'],
  [/crypto crash|cryptocurrency crash|bitcoin crash|market crash|collapse/i, 'financial downfall concept'],
  [/lost money|loss money|money loss|financial loss/i, 'financial setback concept'],
  [/deadly|fatal|death|died|dying/i, 'serious'],
  [/suicide|suicidal/i, 'extreme despair'],
  [/blood|gore|violence|violent/i, 'intense scene'],
  [/weapon|gun|knife|shoot(ing|er)?/i, 'object'],
  [/terrorist|terrorism|bomb|explosion/i, 'conflict'],
  [/disease|illness|sickness|plague|pandemic/i, 'health condition'],
  [/accident|crash|wreck|destroy(ed|er)?/i, 'incident'],
  [/corpse|dead body|carcass/i, 'scene'],
  [/torture|abuse|assault/i, 'harsh treatment'],
  [/hostage|kidnap(ped|ing)?/i, 'captive situation']
];

const FALLBACK_COLORS = {
  'Dark Mystery': { bg: ['#1a0a2e', '#0d0415'], accent: '#FF0000', label: 'Dark Mystery' },
  'True Crime': { bg: ['#1a0a1a', '#0d000d'], accent: '#FF4444', label: 'True Crime' },
  'Finance': { bg: ['#0a2e1a', '#051a0f'], accent: '#00FF88', label: 'Finance' },
  'Gaming': { bg: ['#0a0a2e', '#050515'], accent: '#00FFFF', label: 'Gaming' },
  'Motivation': { bg: ['#2e1a0a', '#1a0f05'], accent: '#FFD700', label: 'Motivation' },
  'Education': { bg: ['#0a1a2e', '#050f1a'], accent: '#4A90E2', label: 'Education' },
  'History': { bg: ['#2e1a0a', '#1a0f05'], accent: '#C9A84C', label: 'History' },
  'Tech': { bg: ['#0a0a1a', '#050510'], accent: '#00CFFF', label: 'Technology' },
  'Technology': { bg: ['#0a0a1a', '#050510'], accent: '#00CFFF', label: 'Technology' },
  'Health': { bg: ['#0a2e0a', '#051a05'], accent: '#7ED321', label: 'Health' },
  'Food': { bg: ['#2e1a0a', '#1a0f05'], accent: '#FF6B35', label: 'Food' },
  'Travel': { bg: ['#1a2e2e', '#0f1a1a'], accent: '#F5A623', label: 'Travel' },
  'Relationships': { bg: ['#2e0a1a', '#1a050f'], accent: '#FF6B9D', label: 'Relationships' },
  'Business': { bg: ['#1a1a2e', '#0f0f1a'], accent: '#FFFFFF', label: 'Business' },
  'Mythology': { bg: ['#1a0a2e', '#0d0415'], accent: '#9B59B6', label: 'Mythology' },
  'Astrology': { bg: ['#0a0a2e', '#050515'], accent: '#C39BD3', label: 'Astrology' },
  'General': { bg: ['#1a1a2e', '#0f0f1a'], accent: '#FFFFFF', label: 'General' },
  'Default': { bg: ['#1a1a2e', '#0f0f1a'], accent: '#FFFFFF', label: 'General' }
};

function sanitizePrompt(prompt) {
  let cleaned = prompt;
  for (const [pattern, replacement] of SENSITIVE_MAP) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned;
}

function rejectAfterTimeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Replicate request timed out after ${ms}ms`)), ms)
  );
}

function buildFallbackUrl(niche) {
  const colors = FALLBACK_COLORS[niche] || FALLBACK_COLORS['Default'];
  const [c1, c2] = colors.bg;
  const accent = colors.accent;
  const label = colors.label;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.08"/>
      <stop offset="50%" stop-color="${accent}" stop-opacity="0.02"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.08"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect width="1280" height="720" fill="url(#glow)"/>
  <rect x="0" y="0" width="1280" height="720" fill="url(#fg)"/>
  <line x1="100" y1="180" x2="1180" y2="180" stroke="${accent}" stroke-opacity="0.06" stroke-width="1"/>
  <line x1="100" y1="360" x2="1180" y2="360" stroke="${accent}" stroke-opacity="0.04" stroke-width="1"/>
  <line x1="100" y1="540" x2="1180" y2="540" stroke="${accent}" stroke-opacity="0.06" stroke-width="1"/>
  <circle cx="640" cy="360" r="120" fill="none" stroke="${accent}" stroke-opacity="0.04" stroke-width="1"/>
</svg>`;

  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

export async function generateThumbnail(prompt, niche = 'General') {
  if (!REPLICATE_API_TOKEN) {
    console.warn('REPLICATE_API_TOKEN not configured — returning fallback image');
    return { url: buildFallbackUrl(niche), provider: 'fallback' };
  }

  const sanitized = sanitizePrompt(prompt);

  try {
    const output = await Promise.race([
      replicate.run(MODEL, {
        input: {
          prompt: sanitized + ', YouTube thumbnail, 16:9, high quality, cinematic, photorealistic',
          num_outputs: 1,
          aspect_ratio: '16:9',
          output_format: 'png'
        }
      }),
      rejectAfterTimeout(TIMEOUT_MS)
    ]);

    const url = Array.isArray(output) ? output[0] : output;
    if (typeof url !== 'string' || !url) {
      throw new Error('Unexpected Replicate response format');
    }
    return { url, provider: 'replicate-flux-schnell' };
  } catch (err) {
    console.error('Replicate generation failed:', err.message, '— returning fallback');
    return { url: buildFallbackUrl(niche), provider: 'fallback' };
  }
}
