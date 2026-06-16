import fs from 'fs';
import dotenv from 'dotenv';
import { getTemplatePath, getTemplatePublicUrl } from './templates.js';
dotenv.config();

const HF_TOKEN = process.env.HF_ACCESS_TOKEN;
const HF_ENDPOINT = 'https://api-inference.huggingface.co/models/timbrooks/instruct-pix2pix';
const TIMEOUT_MS = 30000;

const NICHE_PROMPTS = {
  'Dark Mystery': 'Transform the background into a dark foggy abandoned corridor with dim warm light seeping through cracked windows, eerie atmosphere, no text',
  'True Crime': 'Change the background to a moody dimly lit detective board with red string connecting evidence photos, dark noir atmosphere, no text',
  'Finance': 'Change background details to a beautifully blurred glowing abstract market chart line with green and gold accents, professional atmosphere, no text',
  'Gaming': 'Modify the scene to feature a neon-drenched gaming setup with RGB keyboard glow and holographic screen effects, energetic vibe, no text',
  'Motivation': 'Transform the background into a golden sunrise over a mountain peak with warm rays breaking through clouds, inspirational atmosphere, no text',
  'Education': 'Change the background to a warm library study space with glowing desk lamp and blurred bookshelves, focused learning atmosphere, no text',
  'History': 'Modify the background to show an ancient weathered parchment texture with sepia tones and subtle faded map lines, historic atmosphere, no text',
  'Tech': 'Modify the central item to a sleek glowing modern gadget with holographic interface elements floating nearby, vibrant color splash background, no text',
  'Technology': 'Modify the central item to a sleek glowing modern gadget with holographic interface elements floating nearby, vibrant color splash background, no text',
  'Health': 'Transform the background into a serene nature setting with soft green bokeh and gentle morning light streaming through leaves, fresh atmosphere, no text',
  'Food': 'Modify the main counter space to feature a highly detailed fresh ingredient arrangement with steam rising gently, cinematic studio lighting, no text',
  'Travel': 'Change the background to a breathtaking scenic vista with warm golden hour light and soft atmospheric haze, wanderlust atmosphere, no text',
  'Relationships': 'Transform the background into a warm intimate space with soft candlelight glow and gentle bokeh hearts, emotional atmosphere, no text',
  'Business': 'Modify the background to a sleek modern city skyline boardroom with floor-to-ceiling windows and blue ambient lighting, professional atmosphere, no text',
  'Mythology': 'Transform the background into an ancient temple ruin with divine golden light rays piercing through stone columns, epic mystical atmosphere, no text',
  'Astrology': 'Change the background to a deep cosmic starfield with glowing nebula clouds and shimmering zodiac constellation lines, celestial atmosphere, no text',
  'General': 'Transform the background into a clean modern gradient with soft atmospheric lighting and subtle geometric patterns, professional YouTube style, no text',
  'Default': 'Transform the background into a clean modern gradient with soft atmospheric lighting and subtle geometric patterns, professional YouTube style, no text'
};

function rejectAfterTimeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`HF API timed out after ${ms}ms`)), ms)
  );
}

function imageToDataUri(buffer, mime) {
  return `data:${mime || 'image/png'};base64,${buffer.toString('base64')}`;
}

export async function generateThumbnail(prompt, niche = 'General') {
  const instruction = NICHE_PROMPTS[niche] || NICHE_PROMPTS['Default'];

  // Always read the template image — it serves as both HF input and fallback
  const templatePath = getTemplatePath(niche);
  let templateBuffer;
  try {
    templateBuffer = fs.readFileSync(templatePath);
  } catch {
    return { url: getTemplatePublicUrl(niche), provider: 'template-fallback' };
  }

  if (!HF_TOKEN) {
    console.warn('HF_ACCESS_TOKEN not configured — returning template');
    return { url: getTemplatePublicUrl(niche), provider: 'template-fallback' };
  }

  try {
    const response = await Promise.race([
      fetch(`${HF_ENDPOINT}?prompt=${encodeURIComponent(instruction)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'image/png'
        },
        body: templateBuffer
      }),
      rejectAfterTimeout(TIMEOUT_MS)
    ]);

    if (!response.ok) {
      throw new Error(`HF API returned ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const outputBuffer = Buffer.from(await response.arrayBuffer());

    if (!outputBuffer || outputBuffer.length < 100) {
      throw new Error('HF returned empty or corrupted image');
    }

    return { url: imageToDataUri(outputBuffer, contentType), provider: 'huggingface-pix2pix' };
  } catch (err) {
    console.error('HF thumbnail failed:', err.message, '— returning template');
    return { url: getTemplatePublicUrl(niche), provider: 'template-fallback' };
  }
}
