-- 1. Soft delete columns
ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.modules ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.job_descriptions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.generated_resumes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Remove bytea blob columns (replaced by temp bucket)
ALTER TABLE public.generated_resumes DROP COLUMN IF EXISTS docx_blob;
ALTER TABLE public.generated_resumes DROP COLUMN IF EXISTS pdf_blob;

-- 3. Add temp file tracking
ALTER TABLE public.generated_resumes ADD COLUMN IF NOT EXISTS is_temp BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.generated_resumes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 4. Indexes for soft delete and temp purge queries
CREATE INDEX IF NOT EXISTS idx_modules_deleted_at ON public.modules (deleted_at);
CREATE INDEX IF NOT EXISTS idx_resumes_deleted_at ON public.resumes (deleted_at);
CREATE INDEX IF NOT EXISTS idx_generated_resumes_expires_at
  ON public.generated_resumes (expires_at)
  WHERE is_temp = TRUE;

-- 5. updated_at auto-trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE PLPGSQL AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER modules_updated_at
  BEFORE UPDATE ON public.modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. plan check constraint
ALTER TABLE public.users
  ADD CONSTRAINT IF NOT EXISTS users_plan_check CHECK (plan IN ('free', 'pro'));

-- 7. Purge function (called by Vercel Cron at 3am daily)
CREATE OR REPLACE FUNCTION public.purge_expired_temp_files()
RETURNS TABLE(docx_path TEXT, pdf_path TEXT) LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
    UPDATE public.generated_resumes
    SET deleted_at = NOW()
    WHERE is_temp = TRUE
      AND expires_at < NOW()
      AND deleted_at IS NULL
    RETURNING docx_url, pdf_url;
END;
$$;

-- 8. temp bucket storage policy (run after creating the bucket in Supabase dashboard)
CREATE POLICY "temp_user_folder" ON storage.objects
  FOR ALL USING (
    bucket_id = 'temp' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
