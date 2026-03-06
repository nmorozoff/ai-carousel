-- ============================================================
-- ПОЛНАЯ СХЕМА ДЛЯ НОВОГО ПРОЕКТА SUPABASE
-- Выполни в Supabase Dashboard → SQL Editor → New query
-- Вставь весь скрипт и нажми Run
-- ============================================================

-- 1. Enum для ролей (пропусти если уже есть)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Таблица ролей пользователей
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own role" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- 3. Функция has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- 4. Таблица profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  generation_limit INTEGER DEFAULT 200,
  gemini_api_key TEXT,
  grsai_api_key TEXT,
  preferred_api TEXT DEFAULT 'gemini' CHECK (preferred_api IN ('gemini', 'grsai'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- 5. Таблица subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 6. Таблица generation_logs
CREATE TABLE IF NOT EXISTS public.generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  style TEXT,
  funnel TEXT,
  user_text TEXT,
  slide_count INTEGER,
  caption TEXT,
  duration_ms INTEGER,
  error TEXT,
  slides_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  api_provider TEXT DEFAULT 'gemini'
);

CREATE INDEX IF NOT EXISTS idx_generation_logs_user_id ON public.generation_logs(user_id);
ALTER TABLE public.generation_logs ENABLE ROW LEVEL SECURITY;

-- 7. Таблица activity_log
CREATE TABLE IF NOT EXISTS public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.activity_log(user_id);

-- 8. carousel_sessions
CREATE TABLE IF NOT EXISTS public.carousel_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  style TEXT,
  slide_urls TEXT[],
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '48 hours'
);

CREATE INDEX IF NOT EXISTS idx_carousel_sessions_user_id ON public.carousel_sessions(user_id);
ALTER TABLE public.carousel_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own sessions" ON public.carousel_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own sessions" ON public.carousel_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 9. Storage bucket (если ещё не создан)
INSERT INTO storage.buckets (id, name, public)
VALUES ('carousel-slides', 'carousel-slides', true)
ON CONFLICT (id) DO NOTHING;

-- 10. Storage policies
DROP POLICY IF EXISTS "Users can upload own slides" ON storage.objects;
CREATE POLICY "Users can upload own slides" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'carousel-slides' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can view own slides" ON storage.objects;
CREATE POLICY "Users can view own slides" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'carousel-slides' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own slides" ON storage.objects;
CREATE POLICY "Users can delete own slides" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'carousel-slides' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Public can read carousel slides" ON storage.objects;
CREATE POLICY "Public can read carousel slides" ON storage.objects
  FOR SELECT USING (bucket_id = 'carousel-slides');

-- 11. Политика для админов (profiles)
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 12. Таблица payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  label TEXT,
  payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_label ON public.payments(label);

-- 13. Триггер для создания profile при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name', NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
