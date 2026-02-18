
CREATE TABLE public.generation_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  style text,
  funnel text,
  user_text text,
  slide_count integer,
  caption text,
  duration_ms integer,
  error text,
  slides_json jsonb
);

ALTER TABLE public.generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own generation logs"
  ON public.generation_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own generation logs"
  ON public.generation_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all generation logs"
  ON public.generation_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));
