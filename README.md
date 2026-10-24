# LinesDeduplicate / linesdedupe.com

Free, private, browser-only tools for cleaning up lists of lines.

- **Remove duplicate lines** — https://linesdedupe.com
- **Compare two lists** — https://linesdedupe.com/compare-two-lists

No signup, no server round-trip, no build step. Paste text, click a button, copy the result.

## Features

### Remove duplicate lines

- Deduplicate a pasted list of lines (or upload / drop a `.txt` / `.csv` style file)
- **Keep first** or **keep last** occurrence of each duplicated line
- **Ignore case** (`Apple` == `apple`)
- **Trim spaces** around each line
- **Sort** the output (A→Z, Z→A) or keep original order
- Optionally **drop blank lines**
- Email-aware mode for pasted address lists
- Everything runs locally in the browser; nothing is uploaded

### Compare two lists

Paste list A and list B, then choose a compare mode:

| Mode | Output |
|------|--------|
| **Only A** | lines that appear in A but not in B |
| **Only B** | lines that appear in B but not in A |
| **Both** | lines present in both lists (intersection) |
| **Unique** | lines that appear in exactly one of the two lists (symmetric difference) |

## Pages

| File | URL |
|------|-----|
| `site/index.html` | https://linesdedupe.com/ |
| `site/remove-duplicate-lines-online.html` | https://linesdedupe.com/remove-duplicate-lines-online |
| `site/unique-lines-only.html` | https://linesdedupe.com/unique-lines-only |
| `site/dedupe-list-online.html` | https://linesdedupe.com/dedupe-list-online |
| `site/remove-duplicate-emails-list.html` | https://linesdedupe.com/remove-duplicate-emails-list |
| `site/compare-two-lists.html` | https://linesdedupe.com/compare-two-lists |
| `site/privacy.html` | https://linesdedupe.com/privacy |

All tool pages share one script, `site/app.js`, and one stylesheet, `site/styles.css`. The compare
page is selected with `<body data-tool="compare">`; the dedupe pages differ only in copy and
`<body data-*>` defaults.

## How to use

1. Open https://linesdedupe.com (or `site/index.html` locally).
2. Paste your list into the input box — or drag a text file onto it, or press **Load example**.
3. Adjust the options (keep first/last, ignore case, trim spaces, sort, drop blank lines).
4. Read the clean result in the output box, then **Copy** or **Download** it.

For comparing two lists, open https://linesdedupe.com/compare-two-lists, paste both lists, pick a
mode, and copy the result.

## Privacy

**100% client-side. Nothing is uploaded.** The tools never send your pasted text anywhere.
The only things stored are your last input, your option settings and up to three "Recent"
snapshots, kept in your browser's `localStorage` and removable with the **Forget** button.
See https://linesdedupe.com/privacy.

Optional analytics (`site/analytics.js`) load only when `site/analytics.config.js` has a GA4 or
Clarity ID. This checkout includes the live measurement IDs.

## Repository layout

```
README.md              this file
LICENSE                MIT
GITHUB-SETUP.md        GitHub repo settings checklist
site/                  mirror of the deployable site (static files only)
  index.html
  compare-two-lists.html
  remove-duplicate-lines-online.html
  unique-lines-only.html
  dedupe-list-online.html
  remove-duplicate-emails-list.html
  privacy.html
  app.js
  styles.css
  analytics.js
  analytics.config.js
  robots.txt
  sitemap.xml
  _redirects
```

## Deployment

The **live site is hosted on Cloudflare Pages** (Direct Upload of the static files). The `site/`
directory in this repo mirrors that source: it contains exactly the files that are deployed, at the
site root. To deploy from a checkout, upload the contents of `site/` (not the folder itself) or
point a Cloudflare Pages project at `site/` as its output directory.

Canonicals and the sitemap use extensionless `https://` paths. `site/_redirects` sends each
`*.html` URL to that path with a 301. Cloudflare Pages must redeploy from this build (Direct
Upload or a connected Pages project) before the live site picks it up.

Because it is a plain static site, it also works on GitHub Pages, Netlify, or any static host — the
paths in the HTML are root-relative (`/styles.css`, `/app.js`), so it must be served from a domain
root, not a sub-path.

## License

MIT — see [LICENSE](LICENSE).
