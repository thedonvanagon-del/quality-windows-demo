# Site sources

Document roots for the stacks in `aws/stacks/`. `deploy.sh <stack>` syncs
`sites/<stack>/` unless `SITE_DIR` points somewhere else.

| Directory | Stack | What it is |
|---|---|---|
| `nosy-neighbors/` | `nosy-neighbors` | Not A Nosy Neighbor, by Buddha Beans Coffee Co — live at nosyneighbors.coffee |
| `sb-builder/` | `sb-builder` | Quality Windows & Doors demo — not published |

**The coffee site is the repo root.** GitHub Pages builds `main` in branch mode
and publishes the root pages (`index.html`, `coffee.html`, `secret.html`,
`404.html`), `assets/`, `robots.txt`, `llms.txt` and `sitemap.xml`. The `CNAME`
file sets the custom domain to `nosyneighbors.coffee`. `nosy-neighbors/` holds
symlinks to all of those, so the AWS stack deploys exactly what Pages serves.
To change the site, edit the root files and merge to `main`. A new page or
top-level file needs a symlink in `nosy-neighbors/` as well.

`_config.yml` keeps the Pages build from publishing `aws/` and `sites/`. That
is also why the Quality Windows demo in `sb-builder/` is no longer served
anywhere: a repo gets one Pages site, and this one now belongs to the coffee
site.

Every page links the stylesheet as `assets/site.css?v=1`. GitHub Pages lets
browsers cache files for ten minutes, so when the stylesheet changes, bump the
`?v=` number on every page. Otherwise visitors can get the new HTML with the
old styles.

## Every site directory needs a 404.html

CloudFront maps both 403 and 404 responses onto `/404.html`. If that file is
missing, the error page itself errors. The root `404.html` uses root-relative
paths (`/assets/...`) because it is served at whatever URL was missing.

---

## Open items

- [ ] **Bag silhouettes** — `assets/bag-silhouette.svg` is a stand-in drawn to
      match the Costa Rica bag. The original didn't come over with the rest of
      the site. Drop it in at the same path to replace the stand-in.
- [ ] **Costa Rica link** — goes to the store's full product list,
      `buddhabeanscoffee.com/collections/all`. Point it at the Costa Rica
      product itself if you'd rather land people on the bag.
- [ ] **Claremont page** — `claremont.html` was planned but never built, so its
      line came out of `llms.txt`. Put it back, and add the page to
      `sitemap.xml`, once it exists.
- [ ] **Drop-list signup** — not connected to a list yet. The form on the home
      page opens a pre-filled email to hello@buddhabeanscoffee.com instead.
      Point its `action` at the BayEngage list to collect signups directly.
- [ ] **Secret page** — the passcode-locked menu is encrypted inside
      `secret.html`. Changing the menu or the passcode means re-running the
      encryption script from the chat that built the site
      (`scripts/encrypt-secret.py`, which isn't in this repo).
