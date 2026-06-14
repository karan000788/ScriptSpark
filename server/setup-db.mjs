import dotenv from 'dotenv';
dotenv.config();
import { readFileSync } from 'fs';
import pkg from 'pg';
const { Client } = pkg;

async function setup() {
  const projectRef = 'einfzxirrwpkvzrpdnma';
  const password = 'pKMbffQ7+#@Y.dh';

  // Try all possible regions
  const regions = ['ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'us-east-1', 'us-west-1', 'eu-west-1', 'eu-central-1', 'sa-east-1'];

  for (const region of regions) {
    try {
      const client = new Client({
        connectionString: `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:6543/postgres`,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });
      await client.connect();
      console.log(`✅ Connected via pooler (${region})`);

      const sql = readFileSync('./supabase-schema.sql', 'utf-8');
      await client.query(sql);
      console.log('✅ Schema applied!');

      const tables = ['users', 'channels', 'channel_analysis', 'creator_profiles', 'scripts', 'thumbnails', 'generation_history', 'competitor_analysis'];
      for (const table of tables) {
        const res = await client.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)`, [table]);
        console.log(`${res.rows[0].exists ? '✅' : '❌'} ${table}`);
      }
      await client.end();
      return;
    } catch (err) {
      // Try next region
    }
  }

  // Try direct connection
  try {
    const client = new Client({
      host: `db.${projectRef}.supabase.co`,
      port: 5432,
      user: 'postgres',
      password,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });
    await client.connect();
    console.log('✅ Connected directly');

    const sql = readFileSync('./supabase-schema.sql', 'utf-8');
    await client.query(sql);
    console.log('✅ Schema applied!');

    const tables = ['users', 'channels', 'channel_analysis', 'creator_profiles', 'scripts', 'thumbnails', 'generation_history', 'competitor_analysis'];
    for (const table of tables) {
      const res = await client.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)`, [table]);
      console.log(`${res.rows[0].exists ? '✅' : '❌'} ${table}`);
    }
    await client.end();
    return;
  } catch (err) {
    console.log('Direct connection failed:', err.message);
  }

  console.log('\n⚠️  Could not connect automatically.');
  console.log('📋 Please run the SQL manually in Supabase SQL Editor:');
  console.log(`1. https://supabase.com/dashboard/project/${projectRef}/sql/new`);
  console.log('2. Copy the content of server/supabase-schema.sql');
  console.log('3. Paste and click Run');
}

setup().catch(err => console.error(err.message));
