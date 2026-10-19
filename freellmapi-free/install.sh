#!/usr/bin/env bash
# Installs FreeLLMAPI (https://github.com/tashfeenahmed/freellmapi) with Docker
# and adds claude-free, codex-free and gemini-free, plus three helpers:
# freellm-key, freellm-test and freellm-uninstall.
#
# Your normal claude, codex and gemini setups are not touched. Each -free
# command sets its settings for that one run only and keeps its own history
# folder under ~/.freellmapi-free.
#
# Usage: bash install.sh    (safe to re-run; your encryption key and port are kept)
set -euo pipefail

FREELLMAPI_VERSION="${FREELLMAPI_VERSION:-v0.15.0}"
SERVER_DIR="${FREELLMAPI_DIR:-$HOME/freellmapi}"
FREE_HOME="${FREELLMAPI_FREE_HOME:-$HOME/.freellmapi-free}"
IMAGE="ghcr.io/tashfeenahmed/freellmapi:$FREELLMAPI_VERSION"
# Fixed, so the official one-liner's install in ~/freellmapi is adopted and a
# second copy anywhere else is caught instead of silently taken over.
PROJECT="freellmapi"
MARK="# freellmapi-free"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nStopped: %s\n' "$*" >&2; exit 1; }

# Refuse to write into a folder holding anything this installer didn't make,
# so the uninstaller can never delete someone's files. Patterns are globs.
only_ours() {
  local dir="$1" f name pattern ok
  shift
  [ -d "$dir" ] || return 0
  for f in "$dir"/* "$dir"/.[!.]*; do
    [ -e "$f" ] || continue
    name="$(basename "$f")"
    ok=0
    for pattern in "$@"; do
      # shellcheck disable=SC2254 # the patterns are meant to glob
      case "$name" in $pattern) ok=1 ;; esac
    done
    [ "$ok" = 1 ] || die "$dir already has files this installer didn't make ($name). Move them out of that folder, then run this again."
  done
}

# --- 1. Preflight -------------------------------------------------------------
# Under sudo or `su -` everything would land in root's home, out of your reach.
if [ "$(id -u)" = 0 ] && [ -z "${FREELLMAPI_ALLOW_ROOT:-}" ]; then
  die "Run this as your normal user, not with sudo or as root. It installs into your own home folder."
fi
command -v docker >/dev/null 2>&1 \
  || die "Docker isn't installed. Install Docker Desktop (https://www.docker.com/products/docker-desktop/), open it once, then run this again."
if ! docker_out="$(docker info 2>&1)"; then
  if [ "$(uname)" = Darwin ]; then
    case "$docker_out" in
      *"Error loading config file"*)
        die "Docker can't read its settings in ~/.docker (left over from running docker with sudo). Fix it with: sudo chown -R $(id -un) ~/.docker  then open Docker Desktop and run this again." ;;
    esac
    die "Docker Desktop isn't running. Open it, wait until it says it's running, then run this again."
  fi
  case "$docker_out" in
    *"permission denied while trying to connect"*)
      die "Docker is running, but your user isn't allowed to use it yet. Run: sudo usermod -aG docker $(id -un)  then log out and back in, and run this again (without sudo)." ;;
  esac
  die "Docker is installed but not running. Start it (open Docker Desktop, or: sudo systemctl start docker), then run this again."
fi
docker compose version >/dev/null 2>&1 \
  || die "This needs Docker Compose v2 ('docker compose'). Update Docker Desktop, then run this again."
command -v curl >/dev/null 2>&1 || die "curl is missing."

# An existing folder without env.sh wasn't made by this installer, even if its
# entries happen to be called claude, codex or gemini.
if [ -d "$FREE_HOME" ] && [ ! -f "$FREE_HOME/env.sh" ]; then
  for f in "$FREE_HOME"/* "$FREE_HOME"/.[!.]*; do
    if [ -e "$f" ] && [ "$(basename "$f")" != .DS_Store ]; then
      die "$FREE_HOME already exists and this installer didn't make it. Move it, or pick another folder with FREELLMAPI_FREE_HOME=..."
    fi
  done
fi
only_ours "$SERVER_DIR" .env .DS_Store docker-compose.yml 'docker-compose.yml.*'
only_ours "$FREE_HOME" bin claude codex gemini env.sh url key created rc .DS_Store
only_ours "$FREE_HOME/bin" claude-free codex-free gemini-free freellm-key freellm-test freellm-uninstall .DS_Store

mkdir -p "$SERVER_DIR" "$FREE_HOME"
SERVER_DIR="$(cd "$SERVER_DIR" && pwd)"
FREE_HOME="$(cd "$FREE_HOME" && pwd)"
compose="$SERVER_DIR/docker-compose.yml"

# Compare folders by identity (-ef), so a symlink or a different letter case on
# a Mac doesn't make your own install look like someone else's.
while IFS= read -r dir; do
  if [ -n "$dir" ] && ! [ "$dir" -ef "$SERVER_DIR" ]; then
    die "Another FreeLLMAPI install is already set up (from $dir). Remove it first with: docker compose -p $PROJECT down  then run this again."
  fi
done < <(docker ps -a --filter "label=com.docker.compose.project=$PROJECT" \
  --format '{{.Label "com.docker.compose.project.working_dir"}}' 2>/dev/null | sort -u)

# A database left by an earlier install only opens with that install's key.
if [ ! -f "$SERVER_DIR/.env" ] && docker volume inspect "${PROJECT}_freellmapi-data" >/dev/null 2>&1; then
  die "Docker still holds a FreeLLMAPI database from an earlier install, and its encryption key isn't in $SERVER_DIR/.env. To keep that account and its keys, copy the old install's .env into $SERVER_DIR. To start fresh, delete it with: docker volume rm ${PROJECT}_freellmapi-data  Then run this again."
fi

# Keep the port from an earlier install unless FREELLMAPI_PORT says otherwise.
# (Not $PORT: plenty of shells already set that for other projects.)
old_port=""
if [ -f "$compose" ] && grep -qF "$MARK" "$compose"; then
  old_port="$(sed -n 's/.*"127\.0\.0\.1:\([0-9][0-9]*\):3001".*/\1/p' "$compose" | head -1)"
elif [ -f "$compose" ]; then
  # The official one-liner publishes the PORT from its .env.
  old_port="$(sed -n 's/^PORT=\([0-9][0-9]*\)$/\1/p' "$SERVER_DIR/.env" 2>/dev/null | head -1 || true)"
fi
PORT="${FREELLMAPI_PORT:-${old_port:-3001}}"

# Download first, so a typo in FREELLMAPI_VERSION leaves a working setup alone.
say "Downloading $IMAGE"
docker pull "$IMAGE" \
  || die "Docker couldn't download $IMAGE (see Docker's message above). Check the version name, your internet connection and free space in Docker Desktop. Nothing was changed."

# --- 2. Router files in ~/freellmapi ------------------------------------------
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

# The repo's docker-compose.yml without the build section and the optional
# Watchtower updater, pinned to a release instead of :latest, and always bound
# to this computer only. Written beside the old one and swapped in only once it
# starts, so a failed run leaves the previous setup in place.
cat > "$compose.new" <<EOF
$MARK: written by install.sh. Re-run it to change version or port.
name: $PROJECT
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

say "Starting the router on port $PORT"
if ! (cd "$SERVER_DIR" && docker compose -f docker-compose.yml.new up -d); then
  rm -f "$compose.new"
  # up -d may already have replaced the old container. Bring the old setup back.
  if [ -f "$compose" ]; then (cd "$SERVER_DIR" && docker compose up -d) >/dev/null 2>&1 || true; fi
  die "The router didn't start on port $PORT. If Docker said the port is already allocated or not available, run this again with another one, e.g. FREELLMAPI_PORT=$((PORT + 1)) bash $0"
fi
if [ -f "$compose" ] && ! grep -qF "$MARK" "$compose"; then
  backup="$compose.backup-$(date +%Y%m%d%H%M%S)"
  cp "$compose" "$backup"
  say "Backed up your existing docker-compose.yml to $backup"
fi
mv "$compose.new" "$compose"

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
mkdir -p "$FREE_HOME/bin" "$FREE_HOME/claude" "$FREE_HOME/codex" "$FREE_HOME/gemini"

# Follow port changes, but keep any URL set with `freellm-key --url` (say, the
# desktop app on 127.0.0.1:31415).
saved_url="$(cat "$FREE_HOME/url" 2>/dev/null || true)"
if [ -z "$saved_url" ] || [ "$saved_url" = "http://localhost:${old_port:-3001}" ]; then
  printf '%s\n' "$URL" > "$FREE_HOME/url"
fi

# Gemini reads its auth choice from settings. This private copy says "use an
# API key", so gemini-free never falls back to your Google login.
mkdir -p "$FREE_HOME/gemini/.gemini"
gemini_settings="$FREE_HOME/gemini/.gemini/settings.json"
[ -f "$gemini_settings" ] \
  || printf '{\n  "security": { "auth": { "selectedType": "gemini-api-key" } }\n}\n' > "$gemini_settings"

cat > "$FREE_HOME/env.sh" <<'EOF'
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

# Every command gets FREE_HOME written into it rather than working it out from
# $0, which is only the bare name when someone runs `bash freellm-uninstall`.
write_cmd() {
  {
    printf '#!/usr/bin/env bash\n'
    printf 'FREE_HOME=%q\n' "$FREE_HOME"
    cat
  } > "$FREE_HOME/bin/$1"
  chmod 755 "$FREE_HOME/bin/$1"
}

write_cmd claude-free <<'EOF'
# Claude Code on FreeLLMAPI. Same settings `npx freellmapi launch` injects, for
# this run only, with its own config folder so ~/.claude stays untouched.
set -euo pipefail
. "$FREE_HOME/env.sh"
claude_bin="$(command -v claude 2>/dev/null || true)"
# The npm-local install only exists as a zsh alias, which scripts can't see.
if [ -z "$claude_bin" ] && [ -x "$HOME/.claude/local/claude" ]; then
  claude_bin="$HOME/.claude/local/claude"
fi
[ -n "$claude_bin" ] || { echo "claude isn't installed." >&2; exit 127; }
# Never send your real Anthropic credentials to the router, and make sure no
# cloud-provider switch routes around it.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN \
  CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY \
  CLAUDE_CODE_USE_ANTHROPIC_AWS CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD \
  CLAUDE_CODE_USE_MANTLE CLAUDE_CODE_USE_GATEWAY
export CLAUDE_CONFIG_DIR="$FREE_HOME/claude"
export ANTHROPIC_BASE_URL="$FREELLMAPI_URL"
export ANTHROPIC_AUTH_TOKEN="$FREELLMAPI_API_KEY"
export ANTHROPIC_MODEL="$FREELLMAPI_MODEL"
export ANTHROPIC_DEFAULT_OPUS_MODEL="$FREELLMAPI_MODEL"
export ANTHROPIC_DEFAULT_SONNET_MODEL="$FREELLMAPI_MODEL"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="$FREELLMAPI_MODEL"
export CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1
# Flag settings beat every settings file (this profile's, a project's), so these
# hold on every run: ask before acting, never auto mode (where a free model would
# judge each action), and no cloud-provider switch that would skip the router.
set -- --settings '{"permissions":{"defaultMode":"default","disableAutoMode":"disable"},"env":{"CLAUDE_CODE_USE_BEDROCK":"","CLAUDE_CODE_USE_VERTEX":"","CLAUDE_CODE_USE_FOUNDRY":"","CLAUDE_CODE_USE_ANTHROPIC_AWS":"","CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD":"","CLAUDE_CODE_USE_MANTLE":"","CLAUDE_CODE_USE_GATEWAY":"","ANTHROPIC_API_KEY":""}}' "$@"
# From your home folder, Claude Code would read your real ~/.claude/settings.json
# as this folder's project settings (keys, providers and all). Skip them there.
if [ "$(pwd -P)" = "$(cd "$HOME" && pwd -P)" ]; then
  set -- --setting-sources user "$@"
fi
exec "$claude_bin" "$@"
EOF

write_cmd codex-free <<'EOF'
# Codex on FreeLLMAPI. Same -c overrides `npx freellmapi launch-codex` passes,
# with its own CODEX_HOME so ~/.codex/config.toml stays untouched.
set -euo pipefail
. "$FREE_HOME/env.sh"
command -v codex >/dev/null 2>&1 || { echo "codex isn't installed." >&2; exit 127; }
# Once your home folder is trusted, Codex reads ~/.codex/config.toml there as
# project settings (sandbox, approvals, MCP servers), whatever CODEX_HOME says.
if [ -f "$HOME/.codex/config.toml" ] && [ "$(pwd -P)" = "$(cd "$HOME" && pwd -P)" ]; then
  echo "Start codex-free from a project folder, not your home folder (for example: cd ~/Documents)." >&2
  echo "Here Codex would mix in your normal ~/.codex settings." >&2
  exit 1
fi
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

write_cmd gemini-free <<'EOF'
# Gemini CLI on FreeLLMAPI's native Gemini endpoint, per the repo's docs
# (GOOGLE_GEMINI_BASE_URL + GEMINI_API_KEY), with its own GEMINI_CLI_HOME so
# ~/.gemini stays untouched.
set -euo pipefail
. "$FREE_HOME/env.sh"
command -v gemini >/dev/null 2>&1 || { echo "gemini isn't installed." >&2; exit 127; }
# With its home moved, Gemini treats your real home folder like any project and
# would apply ~/.gemini/settings.json (your Google login) over the private one.
if [ -d "$HOME/.gemini" ] && [ "$(pwd -P)" = "$(cd "$HOME" && pwd -P)" ]; then
  echo "Start gemini-free from a project folder, not your home folder (for example: cd ~/Documents)." >&2
  echo "Here Gemini would mix in your normal ~/.gemini settings and could skip the router." >&2
  exit 1
fi
# Set before anything runs gemini: even `gemini --version` writes into its home.
export GEMINI_CLI_HOME="$FREE_HOME/gemini"
# GEMINI_CLI_HOME arrived in 0.25. Older versions would quietly use your real
# ~/.gemini and Google login instead of the router.
gemini_version="$(gemini --version 2>/dev/null | head -1 || true)"
case "$gemini_version" in
  0.[0-9].* | 0.1[0-9].* | 0.2[0-4].*)
    echo "gemini-free needs Gemini CLI 0.25 or newer (you have $gemini_version)." >&2
    echo "Update it (npm install -g @google/gemini-cli, or brew upgrade gemini-cli), then run gemini-free again." >&2
    exit 1 ;;
