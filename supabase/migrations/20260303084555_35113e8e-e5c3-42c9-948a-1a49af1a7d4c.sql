
-- 1. Create carousel_sessions table
CREATE TABLE IF NOT EXISTS public.carousel_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  style TEXT,
  slide_urls TEXT[],
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '48 hours'
);

CREATE INDEX IF NOT EXISTS idx_carousel_sessions_user_id 
  ON public.carousel_sessions(user_id);

ALTER TABLE public.carousel_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own sessions" ON public.carousel_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own sessions" ON public.carousel_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 2. Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('carousel-slides', 'carousel-slides', true);

-- 3. Storage policies
CREATE POLICY "Users can upload own slides" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'carousel-slides' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view own slides" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'carousel-slides' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own slides" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'carousel-slides' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Public can read carousel slides" ON storage.objects
  FOR SELECT USING (bucket_id = 'carousel-slides');
