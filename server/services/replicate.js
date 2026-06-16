import Replicate from 'replicate';
import dotenv from 'dotenv';
dotenv.config();

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

const replicate = new Replicate({
  auth: REPLICATE_API_TOKEN,
});

const MODEL = 'black-forest-labs/flux-schnell';

export async function generateThumbnail(prompt) {
  if (!REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN not configured');
  }

  try {
    const output = await replicate.run(MODEL, {
      input: {
        prompt: prompt + ', YouTube thumbnail, 16:9, high quality, cinematic, photorealistic',
        num_outputs: 1,
        aspect_ratio: '16:9',
        output_format: 'png'
      }
    });

    const url = Array.isArray(output) ? output[0] : output;
    if (typeof url !== 'string' || !url) {
      throw new Error('Unexpected Replicate response format');
    }
    return { url, provider: 'replicate-flux-schnell' };
  } catch (err) {
    console.error('Replicate generation failed:', err.message);
    throw new Error('Image generation failed. Please try again.');
  }
}