esac
export GOOGLE_GEMINI_BASE_URL="$FREELLMAPI_URL"
export GEMINI_API_KEY="$FREELLMAPI_API_KEY"
# Set to empty rather than unset: Gemini fills unset variables from .env files
# (your ~/.gemini/.env, or a project's), which could swap in your real Google
# key or Vertex and skip the router.
export GOOGLE_API_KEY="" GOOGLE_GENAI_USE_VERTEXAI="" GOOGLE_GENAI_USE_GCA="" \
  GOOGLE_CLOUD_PROJECT="" GOOGLE_CLOUD_LOCATION=""
case "$FREELLMAPI_MODEL" in
  auto) ;;
  gemini*)
    # The router maps every gemini-* name to the dashboard's choice.
    echo "Note: gemini-free can't pin a Gemini model by name. Pick it in the dashboard under Keys > Agents > Gemini model mapping." >&2 ;;
  *) export GEMINI_MODEL="$FREELLMAPI_MODEL" ;;
esac
exec gemini "$@"
EOF

write_cmd freellm-key <<'EOF'
# Saves the unified key from the dashboard's Keys page for the -free commands.
#   freellm-key              paste when asked (input is hidden)
#   freellm-key --url URL    point the -free commands at another router
set -euo pipefail
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
# The header goes in on stdin, so the key never shows up in `ps`.
code="$(printf 'header = "Authorization: Bearer %s"\n' "$key" \
  | curl -sS -K - -o /dev/null -w '%{http_code}' "$url/v1/models" 2>/dev/null || true)"
