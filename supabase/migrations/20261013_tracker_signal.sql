-- Tracker signal: where the user applied, how old the posting was, and when/how they first
-- heard back. All optional. Feeds the day-5/day-10 nudges and the "What's working for you"
-- card on /job-tracker (computed on read, no cron).
alter table public.job_applications
  add column if not exists source text check (source in
    ('company_site','linkedin_easy_apply','linkedin_external','job_board','referral','recruiter','other')),
  add column if not exists posting_age text check (posting_age in
    ('today','1_3_days','4_7_days','1_2_weeks','2_plus_weeks')),
  add column if not exists first_response_at date,
  add column if not exists response_type text check (response_type in
    ('auto_reject','human_reject','recruiter_screen','interview','offer'));

-- "Mark as no response" archives an application without calling it a rejection.
alter table public.job_applications drop constraint if exists job_applications_status_check;
alter table public.job_applications add constraint job_applications_status_check check (
  status in ('saved','applied','screening','interviewing','offered','rejected','withdrawn','no_response')
);
