import base64

from . import config as c
from .http import call

API = "https://api.printify.com/v1"


class Printify:
    def __init__(self, cfg):
        self.cfg = cfg
        # In GitHub Actions the token comes from a secret. Behind a proxy that
        # injects credentials, no token is needed.
        self.headers = {"Authorization": f"Bearer {cfg.printify_token}"} if cfg.printify_token else {}
        self._shop_id = cfg.printify_shop_id

    def _call(self, method, path, body=None):
        return call(method, API + path, self.headers, body)

    @property
    def shop_id(self):
        if not self._shop_id:
            shops = self._call("GET", "/shops.json")
            if len(shops) != 1:
                names = ", ".join(f"{s['id']} ({s['title']})" for s in shops) or "none"
                raise SystemExit(f"Set PRINTIFY_SHOP_ID. This token has {len(shops)} shops: {names}")
            self._shop_id = str(shops[0]["id"])
        return self._shop_id

    def upload(self, file_name, png_bytes):
        reply = self._call("POST", "/uploads/images.json", {
            "file_name": file_name, "contents": base64.b64encode(png_bytes).decode()})
        return reply["id"]

    def create_draft(self, title, description, image_id, tags=()):
        """Create the mug unpublished. The product is the draft."""
        return self._call("POST", f"/shops/{self.shop_id}/products.json", product_payload(
            self.cfg, title, description, image_id, tags))

    def get(self, product_id):
        return self._call("GET", f"/shops/{self.shop_id}/products/{product_id}.json")

    def list_products(self):
        """Every product in the shop, all pages."""
        found, page = [], 1
        while True:
            reply = self._call("GET", f"/shops/{self.shop_id}/products.json?limit=50&page={page}")
            found += reply.get("data", [])
            if page >= reply.get("last_page", 1):
                return found
            page += 1

    def publish(self, product_id):
        return self._call("POST", f"/shops/{self.shop_id}/products/{product_id}/publish.json", {
            "title": True, "description": True, "images": True, "variants": True,
            "tags": True, "keyvalue": True, "shipping_template": True})


def product_payload(cfg, title, description, image_id, tags=()):
    return {
        "title": title,
        "description": description,
        "blueprint_id": c.BLUEPRINT_ID,
        "print_provider_id": c.PRINT_PROVIDER_ID,
        "tags": [c.DRAFT_TAG, *tags],
        "variants": [{"id": c.VARIANT_ID, "price": cfg.price_cents, "is_enabled": True}],
        "print_areas": [{
            "variant_ids": [c.VARIANT_ID],
            "placeholders": [{"position": "front", "images": [
                {"id": image_id, "x": 0.5, "y": 0.5, "scale": 1, "angle": 0}]}],
        }],
    }


def is_published(product):
    return bool(product.get("visible")) and bool(product.get("external"))


def mockups(product):
    """Mockup image URLs, the default one first."""
    images = sorted(product.get("images", []), key=lambda i: not i.get("is_default"))
    return [i["src"] for i in images]