case "$code" in
  200) ;;
  401 | 403) echo "The router rejected that key. Nothing saved." >&2; exit 1 ;;
  *) echo "Couldn't reach the router at $url (HTTP $code). Saving anyway." >&2 ;;
esac
(umask 077 && printf '%s\n' "$key" > "$FREE_HOME/key")
echo "Saved. Now run: freellm-test"
EOF

{
  printf 'SERVER_DIR=%q\n' "$SERVER_DIR"
  cat <<'EOF'
# Sends one request through FreeLLMAPI and shows which free model answered.
#   freellm-test                  default question
#   freellm-test "your question"
set -euo pipefail
. "$FREE_HOME/env.sh"
prompt="${*:-In one sentence, what does a fresh cup of single-origin coffee smell like?}"
# JSON-escape backslashes and quotes, then flatten control characters
# (tabs, line breaks) that would make the request invalid.
escaped="$(printf '%s' "$prompt" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\t\r\n' '   ' | tr -d '\000-\037')"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
code="$(printf 'header = "Authorization: Bearer %s"\n' "$FREELLMAPI_API_KEY" \
  | curl -sS -K - -D "$tmp/headers" -o "$tmp/body" -w '%{http_code}' \
    "$FREELLMAPI_URL/v1/chat/completions" \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"$FREELLMAPI_MODEL\",\"max_tokens\":300,\"messages\":[{\"role\":\"user\",\"content\":\"$escaped\"}]}" \
    2>/dev/null || true)"
