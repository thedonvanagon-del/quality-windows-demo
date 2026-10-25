# mug-bot

Coffee Christmas pun mugs for [buddhabeanscoffee.com](https://www.buddhabeanscoffee.com).
Twice a week it makes one mug as an **unpublished** Printify draft and sends
you the mockup. When you say yes, it publishes the mug, writes a blog post on
your Shopify store and pins the mockup on Pinterest. It runs on GitHub
Actions, so nothing has to stay on at your place.

```
make     art (OpenAI) -> fit to the mug -> Printify draft -> Telegram: "happy with it?"
publish  Printify publish -> Shopify blog post -> Pinterest pin
```

The mug is Printify's Mug 11oz (blueprint 68, SPOKE), one wraparound print,
$20 by default. `mugbot/concepts.py` holds 24 puns ("Joy to the Brew",
"Brew-dolph the Red-Nosed Reindeer", ...). Each run takes the first pun that
isn't on Printify yet. `designs/joy-to-the-brew.png` is the first mug, made
from your own art.

## Try it locally

```
pip install pillow
cd mug-bot
python -m unittest discover -s tests
python -m mugbot make --image designs/joy-to-the-brew.png --title "Joy to the Brew" --dry-run --save /tmp/print.png
```

`--dry-run` builds the print file and stops. Drop it to create the draft.
Other commands: `python -m mugbot drafts`, `python -m mugbot publish <product id>`.

## Setup

Add these under Settings, Secrets and variables, Actions. Secrets are
tokens. Variables are plain IDs.

| Name | Kind | What it is |
|---|---|---|
| `PRINTIFY_API_TOKEN` | secret | Printify, My Account, Connections, API token |
| `PRINTIFY_SHOP_ID` | variable | Only needed if the token has more than one shop |
| `OPENAI_API_KEY` | secret | For the art (`gpt-image-1`). About a few cents a mug |
| `SHOPIFY_STORE` | variable | `your-store.myshopify.com` |
| `SHOPIFY_ADMIN_TOKEN` | secret | Custom app with `write_content`, plus `read_content` |
| `SHOPIFY_BLOG_ID` | variable | The blog the posts go in (Admin API, `blogs.json`) |
| `PINTEREST_ACCESS_TOKEN` | secret | Pinterest app token with `pins:write` |
| `PINTEREST_BOARD_ID` | variable | The board the pins go on |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | secret | Optional. Same bot setup as cfb-bot. Without them, the draft shows in the run log |
| `MUG_PRICE_USD` | variable | Optional, default 20 |

### Things that will trip you

- **Connect Printify to Shopify first.** The Printify shop on this account,
  "My new store", isn't linked to a sales channel. Publishing only sends a mug
  to your site once a Shopify-connected Printify shop exists. Set
  `PRINTIFY_SHOP_ID` to that one.
- **Pinterest starts in trial access.** Until Pinterest approves the app for
  standard access, the API only works in its sandbox. Set
  `PINTEREST_API_URL=https://api-sandbox.pinterest.com/v5` while testing.
- **The pin links to the blog post** for now. Once the mug syncs into
  Shopify, point it at the product page instead (`publish_mug` in
  `mugbot/__main__.py`).

## Approving a mug

Actions, mug-bot, Run workflow. Pick `publish` and paste the product ID from
the Telegram message. `drafts` lists everything waiting. To delete a draft you
don't like, remove it in Printify.
