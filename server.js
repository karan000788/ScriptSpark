import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

app.use(express.static(__dirname));

app.post('/api/generate-thumbnail-photo', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      console.error('REPLICATE_API_TOKEN is not set in environment');
      return res.status(500).json({ error: 'Server misconfigured' });
    }

    const predictRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=30'
      },
      body: JSON.stringify({
        input: {
          prompt: prompt.trim(),
          aspect_ratio: '16:9'
        }
      })
    });

    if (!predictRes.ok) {
      const errText = await predictRes.text().catch(() => '');
      console.error('Replicate prediction request failed:', predictRes.status, errText);
      return res.status(502).json({ error: 'Image generation failed, please try again' });
    }

    let prediction = await predictRes.json();

    if (prediction.status !== 'succeeded') {
      const getUrl = prediction.urls?.get;
      if (getUrl) {
        const startTime = Date.now();
        const maxWaitMs = 20000;
        const pollIntervalMs = 1500;

        while (Date.now() - startTime < maxWaitMs) {
          await new Promise(r => setTimeout(r, pollIntervalMs));
          const pollRes = await fetch(getUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!pollRes.ok) break;
          prediction = await pollRes.json();
          if (prediction.status === 'succeeded' || prediction.status === 'failed') break;
        }
      }
    }

    if (prediction.status !== 'succeeded') {
      console.error('Replicate generation did not succeed:', prediction.status, prediction.error);
      return res.status(502).json({ error: 'Image generation failed, please try again' });
    }

    const output = prediction.output;
    const imageUrl = Array.isArray(output) ? output[0] : output;

    if (!imageUrl) {
      console.error('No output URL from Replicate:', prediction);
      return res.status(502).json({ error: 'Image generation failed, please try again' });
    }

    res.json({ imageUrl });

  } catch (err) {
    console.error('Error in /api/generate-thumbnail-photo:', err);
    res.status(502).json({ error: 'Image generation failed, please try again' });
  }
});

app.listen(PORT, () => {
  console.log(`Minimal backend running on port ${PORT}`);
});