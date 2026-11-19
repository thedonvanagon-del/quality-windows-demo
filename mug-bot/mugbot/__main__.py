import argparse
import re
import sys
from pathlib import Path

from . import art, concepts, copy, notify, pinterest, shopify
from .config import DRAFT_TAG, Config
from .printify import Printify, is_published, mockups


def main(argv=None):
    parser = argparse.ArgumentParser(prog="mugbot", description="Make Christmas coffee-pun mugs on Printify, post them on buddhabeanscoffee.com, pin them on Pinterest.")
    sub = parser.add_subparsers(dest="command", required=True)

    make = sub.add_parser("make", help="make one mug as an unpublished Printify draft and ping you")
    make.add_argument("--image", type=Path, help="use this image instead of generating art")
    make.add_argument("--title", help="the words on the mug (required with --image; otherwise forces that pun)")
    make.add_argument("--dry-run", action="store_true", help="generate and print, but create nothing on Printify")
    make.add_argument("--save", type=Path, help="also write the print-ready PNG here")

    sub.add_parser("drafts", help="list mugs waiting for your OK")

    publish = sub.add_parser("publish", help="approve a draft: publish it, post on the site, pin it")
    publish.add_argument("product_id")
    publish.add_argument("--skip-site", action="store_true")
    publish.add_argument("--skip-pinterest", action="store_true")

    args = parser.parse_args(argv)
    cfg = Config.from_env()
    if args.command == "make":
        return make_mug(cfg, args)
    if args.command == "drafts":
        return list_drafts(cfg)
    return publish_mug(cfg, args)


def make_mug(cfg, args):
    printify = Printify(cfg)
    if args.image:
        if not args.title:
            raise SystemExit("--title is required with --image.")
        words, source = args.title, args.image.read_bytes()
    else:
        words, hint = _next_pun(cfg, printify, args.title)
        print(f"Making: {words}")
        source = art.generate(cfg, concepts.prompt_for(words, hint))
    png = art.fit_to_mug(source)
    if args.save:
        args.save.write_bytes(png)
        print(f"Wrote {args.save}")
    if args.dry_run:
        print(f'Dry run: would create the draft "{words}" ({len(png) // 1024} KB print file).')
        return 0

    image_id = printify.upload(_slug(words) + ".png", png)
    product = printify.create_draft(words, copy.description(words), image_id, ["christmas", "coffee pun"])
    shots = mockups(product)
    notify.send(cfg, f'☕ New mug draft: "{words}"\n{shots[0] if shots else "(mockups still rendering)"}\n\n'
                     f"Happy with it? Run: publish {product['id']}")
    print(f"Draft created: {product['id']}")
    return 0


def list_drafts(cfg):
    drafts = [p for p in Printify(cfg).list_products() if DRAFT_TAG in p.get("tags", []) and not is_published(p)]
    for p in drafts:
        print(f"{p['id']}  {p['title']}")
    if not drafts:
        print("No drafts waiting.")
    return 0


def publish_mug(cfg, args):
    printify = Printify(cfg)
    product = printify.get(args.product_id)
    words = product["title"]
    shots = mockups(product)
    if not shots:
        raise SystemExit("Printify hasn't rendered mockups yet. Try again in a minute.")

    # Publishing goes first: the product page is what the post and the pin link to.
    printify.publish(product["id"])
    print(f"Published on Printify: {words}")

    shop_url = f"{cfg.site_url}/collections/all"  # swapped for the product page once Shopify has synced it
    if not args.skip_site:
        _need(cfg.shopify_store, cfg.shopify_token, cfg.shopify_blog_id, what="SHOPIFY_STORE, SHOPIFY_ADMIN_TOKEN, SHOPIFY_BLOG_ID")
        post_url = shopify.post_article(cfg, f'New mug: {words}',
                                        shopify.article_html(words, copy.blog_text(words), shots[0], shop_url),
                                        shots[0], ["mugs", "christmas"])
        shop_url = post_url
        print(f"Posted: {post_url}")
    if not args.skip_pinterest:
        _need(cfg.pinterest_token, cfg.pinterest_board_id, what="PINTEREST_ACCESS_TOKEN, PINTEREST_BOARD_ID")
        title, body = copy.pin_text(words)
        pin_id = pinterest.create_pin(cfg, title, body, shop_url, shots[0])
        print(f"Pinned: {pin_id}")
    return 0


def _next_pun(cfg, printify, forced):
    if forced:
        return forced, "a steaming coffee mug with Christmas holly"
    pick = concepts.pick(p["title"] for p in printify.list_products())
    if not pick:
        raise SystemExit("Every pun already has a mug. Add more to mugbot/concepts.py.")
    return pick


def _need(*values, what):
    if not all(values):
        raise SystemExit(f"Set {what}, or skip this step.")


def _slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "mug"


if __name__ == "__main__":
    sys.exit(main())
