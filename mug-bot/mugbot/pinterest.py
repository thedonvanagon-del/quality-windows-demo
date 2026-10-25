from .http import call


def create_pin(cfg, title, description, link, image_url):
    """Pin a mockup image. Pinterest fetches the image from its URL, so the
    Printify mockup link works as is. Returns the pin's id."""
    reply = call("POST", f"{cfg.pinterest_api}/pins",
                 {"Authorization": f"Bearer {cfg.pinterest_token}"}, {
                     "board_id": cfg.pinterest_board_id,
                     "title": title[:100],          # Pinterest's cap
                     "description": description[:800],
                     "link": link,
                     "media_source": {"source_type": "image_url", "url": image_url},
                 })
    return reply.get("id", "")
