ALTER TABLE public.modules ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