if [ "$code" = 000 ] || [ -z "$code" ]; then
  if ! docker info >/dev/null 2>&1; then
    echo "The router isn't answering at $FREELLMAPI_URL because Docker isn't running. Open Docker Desktop, wait until it's running, then try again." >&2
  else
    echo "Docker is running, but the router isn't answering at $FREELLMAPI_URL. Start it with: cd \"$SERVER_DIR\" && docker compose up -d" >&2
  fi
  exit 1
fi
if [ "$code" != 200 ]; then
  echo "Request failed (HTTP $code):" >&2
  cat "$tmp/body" >&2 2>/dev/null || true
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
} | write_cmd freellm-test

{
  printf 'SERVER_DIR=%q\n' "$SERVER_DIR"
  cat <<'EOF'
# Undoes freellmapi-free/install.sh. Your normal claude, codex and gemini
# setups were never changed, so there is nothing to restore there.
set -euo pipefail
# Only ever remove a folder install.sh set up.
if [ ! -f "$FREE_HOME/env.sh" ] || [ "$FREE_HOME" = "$HOME" ] || [ "$FREE_HOME" = / ]; then
  echo "$FREE_HOME doesn't look like a freellmapi-free install. Nothing changed." >&2
  exit 1
fi
printf 'Remove FreeLLMAPI, its database (your provider keys inside it) and the -free commands? [y/N] '
read -r answer
case "$answer" in y | Y | yes | YES) ;; *) echo "Nothing changed."; exit 0 ;; esac

