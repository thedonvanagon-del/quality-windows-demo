# Site sources

Document roots for the stacks in `aws/stacks/`. `deploy.sh <stack>` syncs
`sites/<stack>/` unless `SITE_DIR` points somewhere else.

| Directory | Stack | What it is |
|---|---|---|
| `nosy-neighbors/` | `nosy-neighbors` | Nosy Neighbors Coffee Co. — live at nosyneighbors.coffee |
| `sb-builder/` | `sb-builder` | Quality Windows & Doors demo — not published |

**The coffee site is the repo root.** GitHub Pages builds `main` in branch mode
and publishes `index.html` and `404.html`; the `CNAME` file sets the custom
domain to `nosyneighbors.coffee`. `nosy-neighbors/` holds symlinks to those two
root files, so the AWS stack deploys exactly what Pages serves. To change the
site, edit the root `index.html` and merge to `main`.

`_config.yml` keeps the Pages build from publishing `aws/` and `sites/`. That
is also why the Quality Windows demo in `sb-builder/` is no longer served
anywhere: a repo gets one Pages site, and this one now belongs to the coffee
site.

CSS is inline rather than in a separate stylesheet because nothing here is
content-hashed. An external `styles.css` would either be cached stale in
browsers or need a cache lifetime short enough to lose most of the benefit.
Inline CSS rides along with the HTML, which is always revalidated.

## Every site directory needs a 404.html

CloudFront maps both 403 and 404 responses onto `/404.html`. If that file is
missing, the error page itself errors.

---

## Verify before launch

The coffee site's copy was written from publicly listed information. Check these
against reality — they're the details customers act on:

- [ ] **Address** — 133 N Yale Ave, Claremont, CA 91711
- [ ] **Phone** — (909) 901-9141
- [ ] **Hours** — Monday to Friday, 7:00am–6:00pm. If the shop opens
      weekends, update the hero chip, the hours entry and the `7am` stat.
- [ ] **Instagram** — @nosyneighborscoffee
- [ ] **Franchise email** — `hello@nosyneighbors.coffee`, an alias in the Buddha
      Beans Google Workspace. Send it a test from an outside account and
      confirm the reply goes out from `hello@`.
- [ ] **Menu** — item names are listed, prices deliberately aren't.
- [ ] **The 180 square feet story** — repeated from the brand's own telling.

### Worth deciding

There's an existing live site at **nosyneighborscoffee.com** (no "co") on
Squarespace. Two sites for one business splits search traffic and confuses
customers. Pick one as canonical and redirect the other.

### Nice to add later

- A real Open Graph image. `og:image` is unset, so shared links show no preview.
- `LocalBusiness` structured data, so hours and address show up in search.
- An order link. The page has none; orders currently go through a third party.
