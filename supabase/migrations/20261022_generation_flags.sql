-- Fact-check results for each generated resume: bullets the server-side check rewrote because
-- they claimed a number or name the source module doesn't contain ({ module_id, bullet, reason,
-- replacement }), and the posting phrases left off because no module supports them.
ALTER TABLE public.generated_resumes ADD COLUMN IF NOT EXISTS generation_flags jsonb;
ALTER TABLE public.generated_resumes ADD COLUMN IF NOT EXISTS unsupported_phrases text[];
