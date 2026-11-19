#!/usr/bin/env python3
"""Create a drop's shirts as Printify products, straight from its listings.csv.

Usage (run inside a drop folder, next to listings.csv and prints/):
  export PRINTIFY_API_TOKEN=...            # Printify > My account > Connections > API tokens
  python3 printify_upload.py --dry-run     # shows shop, blanks, providers and colors; creates nothing
  python3 printify_upload.py               # uploads art + creates every product as a draft
  python3 printify_upload.py --publish     # same, then pushes each product to the connected Etsy shop
  python3 printify_upload.py --only BB-DROP4-X01,BB-DROP4-W26

Re-running is safe: finished SKUs are saved in progress-<shop id>.json and skipped.
Standard library only.
"""
import argparse, base64, csv, json, os, re, sys, time, urllib.error, urllib.request

API = "https://api.printify.com/v1"
HERE = os.getcwd()

# listings.csv "blueprint" column -> words to find it in Printify's catalog (first match wins)
BLUEPRINTS = {
    "womens_relaxed": [("6400",), ("women", "relaxed", "bella")],
    "unisex_heavy":   [("1717",), ("comfort colors", "garment")],
    "youth":          [("3001y",), ("youth", "bella", "jersey")],
}
SIZES = {
    "womens_relaxed": ["S", "M", "L", "XL", "2XL"],
    "unisex_heavy":   ["S", "M", "L", "XL", "2XL", "3XL"],
    "youth":          ["XS", "S", "M", "L", "XL"],
}
UPCHARGE = {"2XL": 300, "3XL": 500}  # cents on top of the listing price

# listings.csv shirt_color / alt_color -> Printify color names to try, in order
COLORS = {
    "Natural": ["Natural", "Heather Natural", "Soft Cream", "Cream"],
    "Blossom Pink": ["Blossom", "Pink", "Soft Pink", "Light Pink", "Heather Peach"],
    "Ivory": ["Ivory", "Soft Cream", "Cream", "Natural"],
    "White": ["White"],
    "Sage Mist": ["Sage", "Heather Sage", "Bay", "Heather Prism Mint"],
    "Sandstone": ["Sandstone", "Ivory", "Natural", "Tan"],
    "Moss": ["Moss", "Hemp", "Military Green", "Heather Forest", "Forest"],
    "True Navy": ["True Navy", "Navy", "Heather Navy"],
    "Pepper": ["Pepper", "Graphite", "Charcoal", "Dark Grey Heather", "Asphalt"],
    "Black": ["Black"],
    "Espresso": ["Espresso", "Brown", "Chocolate"],
    "Red": ["Red", "Crimson", "Chili", "Canvas Red", "Cardinal"],
}


def call(method, path, body=None, retries=4):
    token = os.environ.get("PRINTIFY_API_TOKEN")
    if not token:
        sys.exit("Set PRINTIFY_API_TOKEN first.")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json",
        "User-Agent": "BuddhaBeans-Uploader/1.1"})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                raw = r.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")
            if e.code in (429, 500, 502, 503) and attempt < retries:
                time.sleep(2 ** (attempt + 1)); continue
            sys.exit(f"{method} {path} -> HTTP {e.code}: {msg[:600]}")


def pick_shop(shop_id):
    shops = call("GET", "/shops.json")
    if not shops:
        sys.exit("No Printify shops yet. In Printify: Manage my stores > Add new store > Etsy.")
    for s in shops:
        print(f"  shop {s['id']}: {s['title']} ({s.get('sales_channel')})")
    if shop_id:
        return int(shop_id)
    etsy = [s for s in shops if s.get("sales_channel") == "etsy"]
    return (etsy or shops)[0]["id"]


_catalog = None
def find_blueprint(key):
    global _catalog
    _catalog = _catalog or call("GET", "/catalog/blueprints.json")
    for words in BLUEPRINTS[key]:
        for b in _catalog:
            hay = f"{b['title']} {b.get('brand', '')} {b.get('model', '')}".lower()
            if all(re.search(r'(?<![a-z0-9])' + re.escape(w) + r'(?![a-z0-9])', hay) for w in words):
                print(f"  {key}: blueprint {b['id']} = {b.get('brand')} {b.get('model')} - {b['title']}")
                return b["id"]
    sys.exit(f"No blueprint found for {key}. Edit BLUEPRINTS at the top of this file.")


