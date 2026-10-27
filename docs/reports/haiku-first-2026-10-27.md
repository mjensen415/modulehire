# Haiku-first quality and token cuts — comparison (2026-10-27)

Old prompts = `dev` at 792c48f; new = `perf/haiku-quality`. All calls on Haiku
(`claude-haiku-4-5-20251001`). Tokens counted on every Anthropic call (input includes cache reads).
Inputs: the 5 most recent JDs with criteria on mjensen415 / jessicahjensen (scored against the
owner's library: 208 and 33 modules), and 3 resumes (mjensen415's and jessicahjensen's latest
uploads, `tessa-lindqvist-perfect-anthropic.docx`), first 4 roles each.

## Tokens

| Call | Old input | New input | Change | Old output | New output |
|---|---|---|---|---|---|
| match_report (5 JDs) | 148,629 | 25,724 | −83% | 6,022 | 5,650 |
| JD criteria (5 JDs) | 12,229 | 14,124 | +15% (worked example) | 4,676 | 4,789 |
| Resume outline (3) | 6,504 | 6,648 | +2% (start anchors) | 981 | 1,280 |
| Per-role parse (11 roles) | 35,399 | 30,671 | −13% | 10,431 | 11,359 |

Per-role input fell less than the resume shrank because the fixed instructions (theme and
role-type lists, now plus a worked example) dominate the prompt; the resume slice itself is ~20%
of the full text. Anchors were found for 11 of 11 roles.

From production logs (last 30 days, before this change): match_report on Haiku averaged 29,351
input tokens (max 86,673); per-role parse capped at 2,048 output and was cut off on long roles.

## Quality

- **Match report scores** (old → new overall): GitLab 79 → 72, Pindrop 89 → 84, Montera 77 → 79,
  ResortPass 88 → 89, Avalara 74 → 67. Same ordering of strong vs weak criteria; the new prompt is
  slightly stricter where evidence is thin (it sees 200-char snippets, not 600).
- **JD criteria**: both produce 6–9 criteria. The new prompt reliably includes exactly one role and
  one seniority criterion (the old one missed the role criterion on GitLab) and orders by weight.
- **Per-role parse**: module counts equal or slightly higher (e.g. 4 → 6, 6 → 10 on Matt's two
  densest roles; 3 → 5 on Jessica's Plex role); no module invented a number in either version.

## Worth putting on SONNET_FEATURES?

Nothing got noticeably worse. If one feature: `match_report`, only if the slightly lower scores on
thin evidence read as too harsh in practice.
