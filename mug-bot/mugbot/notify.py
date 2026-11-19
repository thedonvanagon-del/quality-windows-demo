from .http import call


def send(cfg, text):
    """Ping Telegram when it's set up. The run log always carries the text."""
    print("\n" + text)
    if not (cfg.telegram_token and cfg.telegram_chat_id):
        return
    call("POST", f"https://api.telegram.org/bot{cfg.telegram_token}/sendMessage", None, {
        "chat_id": cfg.telegram_chat_id, "text": text, "disable_web_page_preview": False})
