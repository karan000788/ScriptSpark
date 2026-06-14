import dotenv from 'dotenv';
dotenv.config();

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_ENDPOINT = 'https://api.replicate.com/v1';

export const thumbnailProviders = [
  {
    name: 'replicate-flux',
    async generate(prompt) {
      if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not configured');
      const response = await fetch(`${REPLICATE_ENDPOINT}/predictions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait'
        },
        body: JSON.stringify({
          version: 'black-forest-labs/flux-dev',
          input: {
            prompt: prompt + ', YouTube thumbnail, 16:9, high quality, cinematic, photorealistic',
            width: 1024,
            height: 576,
            num_outputs: 1,
            num_inference_steps: 28,
            guidance_scale: 3.5
          }
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.output) {
        const url = Array.isArray(data.output) ? data.output[0] : data.output;
        if (typeof url === 'string') return url;
      }
      if (data.urls?.get) {
        return pollPrediction(data.urls.get);
      }
      throw new Error('Unexpected Replicate response format');
    }
  },
  {
    name: 'replicate-sdxl',
    async generate(prompt) {
      if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not configured');
      const response = await fetch(`${REPLICATE_ENDPOINT}/predictions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait'
        },
        body: JSON.stringify({
          version: 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
          input: {
            prompt: prompt + ', YouTube thumbnail style, 16:9, dramatic lighting, high contrast',
            width: 1024,
            height: 576,
            num_outputs: 1
          }
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.output) {
        const url = Array.isArray(data.output) ? data.output[0] : data.output;
        if (typeof url === 'string') return url;
      }
      if (data.urls?.get) {
        return pollPrediction(data.urls.get);
      }
      throw new Error('Unexpected Replicate response format');
    }
  },
  {
    name: 'pollinations',
    async generate(prompt) {
      const encoded = encodeURIComponent(prompt + ', YouTube thumbnail, 16:9, high contrast, dramatic, photorealistic');
      const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=576&nofeed=true`;
      return url;
    }
  }
];

async function pollPrediction(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` }
    });
    const data = await response.json();
    if (data.status === 'succeeded') {
      if (data.output) {
        return Array.isArray(data.output) ? data.output[0] : data.output;
      }
    }
    if (data.status === 'failed') throw new Error(data.error || 'Image generation failed');
  }
  throw new Error('Image generation timed out');
}

export async function generateThumbnail(prompt) {
  const errors = [];
  for (const provider of thumbnailProviders) {
    try {
      console.log(`Trying thumbnail provider: ${provider.name}`);
      const url = await provider.generate(prompt);
      return { url, provider: provider.name };
    } catch (err) {
      console.error(`Provider ${provider.name} failed:`, err.message);
      errors.push(`${provider.name}: ${err.message}`);
    }
  }
  throw new Error(`All thumbnail providers failed: ${errors.join('; ')}`);
}
