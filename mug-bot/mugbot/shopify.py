import html

from .http import call

API_VERSION = "2025-01"


def post_article(cfg, title, body_html, image_url, tags):
    """Publish a blog post on the Shopify store and return its public URL."""
    base = f"https://{cfg.shopify_store}/admin/api/{API_VERSION}"
    headers = {"X-Shopify-Access-Token": cfg.shopify_token}
    reply = call("POST", f"{base}/blogs/{cfg.shopify_blog_id}/articles.json", headers, {"article": {
        "title": title,
        "body_html": body_html,
        "published": True,
        "tags": ", ".join(tags),
        "image": {"src": image_url, "alt": title},
    }})
    article = reply["article"]
    blog = call("GET", f"{base}/blogs/{cfg.shopify_blog_id}.json", headers)["blog"]
    return f"{cfg.site_url}/blogs/{blog['handle']}/{article['handle']}"


def article_html(title, description, image_url, shop_url):
    return (
        f'<p><img src="{html.escape(image_url)}" alt="{html.escape(title)}"></p>'
        f"<p>{html.escape(description)}</p>"
        f'<p><a href="{html.escape(shop_url)}">Shop the mug</a></p>'
    )
