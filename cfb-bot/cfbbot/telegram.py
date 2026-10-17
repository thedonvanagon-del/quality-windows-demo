from urllib.error import HTTPError

from .http import error_message, post_json

SEND_URL = "https://api.telegram.org/bot{token}/sendMessage"
LIMIT = 4000  # Telegram caps a message at 4096 characters


class TelegramError(RuntimeError):
    pass


def send(token, chat_id, text):
    for chunk in split(text):
        try:
            reply = post_json(SEND_URL.format(token=token), {
                "chat_id": chat_id,
                "text": chunk,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            })
        except HTTPError as err:
            raise TelegramError(f"Telegram returned {err.code}: {error_message(err)}") from None
        if not reply.get("ok"):
            raise TelegramError(reply.get("description") or "Telegram said no")


def split(text, limit=LIMIT):
    """Break on blank lines so a pick never gets cut in half."""
    chunks, current = [], ""
    for block in text.split("\n\n"):
        candidate = f"{current}\n\n{block}" if current else block
        if len(candidate) <= limit:
            current = candidate
            continue
        if current:
            chunks.append(current)
        while len(block) > limit:
            chunks.append(block[:limit])
            block = block[limit:]
        current = block
    if current:
        chunks.append(current)
    return chunks
