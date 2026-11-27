"""JSON over HTTPS. Standard library only."""

import json
import time
import urllib.error
import urllib.request

USER_AGENT = "buddha-beans-mug-bot/1.0"


class ApiError(RuntimeError):
    pass


def call(method, url, headers=None, body=None, timeout=60, retries=2):
    """Send a request and return the parsed JSON ({} for an empty reply).
    Network errors and 5xx get retried. A 4xx is our mistake, so it raises
    with the API's own explanation."""
    data = json.dumps(body).encode() if body is not None else None
    all_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if data is not None:
        all_headers["Content-Type"] = "application/json"
    all_headers.update(headers or {})
    for attempt in range(retries + 1):
        request = urllib.request.Request(url, data=data, headers=all_headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as err:
            if err.code < 500 or attempt == retries:
                raise ApiError(f"{method} {url} returned {err.code}: {_explain(err)}") from None
        except urllib.error.URLError as err:
            if attempt == retries:
                raise ApiError(f"{method} {url} failed: {err.reason}") from None
        time.sleep(2 ** attempt)


def download(url, timeout=60):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as resp:
        return resp.read()


def _explain(err):
    try:
        return json.dumps(json.loads(err.read()))[:500]
    except Exception:
        return str(err.reason)
