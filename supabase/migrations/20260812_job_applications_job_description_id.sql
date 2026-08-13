ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS job_description_id uuid references public.job_descriptions(id);
