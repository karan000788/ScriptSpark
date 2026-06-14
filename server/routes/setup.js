import { Router } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Client } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

const projectRef = 'einfzxirrwpkvzrpdnma';
const password = 'pKMbffQ7+#@Y.dh';

router.get('/sql', (req, res) => {
  try {
    const sql = readFileSync(path.join(__dirname, '..', 'supabase-schema.sql'), 'utf-8');
    res.type('text/plain').send(sql);
  } catch (err) {
    res.status(500).send('Error reading SQL file: ' + err.message);
  }
});

router.get('/db', async (req, res) => {
  const results = [];
  let connected = false;

  const regions = ['ap-south-1', 'ap-southeast-1', 'us-east-1', 'eu-west-1'];
  const projectRef = 'einfzxirrwpkvzrpdnma';
  const password = 'pKMbffQ7+#@Y.dh';

  for (const region of regions) {
    try {
      const client = new Client({
        connectionString: `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:6543/postgres`,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });
      await client.connect();
      results.push(`Pooler ${region}: Connected`);

      const sql = readFileSync(path.join(__dirname, '..', 'supabase-schema.sql'), 'utf-8');
      await client.query(sql);
      results.push('Schema applied');

      const tables = ['users', 'channels', 'channel_analysis', 'creator_profiles', 'scripts', 'thumbnails', 'generation_history', 'competitor_analysis'];
      let allExist = true;
      for (const table of tables) {
        const r = await client.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)`, [table]);
        const exists = r.rows[0].exists;
        results.push(`${exists ? 'EXISTS' : 'MISSING'} ${table}`);
        if (!exists) allExist = false;
      }

      await client.end();
      connected = true;

      return res.json({ success: true, message: 'Database ready', results, allTablesExist: allExist });
    } catch (err) {
      results.push(`${region}: ${err.message.substring(0, 120)}`);
    }
  }

  if (!connected) {
    return res.json({
      success: false,
      message: 'Cannot connect from this environment. Run SQL manually.',
      results,
      manualUrl: `https://supabase.com/dashboard/project/${projectRef}/sql/new`
    });
  }
});

export default router;