# The router goes first, found by its project name so this works even if
# ~/freellmapi was moved or deleted. If Docker can't remove it, stop before
# touching anything else, so a later run can still finish the job.
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker isn't installed any more, so there's no router left to remove."
elif ! docker info >/dev/null 2>&1; then
  echo "Docker isn't running. Open Docker Desktop, wait until it's running, then run freellm-uninstall again. Nothing changed." >&2
  exit 1
else
  not_ours=""
  while IFS= read -r dir; do
    if [ -n "$dir" ] && [ "$dir" != "$SERVER_DIR" ] && ! [ "$dir" -ef "$SERVER_DIR" ]; then
      not_ours="$dir"
    fi
  done < <(docker ps -a --filter label=com.docker.compose.project=freellmapi \
    --format '{{.Label "com.docker.compose.project.working_dir"}}' | sort -u)
  if [ -n "$not_ours" ]; then
    echo "Docker's FreeLLMAPI router was set up from $not_ours, not by this kit. Leaving it alone."
  else
    (cd "$SERVER_DIR" 2>/dev/null || cd /; docker compose -p freellmapi down -v) \
      || { echo "Couldn't remove the router container. Nothing else changed." >&2; exit 1; }
    # Every version, including ones left behind by updates.
    docker image ls --format '{{.Repository}}:{{.Tag}}' ghcr.io/tashfeenahmed/freellmapi 2>/dev/null \
      | while read -r img; do
          if docker image rm "$img" >/dev/null 2>&1; then echo "Removed image $img"; fi
        done || true
    docker image prune -f --filter "label=org.opencontainers.image.source=https://github.com/tashfeenahmed/freellmapi" \
      >/dev/null 2>&1 || true
  fi
fi
rm -f "$SERVER_DIR/.env" "$SERVER_DIR/docker-compose.yml" "$SERVER_DIR/.DS_Store" \
  "$SERVER_DIR"/docker-compose.yml.*
if rmdir "$SERVER_DIR" 2>/dev/null; then
  echo "Removed $SERVER_DIR"
elif [ -d "$SERVER_DIR" ]; then
  echo "Left $SERVER_DIR in place: it has files this kit didn't make."
fi

