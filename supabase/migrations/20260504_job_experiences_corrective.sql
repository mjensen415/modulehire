-- Corrective migration: rewrite job_experiences for users whose rows were
-- corrupted by the parser-merge bug (multiple companies merged into one row).
-- Applied 2026-05-04 against project ymrbpdhmtqimsvkowbco.
--
-- module_job_assignments rows pointing to deleted job_experiences were removed
-- automatically by the module_job_assignments.job_id ON DELETE CASCADE FK;
-- module rows themselves are untouched and will be manually re-assigned.

begin;

-- USER 455c278b-b0f2-42fd-a905-1b5dda895645 (Jessie Jensen) — wipe and reseed
delete from public.job_experiences
where user_id = '455c278b-b0f2-42fd-a905-1b5dda895645';

insert into public.job_experiences (user_id, company, title, start_date, end_date) values
  ('455c278b-b0f2-42fd-a905-1b5dda895645', 'Skipify',           'SVP People',           '2023-06-01', null),
  ('455c278b-b0f2-42fd-a905-1b5dda895645', 'Projector Factory', 'Director Operations',  '2018-06-01', '2023-06-01'),
  ('455c278b-b0f2-42fd-a905-1b5dda895645', 'Plex',              'Director People',      '2016-02-01', '2023-06-01'),
  ('455c278b-b0f2-42fd-a905-1b5dda895645', '360Learning',       'Director HR Americas', '2010-06-01', '2023-06-01'),
  ('455c278b-b0f2-42fd-a905-1b5dda895645', 'Twitter',           'HR Business Partner',  '2010-06-01', '2023-06-01');

-- USER 17349d9b-e98b-469f-9d04-1a197733e670 — drop bad/test rows; keep Berkeley/Student
delete from public.job_experiences
where id in (
  '58c69523-df31-4400-807c-d8279b1997cc',  -- JSON garbage ["TechCorp","StartupInc"]
  'bcea0734-1b71-4742-bbcd-a2ea3f4cc691',  -- empty Berkeley
  '9dd96f95-c9bb-4b69-89bb-148e8eb0a1d7',  -- TechCorp test data
  'b82ea389-97f7-453e-8d94-f12aee60f58b'   -- StartupInc test data
);

-- USER a8197389-7ab9-45a7-965a-01b89148d3e4 — wipe and reseed
delete from public.job_experiences
where user_id = 'a8197389-7ab9-45a7-965a-01b89148d3e4';

insert into public.job_experiences (user_id, company, title, start_date, end_date) values
  ('a8197389-7ab9-45a7-965a-01b89148d3e4', 'Microsoft / Yammer', 'Manager of Strategic Customer Programs',                  '2012-08-01', '2014-02-01'),
  ('a8197389-7ab9-45a7-965a-01b89148d3e4', 'Upwork',             'Global Growth Marketing',                                  '2012-08-01', '2023-01-01'),
  ('a8197389-7ab9-45a7-965a-01b89148d3e4', 'Fiverr',             'Senior Director Global Community',                         '2018-01-01', '2023-01-01'),
  ('a8197389-7ab9-45a7-965a-01b89148d3e4', '33 Crickets',        'Founder & Principal Consultant',                           '2016-05-01', null),
  ('a8197389-7ab9-45a7-965a-01b89148d3e4', 'Neue Alchemy',       'General Manager / Head of Community & Developer Ecosystem','2016-05-01', null);

-- USER a4fdb436-6ffd-4a6d-8e32-ab6828a0797a — no changes required.

commit;
