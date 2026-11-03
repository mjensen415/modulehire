# ModuleHire MCP: directory submissions

Copy for the Claude Connectors Directory form and the ChatGPT apps listing. Character counts
are checked against the limits given; recheck if you edit. Screenshots and their prompts are in
this folder (see `README.md`).

**Before submitting:** the OAuth 2.1 server must be on in Supabase, the code deployed, and the
`20261028_lock_users_columns.sql` and `20261102_mcp_link_tokens.sql` migrations applied. Create
the reviewer account described under "Test account" (it does not exist yet).

---

## Shared facts

| Field | Value |
| --- | --- |
| Server URL | `https://modulehire.com/api/mcp` |
| Transport | Streamable HTTP, stateless |
| Auth | OAuth 2.1 with PKCE and dynamic client registration (Supabase Auth). Protected resource metadata at `https://modulehire.com/.well-known/oauth-protected-resource/api/mcp`. Consent page: `https://modulehire.com/oauth/consent` |
| Docs | https://modulehire.com/mcp |
| Privacy policy | https://modulehire.com/privacy |
| Terms | https://modulehire.com/terms |
| Support | info@modulehire.com |
| Company | ModuleHire Labs |
| MCP Apps | Yes. `get_resume`, `update_block` and `generate_resume` render a read-only resume preview card (`ui://modulehire/resume-card.html`); text-only clients get the same data as text. |

---

## Claude Connectors Directory

**Name** (10 / 100)

> ModuleHire

**One-liner** (130 / 200)

> Your career library in Claude: save wins as skill modules, tailor resumes to any job, and edit them line by line with fact checks.

**Description** (1,171 / 2,000)

> ModuleHire turns your work history into a library of skill modules: short, fact-checked accounts of what you did and what changed because of it. Every tailored resume is built only from those modules, so nothing is invented.
>
> The connector brings that library into Claude. Tell Claude about a win and it saves it as a module under the right job. Paste a job posting or a link and Claude builds a tailored resume from your best-matching modules, then shows a preview card with its fit score. Ask for edits and Claude rewrites individual lines; any number or name that isn't in the line's source module is flagged so you can confirm it. When you're happy, download a PDF or Word file, or open the resume in ModuleHire's live editor with a one-click link.
>
> Claude can also check how well a resume covers a job's requirements, search your modules, and keep your job tracker current. Pro members get interview prep for any saved job.
>
> Claude writes, ModuleHire stores. Only resume generation and interview prep use ModuleHire's own AI, and both count against the same plan limits as the website. Edits are version-checked, so changes made in the browser are never overwritten.

**Categories**

> Productivity; Career / Jobs (pick the closest available: "Productivity" and "Writing" if there is no careers category)

**Use cases** (one per line, as the form asks)

1. Capture accomplishments as they happen: "I just led our move to a new billing system and cut invoice errors in half. Save that to my ModuleHire library."
2. Tailor a resume to a posting: "Make me a resume for this job: [posting or link]."
3. Check and close gaps: "How well does my latest resume fit its job? What's missing?"
4. Edit line by line: "Rewrite the second bullet under my current job so it leads with the result."
5. Finish and send: "Hide the awards section and give me a PDF."
6. Track the search: "I applied to the Northwind role today. Add it to my tracker."

**Auth details**

> OAuth 2.1 (authorization code with PKCE) via Supabase Auth, with dynamic client registration. Users sign in on modulehire.com (email and password, or Google) and approve Claude on a consent page that lists exactly what it can do. Access tokens are short-lived Supabase JWTs; every tool call verifies the token with Supabase and runs as that user under the database's row-level security. Users can disconnect Claude at any time from Account, Connected accounts, AI apps; this revokes the grant and ends its sessions immediately.

**Tools** (name, what it does, annotations)