created="$(cat "$FREE_HOME/created" 2>/dev/null || true)"
recorded_rc="$(cat "$FREE_HOME/rc" 2>/dev/null || true)"
for rc in ${recorded_rc:+"$recorded_rc"} "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" \
  "$HOME/.bash_login" "$HOME/.profile" "$HOME/.config/fish/conf.d/freellmapi-free.fish"; do
  # LC_ALL=C and -a: treat every byte as text, so lines in another encoding survive.
  if [ -f "$rc" ] && LC_ALL=C grep -aqF '# freellmapi-free' "$rc"; then
    LC_ALL=C grep -avF '# freellmapi-free' "$rc" > "$rc.freellmapi-tmp" || true
    cat "$rc.freellmapi-tmp" > "$rc"
    rm -f "$rc.freellmapi-tmp"
    echo "Removed the PATH line from $rc"
    # A file the installer created and that is now empty goes too, so it can't
    # keep shadowing ~/.profile.
    if printf '%s\n' "$created" | grep -qxF "$rc" && ! LC_ALL=C grep -aq '[^[:space:]]' "$rc"; then
      rm -f "$rc"
      echo "Removed $rc (the installer had created it)"
    fi
  fi
done

# Only the files install.sh made, never a blanket rm -rf of the folder.
for cmd in claude-free codex-free gemini-free freellm-key freellm-test freellm-uninstall; do
  rm -f "$FREE_HOME/bin/$cmd"
done
rm -f "$FREE_HOME/bin/.DS_Store"
rmdir "$FREE_HOME/bin" 2>/dev/null || true
rm -rf "$FREE_HOME/claude" "$FREE_HOME/codex" "$FREE_HOME/gemini"
rm -f "$FREE_HOME/env.sh" "$FREE_HOME/url" "$FREE_HOME/key" "$FREE_HOME/created" "$FREE_HOME/rc" \
  "$FREE_HOME/.DS_Store"
if rmdir "$FREE_HOME" 2>/dev/null; then
  echo "Removed $FREE_HOME"
else
  echo "Left $FREE_HOME in place: it has files this kit didn't make."
fi
echo "Done. Open a new terminal window to finish."
EOF
} | write_cmd freellm-uninstall

# --- 4. One PATH line in your shell startup file ------------------------------
shell_name="$(basename "${SHELL:-bash}")"
rc=""
case "$shell_name" in
  zsh) rc="${ZDOTDIR:-$HOME}/.zshrc" ;;
  bash)
    if [ "$(uname)" = Darwin ]; then
      # Terminal starts bash as a login shell, which reads only the first of
      # these that exists. Creating .bash_profile would hide your .profile.
      for f in .bash_profile .bash_login .profile; do
        if [ -f "$HOME/$f" ]; then rc="$HOME/$f"; break; fi
      done
      rc="${rc:-$HOME/.bash_profile}"
    else
      rc="$HOME/.bashrc"
    fi
    ;;
  fish) rc="$HOME/.config/fish/conf.d/freellmapi-free.fish" ;;
esac
if [ -z "$rc" ]; then
  say "Your shell ($shell_name) isn't one this installer knows. Add $FREE_HOME/bin to your PATH yourself."
elif grep -qF "$MARK" "$rc" 2>/dev/null; then
  say "PATH line already in $rc"
else
  if [ ! -e "$rc" ]; then
    mkdir -p "$(dirname "$rc")"
    printf '%s\n' "$rc" >> "$FREE_HOME/created"
  fi
  if [ "$shell_name" = fish ]; then
    # fish single quotes only treat \ and ' specially; escape both.
    fish_bin="$(printf '%s' "$FREE_HOME/bin" | sed "s/[\\\\']/\\\\&/g")"
    printf "\nset -gx PATH '%s' \$PATH %s\n" "$fish_bin" "$MARK" >> "$rc"
  else
    # shellcheck disable=SC2016 # $PATH must stay literal in the rc file
    printf '\nexport PATH=%q:"$PATH" %s\n' "$FREE_HOME/bin" "$MARK" >> "$rc"
  fi
  say "Added one line to $rc so the -free commands are on your PATH"
fi
# The uninstaller looks here first, wherever the line went (ZDOTDIR, fish, ...).
if [ -n "$rc" ]; then printf '%s\n' "$rc" > "$FREE_HOME/rc"; fi

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
