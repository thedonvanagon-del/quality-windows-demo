# Site sources

Document roots for the stacks in `aws/stacks/`. `deploy.sh <stack>` syncs
`sites/<stack>/` unless `SITE_DIR` points somewhere else.

| Directory | Stack | What it is |
|---|---|---|
| `sb-builder/` | `sb-builder` | Quality Windows & Doors demo |

`sb-builder/index.html` is a symlink to the repo-root `index.html`, which
GitHub Pages serves at `thedonvanagon-del.github.io/quality-windows-demo/`.
One file feeds both, so the demo and its AWS copy can't drift apart.
`_config.yml` keeps the Pages build from publishing `aws/` and `sites/`.

**The Nosy Neighbors site lives in its own repo,
[`thedonvanagon-del/nosyneighbors-coffee`](https://github.com/thedonvanagon-del/nosyneighbors-coffee),**
which publishes it to `nosyneighbors.coffee` through GitHub Pages. A repo gets
one Pages site, and this one's belongs to the demo. Its launch checklist is in
that repo's README. To serve it from AWS instead, point the deploy at it:

```bash
SITE_DIR=../nosyneighbors-coffee/site ./aws/scripts/deploy.sh nosy-neighbors
```

CSS is inline rather than in a separate stylesheet because nothing here is
content-hashed. An external `styles.css` would either be cached stale in
browsers or need a cache lifetime short enough to lose most of the benefit.
Inline CSS rides along with the HTML, which is always revalidated.

## Every site directory needs a 404.html

CloudFront maps both 403 and 404 responses onto `/404.html`. If that file is
missing, the error page itself errors.
