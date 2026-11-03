# Test set: four resume levels × two JDs (answer key)

All candidates, companies, emails (example.com), and phones (555) are fictional.

JD A = Franklin Templeton, Head of AI Community
JD B = Anthropic, Head of Community, Enterprise Marketing

| File | Level | Written for | Expected score vs own JD | vs other JD |
|---|---|---|---|---|
| noor-haddad-perfect-franklin-templeton | Perfect fit | A | 90–100 | 35–50 |
| rachel-okonkwo-director-franklin-templeton | Director | A | 80–90 | 35–50 |
| gregory-takahashi-clevel-franklin-templeton | C-level (CTO) | A | 70–85, flag as overqualified | 30–45 |
| kevin-marsh-poor-franklin-templeton (+ SCANNED.pdf) | Poorly written | A | 55–70 | 25–40 |
| tessa-lindqvist-perfect-anthropic | Perfect fit | B | 90–100 | 35–50 |
| daniel-reyes-director-anthropic | Director | B | 80–90 | 30–45 |
| catherine-moreau-clevel-anthropic | C-level (CCO) | B | 75–90, flag as overqualified | 30–45 |
| brittany-cole-poor-anthropic | Poorly written | B | 45–60 | 20–35 |

The ranges are judgment calls, not ground truth. What matters is the ordering: perfect > director > C-level > poor for the JD each was written for, and every resume scoring much lower against the other JD.

---

## Perfect fit (Noor, Tessa)

Clean, one result per paragraph, numbers everywhere. Baseline: if these don't score at the top, scoring is broken.

- **Noor:** 4 jobs (Halden Rowe 2022–Present, Corvane 2019–2022, Ardent Cloud 2015–2018, Brightline Labs 2011–2015). The Brightline line covers two roles in one sentence (Software Engineer, then Developer Advocate).
- **Tessa:** 4 jobs (Fieldnote AI 2022–Present, Brightwave Data 2018–2022, Northpeak 2014–2018, Pylon Labs 2011–2014).
- Summary, Core Skills, and Speaking should not become job modules.

## Director (Rachel, Daniel)

**Traps**
- **Promotions:** one company with two titles and dates. A correct parse gives two job entries under one company. Rachel: Calder Mutual, Senior Manager 2019–2022, then Director 2022–Present. Daniel: Quillbase, Senior Manager 2018–2021, then Director 2021–Present.
- **Scope lines** (italic, e.g. "Lead 3 managers and 22 engineers… $4.8M budget"). These are facts about the role, not accomplishments. Ideally they're stored with the job, not created as a module.
- **"Earlier Career":** a single paragraph listing 2 roles with dates and no detail. It should give 2 job entries with no modules, and must not become one "Multiple" module.
- **Grouped Core Skills** ("Platform and InnerSource: …"): skills, not modules.

**Expected jobs**
- **Rachel:** Calder Mutual (×2 titles), Fernway Software, Brookline Analytics, Datacove.
- **Daniel:** Quillbase (×2), Harrow Systems, Stackmint (×2: Developer Evangelist 2011–2014, Support Engineer 2009–2011).

## C-level (Gregory, Catherine)

**Traps**
- **Signature Achievements:** 4 career-defining results that don't sit under any one job. Gregory's are mostly Velora Wealth, except one that combines Velora and earlier roles. A correct parse ties each to the right job where the text names the company. Otherwise it should create a career-level module, not a fake "Multiple" company.
- **Context paragraphs** (italic, after each title): company situation, mandate, reporting line, budget. These describe the job, not an accomplishment, so they shouldn't be modules.
- **Results grouped by theme** under subheads ("AI platform and reuse", "Governance and risk", "Financial"). The subheads are labels, not modules. Each paragraph under them is its own module.
- **Board and Advisory:** roles running at the same time as the day job. They should parse as separate roles marked board or advisory, not merged into the main job.
- **Earlier Career:** 3 roles in one line (Gregory), or 2 roles plus an undated "earlier roles" line (Catherine).
- **Overqualification:** a CTO or CCO applying to a Head of Community role. Ideally the match report notices that seniority exceeds the role, rather than just giving a high score.

