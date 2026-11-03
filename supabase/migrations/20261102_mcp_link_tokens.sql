-- One-click editor links for the MCP server's get_editor_link tool. The tool stores only the
-- sha256 of a random token; the user opens /go/<token>, which looks the hash up with the admin
-- client (the browser may have no session yet), marks the row used, and signs the user in.
-- Tokens expire 5 minutes after creation and work once.
create table if not exists public.mcp_link_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  resume_id uuid not null references public.generated_resumes(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_mcp_link_tokens_hash on public.mcp_link_tokens(token_hash);
create index if not exists idx_mcp_link_tokens_user on public.mcp_link_tokens(user_id, created_at desc);

alter table public.mcp_link_tokens enable row level security;

-- Users can create and read their own links. No update or delete policy: only the service role
-- (/go/[token]) marks a link used, so a user can't make a spent link work again.
drop policy if exists mcp_link_tokens_own_select on public.mcp_link_tokens;
create policy mcp_link_tokens_own_select on public.mcp_link_tokens for select
  using (auth.uid() = user_id);
drop policy if exists mcp_link_tokens_own_insert on public.mcp_link_tokens;
create policy mcp_link_tokens_own_insert on public.mcp_link_tokens for insert
  with check (auth.uid() = user_id);
