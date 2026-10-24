# GitHub setup

After pushing this repository to GitHub:

1. **Settings → General → Website URL**: set to `https://linesdedupe.com`
   (this shows up as the repo's homepage link).
2. **Settings → General → Topics** (optional), suggested:
   `dedupe`, `lines`, `compare-lists`, `privacy`, `static-site`
3. Make sure the description mentions the live tools, e.g.
   "Free online tools to remove duplicate lines and compare two lists — 100% client-side, nothing uploaded."

Notes:

- The live site is hosted on **Cloudflare Pages**; this repo is a source mirror, not the host.
- `site/` contains only deployable static files (no progress notes).
- `site/analytics.config.js` ships with the live GA4 and Clarity IDs.
