#!/usr/bin/env bash
# Installs FreeLLMAPI (https://github.com/tashfeenahmed/freellmapi) with Docker
# and adds claude-free, codex-free and gemini-free, plus three helpers:
# freellm-key, freellm-test and freellm-uninstall.
#
# Your normal claude, codex and gemini setups are not touched. Each -free
# command sets its settings for that one run only and keeps its own history
# folder under ~/.freellmapi-free.
#
# Usage: bash install.sh    (safe to re-run; your encryption key is kept)
set -euo pipefail

FREELLMAPI_VERSION="${FREELLMAPI_VERSION:-v0.15.0}"
SERVER_DIR="${FREELLMAPI_DIR:-$HOME/freellmapi}"
FREE_HOME="${FREELLMAPI_FREE_HOME:-$HOME/.freellmapi-free}"
# Not $PORT: plenty of shells already set that for other projects.
PORT="${FREELLMAPI_PORT:-3001}"
IMAGE="ghcr.io/tashfeenahmed/freellmapi:$FREELLMAPI_VERSION"
MARK="# freellmapi-free"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nStopped: %s\n' "$*" >&2; exit 1; }

# --- 1. Docker ---------------------------------------------------------------
command -v docker >/dev/null 2>&1 \
  || die "Docker isn't installed. Install Docker Desktop (https://www.docker.com/products/docker-desktop/), open it once, then run this again."
docker info >/dev/null 2>&1 \
  || die "Docker is installed but not running. Open Docker Desktop, wait until it says it's running, then run this again."
docker compose version >/dev/null 2>&1 \
  || die "This needs Docker Compose v2 ('docker compose'). Update Docker Desktop, then run this again."
command -v curl >/dev/null 2>&1 || die "curl is missing."

