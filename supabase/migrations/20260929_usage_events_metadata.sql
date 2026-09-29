ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS metadata jsonb;
