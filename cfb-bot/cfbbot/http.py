"""JSON over HTTPS. Standard library only, so the bot installs nothing."""

import json
import time
import urllib.error
import urllib.request

# ESPN's edge answered 403 to GitHub's runners when the user agent said
# "cfb-live-bot". A browser's user agent gets the same JSON a browser gets.
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def get_json(url, timeout=20, retries=2):
    """GET a URL and return (parsed body, response headers). Network errors
    and 5xx get retried. A 4xx is a problem on our side, so it raises at once."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as resp:
                return json.load(resp), resp.headers
        except urllib.error.HTTPError as err:
            if err.code < 500 or attempt == retries:
                raise
        except urllib.error.URLError:
            if attempt == retries:
                raise
        time.sleep(2 ** attempt)


def post_json(url, payload, timeout=20):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as resp:
        return json.load(resp)


def error_message(err):
    """Pull the API's own explanation out of an HTTPError body."""
    try:
        body = json.loads(err.read())
        return body.get("message") or body.get("description") or str(body)
    except Exception:
        return str(err.reason)
