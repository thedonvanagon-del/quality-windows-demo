from urllib.error import HTTPError

from .http import error_message, post_json

API_URL = "https://api.telegram.org/bot{token}/{method}"
LIMIT = 4000  # Telegram caps a message at 4096 characters


class TelegramError(RuntimeError):
    pass


def send(token, chat_id, text):
    for chunk in split(text):
        _call(token, "sendMessage", {
            "chat_id": chat_id,
            "text": chunk,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        })


def whoami(token, chat_id):
    """Which bot the token belongs to and what kind of chat the ID points at.
    Telegram accepting a message only proves it went somewhere; this says where,
    without putting anyone's name in the public run log."""
    bot = "@" + (_call(token, "getMe", {}).get("username") or "unknown")
    chat = _call(token, "getChat", {"chat_id": chat_id})
    where = f"a {chat.get('type', 'unknown')} chat"
    if chat.get("title"):
        where += f" called {chat['title']!r}"
    return bot, where


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


def _call(token, method, payload):
    try:
        reply = post_json(API_URL.format(token=token, method=method), payload)
    except HTTPError as err:
        raise TelegramError(f"Telegram returned {err.code}: {error_message(err)}") from None
    if not reply.get("ok"):
        raise TelegramError(reply.get("description") or "Telegram said no")
    return reply.get("result") or {}