| Tool | Does | Hints |
| --- | --- | --- |
| `get_career_library` | Profile, plan and usage, work history, module counts | read-only |
| `search_modules` | Find modules by words, company, or dimension | read-only |
| `list_jobs` | Analyzed job postings with match scores | read-only |
| `get_job` | One posting's weighted requirements and match report | read-only |
| `list_resumes` | Tailored resumes | read-only |
| `get_resume` | The live resume, every line with its id (card) | read-only |
| `check_fit` | Fit score per requirement | read-only |
| `list_applications` | Job tracker | read-only |
| `add_module` | Save a new module under a job | write, not destructive |
| `update_block` | Rewrite one resume line, with fact-check warnings (card) | write, destructive (replaces text; undo in the editor's history) |
| `reorder_blocks` | Reorder bullets within one job | write, not destructive |
| `set_section_visibility` | Show or hide summary, skills, education, awards | write, not destructive |
| `generate_resume` | Build a tailored resume for a job (card) | write, not destructive, open world (can fetch a posting URL) |
| `track_application` | Add an application to the tracker | write, not destructive |
| `update_application_status` | Change an application's status | write, destructive (replaces status) |
| `interview_prep` | Interview prep for a job (Pro) | write (cache), not destructive |
| `export_resume` | PDF or Word download link, valid 10 minutes | write, not destructive |
| `get_editor_link` | One-time link into the live editor, valid 5 minutes | write, not destructive |

**Data handling**

- *What data the connector accesses:* the signed-in user's own skill modules, work history, analyzed job postings and match results, resumes (including the contact details on them), job applications, and plan usage. Nothing about other users; row-level security enforces this on every query.
- *When:* only in response to a tool call. The server sends nothing to Claude otherwise.
- *What we store from MCP use:* per tool call, the tool name, the client id, success or failure, and duration (`usage_events`). One-time editor links are stored as a sha256 hash and expire after 5 minutes. Exported files sit in a private storage bucket in the user's folder; their signed links expire after 10 minutes.
- *Does ModuleHire send data to third parties because of MCP:* only to the AI app the user connected, at the user's request. Resume generation and interview prep run on Anthropic models, as they do on the website.
- *Retention and deletion:* the same as the rest of the account (privacy policy section 6). Deleting the account deletes this data within 30 days.
- *Training:* ModuleHire does not use connector data to train models.
- *Security:* HTTPS only; no long-lived or session tokens in URLs; tokens verified on every call; users can revoke access from their account page.

**Test account**

> Email: `reviewer@modulehire.com` (create before submitting)
> Password: share through the form's private field, not in this file.
> The account is on Pro (so interview prep works), has an uploaded sample resume with about 15 modules across 3 jobs, two analyzed job postings, one generated resume, and one tracked application.
>
> To test: add the connector with the server URL above, sign in with the reviewer account, and choose Allow. Then try: "What's in my ModuleHire library?", "Make me a resume for the Northwind job I saved", "Shorten the first bullet", "Give me a PDF", and "Open it in the editor".

**Screenshots:** `01-tailored-resume-dark.png` to `04-from-a-posting-link.png` in this folder, with prompts in `README.md`.

---

## ChatGPT apps listing

**App name** (10)

> ModuleHire

**Short description** (97)

> Save career wins, tailor resumes to any job, and edit them line by line from your career library.

**Long description**

> Use the Claude description above. Replace "Claude" with "ChatGPT" throughout; nothing else changes.

**Category**

> Productivity (or Business, if Productivity is not offered)

**Starter prompts** (shown under the app)

1. What's in my ModuleHire library?
2. Make me a resume for this job posting.
3. How well does my latest resume fit its job?
4. Add my new application to my job tracker.

**MCP server URL, auth, tools, data handling, test account:** same as the Claude section. ChatGPT reads the tool annotations to decide when to ask the user before a write; `update_block` and `update_application_status` are marked destructive, so ChatGPT will confirm before running them.

**Policies:** privacy https://modulehire.com/privacy, terms https://modulehire.com/terms, support info@modulehire.com.

**Screenshots:** the same four PNGs. ChatGPT renders the card inline from the same `ui://` resource (MCP Apps is supported in ChatGPT).
