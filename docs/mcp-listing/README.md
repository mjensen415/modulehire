# ModuleHire MCP listing assets

Screenshots of the resume preview card (the MCP App returned by `get_resume`, `update_block`
and `generate_resume`), each paired with the prompt that produces it. All four are 1280px
wide PNGs cropped to the card only. The people, employers and numbers are made up.

| File | Prompt | Tool |
| --- | --- | --- |
| `01-tailored-resume-dark.png` | "Tailor my resume for the Staff Infrastructure Engineer role at Lumen Pay that I saved." | `generate_resume` |
| `02-tailored-resume-light.png` | "Show me my Lumen Pay resume." | `get_resume` |
| `03-edit-and-recheck-fit.png` | "Rewrite the first bullet under Woodgrove so it leads with the result." | `update_block` |
| `04-from-a-posting-link.png` | "Make me a resume for this charge nurse posting: [link]" | `generate_resume` |

"Fit" is the stored ModuleHire score for that version of the resume; "Fit (est.)" is the
fast estimate shown right after an edit, before the full score refreshes.

## How these were made

The card HTML is the real resource served at `ui://modulehire/resume-card.html`
(`src/lib/mcp/card-html.ts`). It was loaded in a sandboxed iframe by the reference host bridge
from `@modelcontextprotocol/ext-apps/app-bridge`, given fixture tool results, and captured with
headless Chrome at 2x. To retake them, render the card the same way at a 640px container width
and crop to the iframe.
