#!/usr/bin/env python3
"""Create the drop's mugs as Printify products, straight from listings.csv (made by mugs.py).

Usage (run inside the drop folder, next to listings.csv and prints/):
  export PRINTIFY_API_TOKEN=...
  python3 printify_mugs.py --dry-run     # shows blanks, providers, colors and checks every PNG against its print area
  python3 printify_mugs.py               # uploads art + creates every mug as an unpublished draft
  python3 printify_mugs.py --publish     # same, then pushes each product to the connected sales channel
  python3 printify_mugs.py --only BB-DROP7-M01,BB-DROP7-M05

Re-running is safe: finished SKUs are saved in progress.json and skipped.
Standard library only.
"""
import argparse, base64, csv, json, os, struct, sys, time, urllib.error, urllib.request

API = "https://api.printify.com/v1"
HERE = os.getcwd()
PROGRESS = os.path.join(HERE, "progress.json")
PROVIDER_PREF = [99, 410, 48, 1, 39, 94, 29]   # Printify Choice, Printful, Colorway, SPOKE, SwiftPOD, Harrier, Monster Digital


def call(method, path, body=None, retries=4):
    token = os.environ.get("PRINTIFY_API_TOKEN")
    if not token:
        sys.exit("Set PRINTIFY_API_TOKEN first.")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json", "User-Agent": "BuddhaBeans-Mugs/1.0"})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                raw = r.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")
            if e.code in (429, 500, 502, 503) and attempt < retries:
                time.sleep(2 ** (attempt + 1)); continue
            raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {msg[:600]}")


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    return struct.unpack(">II", head[16:24])


def pick_shop(shop_id):
    shops = call("GET", "/shops.json")
    for s in shops:
        print(f"  shop {s['id']}: {s['title']} ({s.get('sales_channel')})")
    if shop_id:
        return int(shop_id)
    etsy = [s for s in shops if s.get("sales_channel") == "etsy"]
    return (etsy or shops)[0]["id"]


def pick_provider(bp):
    provs = {p["id"]: p["title"] for p in call("GET", f"/catalog/blueprints/{bp}/print_providers.json")}
    pid = next((p for p in PROVIDER_PREF if p in provs), next(iter(provs)))
    vs = call("GET", f"/catalog/blueprints/{bp}/print_providers/{pid}/variants.json")["variants"]
    title = call("GET", f"/catalog/blueprints/{bp}.json")["title"]
    print(f"  blueprint {bp} = {title}: provider {pid} {provs[pid]} ({len(vs)} variants)")
    return pid, vs


def plan(r, vs):
    """-> list of (size, file, price_cents, [variants]) and the colors used."""
    want = [c for c in r["colors"].split("|") if c]
    groups, colors = [], set()
    for side in ("a", "b"):
        size, f = r[f"size_{side}"], r[f"file_{side}"]
        if not size:
            continue
        chosen = [v for v in vs if v["options"].get("size") == size and (not want or v["options"].get("color") in want)]
        colors |= {v["options"].get("color") for v in chosen if v["options"].get("color")}
        groups.append((size, f, int(round(float(r[f"price_{side}"]) * 100)), chosen))
    return groups, [c for c in want if c in colors]


def check(r, groups):
    problems = []
    want = [c for c in r["colors"].split("|") if c]
    for size, f, _, chosen in groups:
        if not chosen:
            problems.append(f"no {size} variants"); continue
        w, h = png_size(os.path.join(HERE, f))
        for v in chosen:
            ph = next(p for p in v["placeholders"] if p["position"] == "front")
            if (ph["width"], ph["height"]) != (w, h):
                problems.append(f"{f} is {w}x{h}, {size} {v['options'].get('color', '')} wants {ph['width']}x{ph['height']}"); break
        if want:
            got = {v["options"].get("color") for v in chosen}
            missing = [c for c in want if c not in got]
            if missing:
                problems.append(f"{size} missing colors {missing}")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--publish", action="store_true")
    ap.add_argument("--shop-id")
    ap.add_argument("--only", help="comma-separated SKUs")
    a = ap.parse_args()

    rows = list(csv.DictReader(open(os.path.join(HERE, "listings.csv"))))
    if a.only:
        keep = set(a.only.split(",")); rows = [r for r in rows if r["sku"] in keep]
    shop = pick_shop(a.shop_id)
    blanks = {bp: pick_provider(bp) for bp in sorted({int(r["blueprint"]) for r in rows})}
    done = json.load(open(PROGRESS)) if os.path.exists(PROGRESS) else {}
    failed = []

    for r in rows:
        bp = int(r["blueprint"]); pp, vs = blanks[bp]
        groups, colors = plan(r, vs)
        problems = check(r, groups)
        nvar = sum(len(g[3]) for g in groups)
        if a.dry_run:
            flag = "  !! " + "; ".join(problems) if problems else ""
            print(f"{r['sku']:<14} {r['style']:<14} {'/'.join(g[0] for g in groups):<10} {nvar:>2} variants  {(', '.join(colors) or '-'):<32} {r['name']}{flag}")
            continue
        if r["sku"] in done:
            print(f"{r['sku']} already created, skipping"); continue
        if problems:
            print(f"{r['sku']} FAILED: {'; '.join(problems)}"); failed.append(r["sku"]); continue
        try:
            areas, variants = [], []
            for size, f, price, chosen in groups:
                with open(os.path.join(HERE, f), "rb") as fh:
                    img = call("POST", "/uploads/images.json", {"file_name": os.path.basename(f), "contents": base64.b64encode(fh.read()).decode()})
                variants += [{"id": v["id"], "price": price, "is_enabled": True} for v in chosen]
                areas.append({"variant_ids": [v["id"] for v in chosen], "placeholders": [{
                    "position": "front", "images": [{"id": img["id"], "x": 0.5, "y": 0.5, "scale": 1, "angle": 0}]}]})
            product = call("POST", f"/shops/{shop}/products.json", {
                "title": r["title"], "description": r["description"].replace("\n", "<br>"), "tags": r["tags"].split(","),
                "blueprint_id": bp, "print_provider_id": pp, "variants": variants, "print_areas": areas})
        except RuntimeError as e:
            print(f"{r['sku']} FAILED: {e}"); failed.append(r["sku"]); continue
        done[r["sku"]] = product["id"]; json.dump(done, open(PROGRESS, "w"), indent=1)
        print(f"{r['sku']} created {product['id']} ({len(variants)} variants)", flush=True)
        if a.publish:
            call("POST", f"/shops/{shop}/products/{product['id']}/publish.json", {
                "title": True, "description": True, "images": True, "variants": True, "tags": True, "keyFeatures": True, "shipping_template": True})
            print("   published to the sales channel")
        time.sleep(1)
    if a.dry_run:
        print("Dry run finished. Nothing was created.")
    else:
        print(f"Done. Failed: {', '.join(failed) if failed else 'none'}")


if __name__ == "__main__":
    main()
