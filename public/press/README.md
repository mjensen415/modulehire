# Press kit files

Served at `/press/...` and linked from `src/app/press/page.tsx`.

- `logos/`: SVGs drawn from `src/components/ModuleHireLogo.tsx`, with the wordmark text outlined from Plus Jakarta Sans at weight 500 so no font is needed. PNGs are transparent exports.
- `images/`: copies of the screenshots in `docs/mcp-listing/`.
- `modulehire-demo.mp4`: the 1080×1080 recording of the `/mcp` demo. It has no sound and is labeled illustrative.
- `modulehire-press-kit.txt`: the page's text. Keep it in step with `page.tsx`.

Rebuild the zip after changing any of these. It leaves out the video to stay small:

```bash
cd public/press && rm -f modulehire-press-kit.zip && zip -qr modulehire-press-kit.zip logos images modulehire-press-kit.txt
```
