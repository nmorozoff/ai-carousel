
-- ============================================
-- 1. Drop ALL existing RESTRICTIVE policies
-- ============================================

-- activity_log
DROP POLICY IF EXISTS "Admins can read all activity" ON activity_log;
DROP POLICY IF EXISTS "Users can insert own activity" ON activity_log;
DROP POLICY IF EXISTS "Users can read own activity" ON activity_log;

-- carousel_sessions
DROP POLICY IF EXISTS "Users insert own sessions" ON carousel_sessions;
DROP POLICY IF EXISTS "Users see own sessions" ON carousel_sessions;

-- generation_logs
DROP POLICY IF EXISTS "Admins can read all generation logs" ON generation_logs;
DROP POLICY IF EXISTS "Users can insert own generation logs" ON generation_logs;
DROP POLICY IF EXISTS "Users can read own generation logs" ON generation_logs;

-- payments
DROP POLICY IF EXISTS "Admins can read all payments" ON payments;
DROP POLICY IF EXISTS "Users can insert own payments" ON payments;
DROP POLICY IF EXISTS "Users can read own payments" ON payments;

-- profiles
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- subscriptions
DROP POLICY IF EXISTS "Admins can manage all subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can read own subscriptions" ON subscriptions;

-- user_roles
DROP POLICY IF EXISTS "Users can read own role" ON user_roles;

-- ============================================
-- 2. Recreate as PERMISSIVE with consolidated conditions
-- ============================================

-- activity_log
CREATE POLICY "activity_log_select" ON activity_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "activity_log_insert" ON activity_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- carousel_sessions
CREATE POLICY "carousel_sessions_select" ON carousel_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "carousel_sessions_insert" ON carousel_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- generation_logs
CREATE POLICY "generation_logs_select" ON generation_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "generation_logs_insert" ON generation_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- payments
CREATE POLICY "payments_select" ON payments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "payments_insert" ON payments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- subscriptions
CREATE POLICY "subscriptions_select" ON subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "subscriptions_all_admin" ON subscriptions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- user_roles
CREATE POLICY "user_roles_select" ON user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- 3. Fix has_api_keys to use auth.uid() only
-- ============================================
CREATE OR REPLACE FUNCTION public.has_api_keys()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'has_gemini', (gemini_api_key IS NOT NULL AND gemini_api_key != ''),
    'has_grsai', (grsai_api_key IS NOT NULL AND grsai_api_key != ''),
    'preferred_api', preferred_api
  )
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;
