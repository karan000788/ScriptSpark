import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function check() {
  const tables = ['users', 'channels', 'channel_analysis', 'creator_profiles', 'scripts', 'thumbnails', 'generation_history', 'competitor_analysis'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error && error.code === 'PGRST116') {
      console.log(`${table}: ✅ EXISTS (empty)`);
    } else if (error) {
      console.log(`${table}: ❌ ${error.message} (${error.code})`);
    } else {
      console.log(`${table}: ✅ EXISTS`);
    }
  }
}

check().catch(console.error);