**Expected jobs**
- **Gregory:**
  - Velora Wealth (CTO 2020–Present)
  - Harbor and Lane Financial (SVP Engineering 2015–2020)
  - Quantive (2011–2015)
  - Lexmont Systems (×2: Engineering Manager 2006–2011, Software Engineer 2003–2006)
  - Board roles: Alder Health (2022–Present), Open Ledger Foundation advisory (2021–Present)
- **Catherine:**
  - Cobaltline (CCO 2021–Present)
  - Meridian Forge (SVP 2016–2021)
  - Kestrel Data (2012–2016)
  - Brightfield Software (2008–2012)
  - An undated 2005–2008 line
  - Board roles: Lumora Learning (2023–Present), Community Leaders Forum (2020–Present)

## Poorly written (Kevin, Brittany)

The real experience underneath is relevant. Kevin ran an internal AI guild, office hours, a shared AI repository, and contribution guidelines. Brittany ran ambassadors, enterprise champions, certification, and launches. It's just badly presented. The test is whether ModuleHire finds that experience, and whether it invents anything.

**Kevin (JD A): layout traps**
- **Two-column table:** the left sidebar (skills, tools, interests, references) sits next to the main column, so reading order can interleave the two.
- **Name and contact in the page header:** often missed by text extraction. Check that contact parsing still finds them.
- **Skill bars** ("Python ●●○○○"): the dots shouldn't end up in skills or modules.
- **Mixed date formats:** "Jan 2022 - Present", "03/2018 to 12/2021", "2015 to 2018", "Summer 2014".
- **Typos:** "accross", "manged", "conferances".
- **Buzzwords:** spearheaded, leveraged, seamlessly, pivotal, results-driven, passionate, dynamic, fast-paced.
- **SCANNED.pdf:** an image-only copy with no text layer, slightly rotated. Expected: a clear "we couldn't read text from this file" message, not an empty library or a crash.

**Brittany (JD B): content traps**
- **Functional "Key Skills & Achievements" section:** achievements with no employer. These shouldn't be invented onto a company, so expect career-level or unassigned modules, not "Multiple".
- **Contact only in the footer.**
- **Mixed fonts:** Times New Roman, Arial, Calibri.
- **Creative title:** "Community Ninja".
- **Unexplained gap:** Aug 2017 to 2019.
- **Irrelevant old jobs:** retail associate, barista.
- **Mixed dates:** "June 2022 - now", "2019 - 2021", "Mar 2016 - Aug 2017".
- **Typo:** "Recieved".
- **AI-style words:** "delve", "spearheaded", "leveraged".

**Expected behavior for both**
- **No invented numbers.** The resume has none, so generated modules, rewrites, and resumes must not add any. This is the most important check in the set.
- **Generic lines** ("Fixed bugs", "Grew followers", "Various tasks as assigned") are thin or low-weight modules, or are skipped.
- **Objective, Interests/Hobbies, and References:** never modules.
- **Rewrite suggestions** should ask the user for the missing scope and results, not make them up.

**Expected jobs**
- **Kevin:** Tegra Bank (Community Lead, AI Guild, 2022–Present), Stackhouse (2018–2021), Brightwire Inc (2015–2018), unnamed internship (2014).
- **Brittany:** Brightloop (2022–Present), Frolic Apps (2019–2021), Bean & Bloom Coffee Co. (2016–2017), ShopRight (2013–2015), The Daily Grind (2011–2013).

---

## How to run

1. Create a fresh test account (or a new profile) for each candidate so libraries don't mix.
2. Upload the PDF, check the parse against "Expected jobs" and the traps above, then upload the DOCX and compare the two parses.
3. Analyze both JDs and generate a match report for each resume against each JD. Check the ordering in the table.
4. Generate a resume from each poorly written candidate and check it for any numbers that aren't in the source.
