# Site sources

Each directory here is the document root for one stack in `aws/stacks/`. The
names match on purpose — `deploy.sh nosy-neighbors` syncs `sites/nosy-neighbors/`.

| Directory | Stack | What it is |
|---|---|---|
| `nosy-neighbors/` | `nosy-neighbors` | Nosy Neighbors Coffee Co. — single page, no build step |
| `sb-builder/` | `sb-builder` | Santa Barbara small business site (Quality Windows & Doors) |

Both are hand-written HTML with the CSS inline. There is no bundler, no
framework, and nothing to compile — edit the file, run `deploy.sh`, done.

CSS is inline rather than in a separate stylesheet because nothing here is
content-hashed. An external `styles.css` would either be cached stale in
browsers or need a cache lifetime short enough to lose most of the benefit.
Inline CSS rides along with the HTML, which is always revalidated.

## Every site directory needs a 404.html

CloudFront maps both 403 and 404 responses onto `/404.html`. If that file is
missing, the error page itself errors.

---

## Verify before launch

The copy on the Nosy Neighbors page is written from publicly listed information.
**Check these against reality before the site goes live** — they are the kind of
detail customers act on:

- [ ] **Address** — 133 N Yale Ave, Claremont, CA 91711
- [ ] **Phone** — (909) 901-9141
- [ ] **Hours** — Monday to Friday, 7:00am–6:00pm. No weekend hours are listed;
      if the shop opens weekends, the hero chip, the hours entry and the `180`
      stat block all need updating.
- [ ] **Instagram** — @nosyneighborscoffee
- [ ] **Franchise email** — `hello@nosyneighborscoffeeco.com` is a placeholder.
      It must exist, or point it at the real address.
- [ ] **Menu items** — names are listed, prices deliberately are not. The page
      says prices are on the board in the shop, so no number can go stale.
- [ ] **The 180 square feet story** — repeated from the brand's own telling.

### Also worth deciding

There is an existing live site at **nosyneighborscoffee.com** (no "co") running
on Squarespace. Two sites for one business splits search traffic and confuses
customers. Pick one as canonical and redirect the other.

### Nice to add later

- A real Open Graph image. `og:image` is unset, so shared links show no preview.
- `LocalBusiness` structured data, so hours and address show up in search.
- Ordering. The page has no order link; the brand currently takes orders through
  a third party.
