-- Creatora - Supabase Database Schema
-- Run this in your Supabase SQL Editor

-- 1. Users table (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- 2. Channels
CREATE TABLE IF NOT EXISTS public.channels (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  name TEXT,
  subscribers BIGINT DEFAULT 0,
  total_views BIGINT DEFAULT 0,
  total_videos INT DEFAULT 0,
  thumbnail TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, channel_id)
);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own channels"
  ON public.channels FOR ALL
  USING (auth.uid() = user_id);

-- 3. Channel Analysis
CREATE TABLE IF NOT EXISTS public.channel_analysis (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  channel_id TEXT,
  channel_name TEXT,
  channel_url TEXT,
  subscribers BIGINT DEFAULT 0,
  total_views BIGINT DEFAULT 0,
  total_videos INT DEFAULT 0,
  average_views BIGINT DEFAULT 0,
  engagement_rate REAL DEFAULT 0,
  upload_frequency TEXT,
  best_videos JSONB DEFAULT '[]',
  worst_videos JSONB DEFAULT '[]',
  viral_topics JSONB DEFAULT '[]',
  title_patterns JSONB DEFAULT '{}',
  raw_data JSONB DEFAULT '{}',
  analysis_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.channel_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own analysis"
  ON public.channel_analysis FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analysis"
  ON public.channel_analysis FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 4. Creator Profiles
CREATE TABLE IF NOT EXISTS public.creator_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  channel_id TEXT,
  best_topics JSONB DEFAULT '[]',
  best_hooks JSONB DEFAULT '[]',
  best_title_styles JSONB DEFAULT '[]',
  thumbnail_style TEXT,
  upload_pattern TEXT,
  average_engagement TEXT,
  recommended_content_type TEXT,
  growth_opportunities JSONB DEFAULT '[]',
  content_gaps JSONB DEFAULT '[]',
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, channel_id)
);

ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profiles"
  ON public.creator_profiles FOR ALL
  USING (auth.uid() = user_id);

-- 5. Scripts
CREATE TABLE IF NOT EXISTS public.scripts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT,
  script TEXT,
  hook TEXT,
  topic TEXT,
  niche TEXT,
  content_type TEXT DEFAULT 'longform',
  word_count INT DEFAULT 0,
  cta TEXT,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own scripts"
  ON public.scripts FOR ALL
  USING (auth.uid() = user_id);

-- 6. Thumbnails
CREATE TABLE IF NOT EXISTS public.thumbnails (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  prompt TEXT,
  title TEXT,
  niche TEXT,
  image_url TEXT,
  alt_prompt TEXT,
  provider TEXT,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.thumbnails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own thumbnails"
  ON public.thumbnails FOR ALL
  USING (auth.uid() = user_id);

-- 7. Generation History
CREATE TABLE IF NOT EXISTS public.generation_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  niche TEXT,
  content_type TEXT,
  input JSONB DEFAULT '{}',
  output JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.generation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own history"
  ON public.generation_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history"
  ON public.generation_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 8. Competitor Analysis
CREATE TABLE IF NOT EXISTS public.competitor_analysis (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  niche TEXT,
  target_audience TEXT,
  language TEXT DEFAULT 'en',
  country TEXT,
  top_channels JSONB DEFAULT '[]',
  channel_analyses JSONB DEFAULT '[]',
  market_patterns JSONB DEFAULT '{}',
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.competitor_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own competitor analysis"
  ON public.competitor_analysis FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own competitor analysis"
  ON public.competitor_analysis FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 9. Indexes
CREATE INDEX IF NOT EXISTS idx_scripts_user ON public.scripts(user_id);
CREATE INDEX IF NOT EXISTS idx_thumbnails_user ON public.thumbnails(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_analysis_user ON public.channel_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_history_user ON public.generation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_competitor_analysis_user ON public.competitor_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_scripts_created ON public.scripts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_history_type ON public.generation_history(type);

-- 10. Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
