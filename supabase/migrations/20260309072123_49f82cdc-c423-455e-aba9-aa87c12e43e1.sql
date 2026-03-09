CREATE OR REPLACE FUNCTION public.has_api_keys(_user_id uuid)
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
  WHERE user_id = _user_id
  LIMIT 1;
$$;