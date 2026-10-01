ALTER TABLE public.job_descriptions
  ADD COLUMN IF NOT EXISTS raw_text_hash text;

CREATE INDEX IF NOT EXISTS job_descriptions_user_hash_idx
  ON public.job_descriptions (user_id, raw_text_hash);