def best_provider(bp):
    """Provider with the most variants (usually the widest color range)."""
    best = None
    for p in call("GET", f"/catalog/blueprints/{bp}/print_providers.json")[:8]:
        vs = call("GET", f"/catalog/blueprints/{bp}/print_providers/{p['id']}/variants.json").get("variants", [])
        if best is None or len(vs) > len(best[2]):
            best = (p["id"], p["title"], vs)
    print(f"     provider {best[0]} = {best[1]} ({len(best[2])} variants)")
    return best[0], best[2]


def pick_variants(vs, sizes, wanted):
    by_color = {}
    for v in vs:
        o = v.get("options", {})
        if o.get("size") in sizes:
            by_color.setdefault(o.get("color"), []).append(v)
    chosen = []
    for want in wanted:
        for name in COLORS.get(want, [want]):
            if name in by_color and name not in chosen:
                chosen.append(name); break
    return chosen, [v for c in chosen for v in by_color[c]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--publish", action="store_true")
    ap.add_argument("--shop-id")
    ap.add_argument("--only", help="comma-separated SKUs")
    a = ap.parse_args()

    rows = list(csv.DictReader(open(os.path.join(HERE, "listings.csv"))))
    for r in rows:  # drop3-style listings.csv has no blueprint / alt_color columns
        r.setdefault("blueprint", "womens_relaxed"); r.setdefault("alt_color", "White")
        r.setdefault("name", r["title"].split(" Shirt,")[0])
    if a.only:
        keep = set(a.only.split(",")); rows = [r for r in rows if r["sku"] in keep]
    shop = pick_shop(a.shop_id)
    blanks = {}
    for key in sorted({r["blueprint"] for r in rows}):
        bp = find_blueprint(key); pp, vs = best_provider(bp)
        blanks[key] = (bp, pp, vs)
    PROGRESS = os.path.join(HERE, f"progress-{shop}.json")  # per shop, so a new shop never skips SKUs made elsewhere
    done = json.load(open(PROGRESS)) if os.path.exists(PROGRESS) else {}

    for r in rows:
        bp, pp, vs = blanks[r["blueprint"]]
        colors, chosen = pick_variants(vs, SIZES[r["blueprint"]], [r["shirt_color"], r["alt_color"]])
        if a.dry_run:
            print(f"{r['sku']:<16} {r['blueprint']:<15} {r['shirt_color']:<12} -> {colors} ({len(chosen)} variants)  {r['name']}")
            continue
        if r["sku"] in done:
            print(f"{r['sku']} already created, skipping"); continue
        if not chosen:
            print(f"{r['sku']} no matching colors, skipping"); continue
        with open(os.path.join(HERE, r["file"]), "rb") as f:
            img = call("POST", "/uploads/images.json", {"file_name": os.path.basename(r["file"]),
                                                        "contents": base64.b64encode(f.read()).decode()})
        base = int(round(float(r["price"]) * 100))
        product = call("POST", f"/shops/{shop}/products.json", {
            "title": r["title"],
            "description": r["description"].replace("\n", "<br>"),
            "tags": r["tags"].split(","),
            "blueprint_id": bp, "print_provider_id": pp,
            "variants": [{"id": v["id"], "price": base + UPCHARGE.get(v["options"]["size"], 0), "is_enabled": True} for v in chosen],
            "print_areas": [{"variant_ids": [v["id"] for v in chosen], "placeholders": [{
                "position": "front", "images": [{"id": img["id"], "x": 0.5, "y": 0.5, "scale": 1, "angle": 0}]}]}],
        })
        done[r["sku"]] = product["id"]; json.dump(done, open(PROGRESS, "w"), indent=1)
        print(f"{r['sku']} created {product['id']} colors={colors}")
        if a.publish:
            call("POST", f"/shops/{shop}/products/{product['id']}/publish.json", {
                "title": True, "description": True, "images": True, "variants": True, "tags": True,
                "keyFeatures": True, "shipping_template": True})
            print("   published to the sales channel")
        time.sleep(1)
    print("Dry run finished. Nothing was created." if a.dry_run else "Done.")


if __name__ == "__main__":
    main()
