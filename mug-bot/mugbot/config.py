import os
from dataclasses import dataclass

# Printify's classic "Mug 11oz": blueprint 68, print provider SPOKE (1), one
# variant. The print area is one 2700x1120 wrap around the mug.
BLUEPRINT_ID = 68
PRINT_PROVIDER_ID = 1
VARIANT_ID = 33719
PRINT_WIDTH = 2700
PRINT_HEIGHT = 1120
DRAFT_TAG = "mugbot"


@dataclass(frozen=True)
class Config:
    printify_token: str = ""
    printify_shop_id: str = ""
    openai_api_key: str = ""
    image_model: str = "gpt-image-1"
    shopify_store: str = ""       # your-store.myshopify.com
    shopify_token: str = ""
    shopify_blog_id: str = ""
    site_url: str = "https://www.buddhabeanscoffee.com"
    pinterest_token: str = ""
    pinterest_board_id: str = ""
    pinterest_api: str = "https://api.pinterest.com/v5"
    telegram_token: str = ""
    telegram_chat_id: str = ""
    price_cents: int = 2000

    @classmethod
    def from_env(cls, env=os.environ):
        # GitHub Actions hands unset variables over as empty strings, so every
        # empty value falls back to the default.
        def get(name, default=""):
            return env.get(name, "").strip() or default

        return cls(
            printify_token=get("PRINTIFY_API_TOKEN"),
            printify_shop_id=get("PRINTIFY_SHOP_ID"),
            openai_api_key=get("OPENAI_API_KEY"),
            image_model=get("MUG_IMAGE_MODEL", cls.image_model),
            shopify_store=get("SHOPIFY_STORE"),
            shopify_token=get("SHOPIFY_ADMIN_TOKEN"),
            shopify_blog_id=get("SHOPIFY_BLOG_ID"),
            site_url=get("SITE_URL", cls.site_url).rstrip("/"),
            pinterest_token=get("PINTEREST_ACCESS_TOKEN"),
            pinterest_board_id=get("PINTEREST_BOARD_ID"),
            pinterest_api=get("PINTEREST_API_URL", cls.pinterest_api).rstrip("/"),
            telegram_token=get("TELEGRAM_BOT_TOKEN"),
            telegram_chat_id=get("TELEGRAM_CHAT_ID"),
            price_cents=_cents(get("MUG_PRICE_USD", "20")),
        )


def _cents(raw):
    try:
        return round(float(raw) * 100)
    except ValueError:
        raise SystemExit(f"MUG_PRICE_USD should be a number, got {raw!r}") from None