# --- 2. Router files in ~/freellmapi -----------------------------------------
# Same folder the official one-liner uses. Refuse to write into anything else
# (a git checkout, say) so the uninstaller never deletes files it didn't make.
if [ -d "$SERVER_DIR" ]; then
  for f in "$SERVER_DIR"/* "$SERVER_DIR"/.[!.]*; do
    [ -e "$f" ] || continue
    case "$(basename "$f")" in
      .env | docker-compose.yml | docker-compose.yml.backup-*) ;;
      *) die "$SERVER_DIR already has other files in it ($(basename "$f")). Move them, or re-run with FREELLMAPI_DIR=/some/empty/folder." ;;
    esac
  done
fi
mkdir -p "$SERVER_DIR"

if [ -f "$SERVER_DIR/.env" ]; then
  say "Keeping your existing $SERVER_DIR/.env (and its encryption key)"
else
  say "Creating $SERVER_DIR/.env with a fresh encryption key"
  if command -v openssl >/dev/null 2>&1; then
    enc_key="$(openssl rand -hex 32)"
  else
    enc_key="$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')"
  fi
  (umask 077 && printf 'ENCRYPTION_KEY=%s\nPORT=3001\n' "$enc_key" > "$SERVER_DIR/.env")
fi

compose="$SERVER_DIR/docker-compose.yml"
if [ -f "$compose" ] && ! grep -qF "$MARK" "$compose"; then
  backup="$compose.backup-$(date +%Y%m%d%H%M%S)"
  cp "$compose" "$backup"
  say "Backed up your existing docker-compose.yml to $backup"
fi
# The repo's docker-compose.yml without the build section and the optional
# Watchtower updater, pinned to a release instead of :latest, and always bound
# to this computer only.
cat > "$compose" <<EOF
$MARK: written by install.sh. Re-run it to change version or port.
services:
  freellmapi:
    image: $IMAGE
    env_file:
      - .env
    environment:
      NODE_ENV: production
      PORT: 3001
    ports:
      - "127.0.0.1:$PORT:3001"
    volumes:
      - freellmapi-data:/app/server/data
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3001/api/ping').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"]
      interval: 30s
      timeout: 5s
      start_period: 15s
      retries: 3

volumes:
  freellmapi-data:
EOF

say "Pulling $IMAGE and starting it"
(cd "$SERVER_DIR" && docker compose pull && docker compose up -d)

URL="http://localhost:$PORT"
printf 'Waiting for %s ' "$URL"
ready=0
for _ in $(seq 1 90); do
  if curl -fsS -o /dev/null "$URL/api/ping" 2>/dev/null; then ready=1; break; fi
  printf '.'
  sleep 1
done
echo
[ "$ready" = 1 ] || die "The router didn't answer within 90 seconds. Check: cd $SERVER_DIR && docker compose logs freellmapi"

# --- 3. The -free commands in ~/.freellmapi-free/bin --------------------------
say "Installing claude-free, codex-free, gemini-free and helpers in $FREE_HOME/bin"
mkdir -p "$FREE_HOME/bin" "$FREE_HOME/claude" "$FREE_HOME/codex" "$FREE_HOME/gemini/.gemini"
[ -s "$FREE_HOME/url" ] || printf '%s\n' "$URL" > "$FREE_HOME/url"

# Gemini CLI reads its auth choice from settings. This private copy says "use an
# API key", so gemini-free never falls back to your Google login.
gemini_settings="$FREE_HOME/gemini/.gemini/settings.json"
[ -f "$gemini_settings" ] \
  || printf '{\n  "security": { "auth": { "selectedType": "gemini-api-key" } }\n}\n' > "$gemini_settings"

{
  printf "FREE_HOME='%s'\n" "$FREE_HOME"
  cat <<'EOF'
# Shared by the -free commands: loads the router URL and your unified key.
if [ -z "${FREELLMAPI_URL:-}" ]; then
  FREELLMAPI_URL="$(cat "$FREE_HOME/url" 2>/dev/null || echo http://localhost:3001)"
fi
FREELLMAPI_URL="${FREELLMAPI_URL%/}"
if [ -z "${FREELLMAPI_API_KEY:-}" ]; then
  if [ ! -s "$FREE_HOME/key" ]; then
    echo "No FreeLLMAPI key saved yet. At $FREELLMAPI_URL open Keys > Unified API key > Copy, then run: freellm-key" >&2
    exit 1
  fi
  FREELLMAPI_API_KEY="$(cat "$FREE_HOME/key")"
fi
# "auto" lets the router pick and fail over. Set FREELLMAPI_MODEL to pin one.
FREELLMAPI_MODEL="${FREELLMAPI_MODEL:-auto}"
EOF
} > "$FREE_HOME/env.sh"

cat > "$FREE_HOME/bin/claude-free" <<'EOF'
#!/usr/bin/env bash
# Claude Code on FreeLLMAPI. Same settings `npx freellmapi launch` injects, for
# this run only, with its own config folder so ~/.claude stays untouched.
set -euo pipefail
. "$(dirname "$0")/../env.sh"
command -v claude >/dev/null 2>&1 || { echo "claude isn't installed." >&2; exit 127; }
# Never send your real Anthropic credentials to the router, and make sure no
# cloud-provider switch routes around it.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN \
  CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY
export CLAUDE_CONFIG_DIR="$FREE_HOME/claude"
export ANTHROPIC_BASE_URL="$FREELLMAPI_URL"
export ANTHROPIC_AUTH_TOKEN="$FREELLMAPI_API_KEY"
export ANTHROPIC_MODEL="$FREELLMAPI_MODEL"
export ANTHROPIC_DEFAULT_OPUS_MODEL="$FREELLMAPI_MODEL"
export ANTHROPIC_DEFAULT_SONNET_MODEL="$FREELLMAPI_MODEL"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="$FREELLMAPI_MODEL"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
exec claude "$@"
EOF

cat > "$FREE_HOME/bin/codex-free" <<'EOF'
#!/usr/bin/env bash
# Codex on FreeLLMAPI. Same -c overrides `npx freellmapi launch-codex` passes,
# with its own CODEX_HOME so ~/.codex/config.toml stays untouched.
set -euo pipefail
. "$(dirname "$0")/../env.sh"
command -v codex >/dev/null 2>&1 || { echo "codex isn't installed." >&2; exit 127; }
export CODEX_HOME="$FREE_HOME/codex"
export FREELLMAPI_API_KEY
exec codex \
  -c 'model_provider="freellmapi"' \
  -c "model=\"$FREELLMAPI_MODEL\"" \
  -c 'model_providers.freellmapi.name="FreeLLMAPI"' \
  -c "model_providers.freellmapi.base_url=\"$FREELLMAPI_URL/v1\"" \
  -c 'model_providers.freellmapi.wire_api="responses"' \
  -c 'model_providers.freellmapi.env_key="FREELLMAPI_API_KEY"' \
  -c 'model_providers.freellmapi.requires_openai_auth=false' \
  "$@"
EOF

cat > "$FREE_HOME/bin/gemini-free" <<'EOF'
#!/usr/bin/env bash
# Gemini CLI on FreeLLMAPI's native Gemini endpoint, per the repo's docs
# (GOOGLE_GEMINI_BASE_URL + GEMINI_API_KEY), with its own GEMINI_CLI_HOME so
# ~/.gemini stays untouched.
set -euo pipefail
. "$(dirname "$0")/../env.sh"
command -v gemini >/dev/null 2>&1 || { echo "gemini isn't installed." >&2; exit 127; }
# Never send your real Google credentials to the router.
unset GOOGLE_API_KEY GOOGLE_GENAI_USE_VERTEXAI GOOGLE_GENAI_USE_GCA GOOGLE_CLOUD_PROJECT
export GEMINI_CLI_HOME="$FREE_HOME/gemini"
export GOOGLE_GEMINI_BASE_URL="$FREELLMAPI_URL"
export GEMINI_API_KEY="$FREELLMAPI_API_KEY"
exec gemini "$@"
EOF

cat > "$FREE_HOME/bin/freellm-key" <<'EOF'
#!/usr/bin/env bash
# Saves the unified key from the dashboard's Keys page for the -free commands.
#   freellm-key              paste when asked (input is hidden)
#   freellm-key --url URL    point the -free commands at another router
set -euo pipefail
FREE_HOME="$(cd "$(dirname "$0")/.." && pwd)"
if [ "${1:-}" = "--url" ]; then
  printf '%s\n' "${2:?usage: freellm-key --url http://localhost:3001}" > "$FREE_HOME/url"
  echo "Router URL set to $2"
  exit 0
fi
url="$(cat "$FREE_HOME/url")"
printf 'Paste your unified key from %s (Keys > Unified API key > Copy). It stays hidden as you paste: ' "$url"
IFS= read -r -s key
echo
key="$(printf '%s' "$key" | tr -d '[:space:]')"
case "$key" in
  freellmapi-*) ;;
  *) echo "That doesn't look like a FreeLLMAPI key (they start with freellmapi-). Nothing saved." >&2; exit 1 ;;
esac
code="$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $key" "$url/v1/models" 2>/dev/null || true)"
case "$code" in
  200) ;;
  401 | 403) echo "The router rejected that key. Nothing saved." >&2; exit 1 ;;
  *) echo "Couldn't reach the router at $url (HTTP $code). Saving anyway." >&2 ;;
esac
(umask 077 && printf '%s\n' "$key" > "$FREE_HOME/key")
echo "Saved. Now run: freellm-test"
EOF

cat > "$FREE_HOME/bin/freellm-test" <<'EOF'
#!/usr/bin/env bash
# Sends one request through FreeLLMAPI and shows which free model answered.
#   freellm-test                  default question
#   freellm-test "your question"
set -euo pipefail
. "$(dirname "$0")/../env.sh"
prompt="${*:-In one sentence, what does a fresh cup of single-origin coffee smell like?}"
escaped="$(printf '%s' "$prompt" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
code="$(curl -sS -D "$tmp/headers" -o "$tmp/body" -w '%{http_code}' \
  "$FREELLMAPI_URL/v1/chat/completions" \
  -H "Authorization: Bearer $FREELLMAPI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$FREELLMAPI_MODEL\",\"max_tokens\":300,\"messages\":[{\"role\":\"user\",\"content\":\"$escaped\"}]}" \
  || true)"
if [ "$code" != 200 ]; then
  echo "Request failed (HTTP $code):" >&2
  cat "$tmp/body" >&2
  echo >&2
  exit 1
fi
routed="$(grep -i '^x-routed-via:' "$tmp/headers" | head -1 | cut -d' ' -f2- | tr -d '\r')"
echo "Answered by: ${routed:-unknown} (provider/model)"
echo
if command -v node >/dev/null 2>&1; then
  node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(b.choices?.[0]?.message?.content ?? JSON.stringify(b))' "$tmp/body"
else
  cat "$tmp/body"
  echo
fi
EOF

{
  printf '#!/usr/bin/env bash\n'
  printf "SERVER_DIR='%s'\nIMAGE='%s'\n" "$SERVER_DIR" "$IMAGE"
  cat <<'EOF'
# Undoes freellmapi-free/install.sh. Your normal claude, codex and gemini
# setups were never changed, so there is nothing to restore there.
set -euo pipefail
FREE_HOME="$(cd "$(dirname "$0")/.." && pwd)"
printf 'Remove FreeLLMAPI, its database (your provider keys inside it) and the -free commands? [y/N] '
read -r answer
case "$answer" in y | Y | yes | YES) ;; *) echo "Nothing changed."; exit 0 ;; esac

if [ -f "$SERVER_DIR/docker-compose.yml" ] && command -v docker >/dev/null 2>&1; then
  (cd "$SERVER_DIR" && docker compose down -v) || echo "Couldn't stop the container. Is Docker running?" >&2
  docker image rm "$IMAGE" >/dev/null 2>&1 && echo "Removed image $IMAGE" || true
fi
rm -f "$SERVER_DIR/.env" "$SERVER_DIR/docker-compose.yml"
rmdir "$SERVER_DIR" 2>/dev/null && echo "Removed $SERVER_DIR" \
  || echo "Left $SERVER_DIR in place: it has other files (old docker-compose backups?)."

for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
  if [ -f "$rc" ] && grep -qF '# freellmapi-free' "$rc"; then
    grep -vF '# freellmapi-free' "$rc" > "$rc.freellmapi-tmp" || true
    cat "$rc.freellmapi-tmp" > "$rc"
    rm -f "$rc.freellmapi-tmp"
    echo "Removed the PATH line from $rc"
  fi
done
rm -rf "$FREE_HOME"
echo "Done. Open a new terminal window to finish."
EOF
} > "$FREE_HOME/bin/freellm-uninstall"

chmod 755 "$FREE_HOME/bin/"*

# --- 4. One PATH line in your shell startup file ------------------------------
case "$(basename "${SHELL:-bash}")" in
  zsh) rc="$HOME/.zshrc" ;;
  bash) if [ "$(uname)" = Darwin ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi ;;
  *) rc="$HOME/.profile" ;;
esac
if grep -qF "$MARK" "$rc" 2>/dev/null; then
  say "PATH line already in $rc"
else
  # shellcheck disable=SC2016 # $PATH must stay literal in the rc file
  printf '\nexport PATH="%s/bin:$PATH" %s\n' "$FREE_HOME" "$MARK" >> "$rc"
  say "Added one line to $rc so the -free commands are on your PATH"
fi

# --- 5. Next steps ------------------------------------------------------------
setup_code="$(cd "$SERVER_DIR" && docker compose logs --no-color freellmapi 2>/dev/null \
  | grep -o 'First-run setup code: [A-Za-z0-9]*' | tail -1 | sed 's/.*: //' || true)"

cat <<EOF

FreeLLMAPI $FREELLMAPI_VERSION is running at $URL

Next:
  1. Open $URL in your browser and create your account.
EOF
if [ -n "$setup_code" ]; then
  echo "     If it asks for a setup code, use: $setup_code"
fi
cat <<EOF
  2. Keys > Add key: add your free provider keys (paste them there, nowhere else).
  3. Keys > Unified API key tab > Copy.
  4. Open a NEW terminal window, then run:
       freellm-key      save the unified key (hidden input)
       freellm-test     one test request, shows which model answered
  5. Use: claude-free, codex-free, gemini-free
     Undo everything: freellm-uninstall
EOF
