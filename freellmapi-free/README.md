# FreeLLMAPI setup kit

[FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) is a small router that runs on your computer. You give it free API keys from providers like Google, Groq and Cerebras. It gives you one local endpoint that Claude Code, Codex and Gemini CLI can talk to, and it switches providers when one hits its free limit.

This kit installs it and adds three commands: `claude-free`, `codex-free` and `gemini-free`. Your normal `claude`, `codex` and `gemini` stay exactly as they are.

For macOS and Linux. On Windows, ask for the PowerShell version.

## What you need

- **Docker Desktop**, installed and running. Get it at https://www.docker.com/products/docker-desktop/ (on Linux, Docker Engine works too).
- A terminal.
- Whichever of Claude Code, Codex and Gemini CLI you already use.

## 1. Install

Download `install.sh` from this folder. On GitHub, open the file and click **Download raw file**. It lands in your Downloads folder. Read it first if you like. It's one file, and the comments say what each part does.

```bash
bash ~/Downloads/install.sh
```

It takes a couple of minutes the first time, while Docker pulls the image. When it finishes it prints a **setup code**. Keep that terminal open.

## 2. Add your free provider keys

All of this happens in your browser. Keys go into the dashboard, never into a chat or a terminal.

1. Open **http://localhost:3001**.
2. Enter an email and password, then click **Create account**. This account only exists on your computer. Nothing gets emailed.
3. It asks for a **setup code**. Paste the one the installer printed, then click **Create account** again.
   Lost it, or did your computer restart in between? Docker makes a new code each time it starts the router. Get the newest one with:
   `cd ~/freellmapi && docker compose logs freellmapi | grep "setup code" | tail -1`
4. Go to **Keys → Add key**. Pick a provider under **Platform**, paste its key under **API key**, then click **Add key**. Do this for each provider.
5. Go to **Keys → Unified API key** tab and click **Copy**. This is the one key your agents use.
6. Open a **new** terminal window and run `freellm-key`. Paste the key and press Enter. It stays hidden while you paste.

Good free keys to start with. Two or three is plenty:

| Provider | Get a key |
| --- | --- |
| Google AI Studio | https://aistudio.google.com/apikey |
| Groq | https://console.groq.com/keys |
| Cerebras | https://cloud.cerebras.ai |
| OpenRouter | https://openrouter.ai/keys |
| Mistral | https://console.mistral.ai/api-keys/ |
| NVIDIA | https://build.nvidia.com/settings/api-keys |

More providers means more room before you hit limits. The dashboard lists around 70 providers, each with a link to its key page.

**A note on privacy.** Free tiers are free partly because some providers may use what you send to improve their models. Keep customer details, wholesale pricing and passwords out of these sessions. The repo reviews each provider's terms [here](https://github.com/tashfeenahmed/freellmapi/blob/main/docs/en/architecture/00-high-level-index.md#terms-of-service-review).

## 3. Test it

```bash
freellm-test
```

You'll see something like `Answered by: groq/llama-3.3-70b-versatile`, followed by the answer. That first part is the free provider and model that took the request. Ask your own question with `freellm-test "your question"`.

## 4. Use it

```bash
claude-free                                         # Claude Code on free models
codex-free                                          # Codex on free models
gemini-free                                         # Gemini CLI on free models
claude-free -p "question"                           # one-shot questions
codex-free exec --skip-git-repo-check "question"
gemini-free --skip-trust -p "question"
```

- **First run.** Each command has its own fresh profile, so expect the first-run prompts: a theme and folder trust in Claude Code, and folder trust in Gemini. The one-shot forms above skip the folder checks that Codex and Gemini otherwise insist on.
- **Start Gemini in a project folder.** If you also use regular Gemini CLI, `gemini-free` won't start in your home folder, because there Gemini would mix in your normal settings and could skip the router. `cd ~/Documents` (or any project folder) first. It tells you if you forget.
- **Claude asks before acting.** `claude-free` asks before each edit or command. Claude Code's newer auto mode is turned off here, because it would have a free model decide what's safe to run.
- **Model choice.** The router picks a model (`auto`) and fails over on its own. To pin one, use `FREELLMAPI_MODEL=<model id> claude-free`. That works for all three commands. Model IDs are on the dashboard's **Models** page.
- **If an agent looks stuck,** run `freellm-test`. It tells you if Docker isn't running. When no provider has quota left, agents retry for a while before giving up. Most daily limits reset around midnight UTC, but Google's resets at midnight US Pacific time.
- **Quality.** Free models are a step below the paid frontier models. They're fine for everyday tasks. For the hard stuff, use your normal `claude`.

## What changed on your computer

| What | Where |
| --- | --- |
| Router settings, including the encryption key for your stored provider keys (only you can read it) | `~/freellmapi/.env`, `~/freellmapi/docker-compose.yml` |
| The router itself. It listens only on this computer (`127.0.0.1:3001`) and starts whenever Docker does. | Docker container `freellmapi-freellmapi-1`, image `ghcr.io/tashfeenahmed/freellmapi` (v0.15.0 unless you updated) |
| Database with your provider keys, encrypted | Docker volume `freellmapi_freellmapi-data` |
| The six commands, your unified key (only you can read it), and separate settings and history folders for each agent | `~/.freellmapi-free/` |
| One line that puts the commands on your PATH, marked `# freellmapi-free`. If that file didn't exist, the installer created it. | `~/.zshrc` for zsh, the Mac default. For bash: `~/.bashrc` on Linux, or on a Mac whichever of `~/.bash_profile`, `~/.bash_login` or `~/.profile` already exists. For fish: `~/.config/fish/conf.d/freellmapi-free.fish` |

**Not changed:** `~/.claude`, `~/.codex`, `~/.gemini`, your agent installs, and your logins. Each `-free` command sets its settings for that one run only. It also keeps your real Anthropic and Google credentials, settings files and `.env` files from reaching the router.

**What the router talks to:** the providers you add keys for, and nothing else of yours. Twice a day it also checks `api.freellmapi.co` for model-list updates. That check sends only a version number: no keys, no prompts. To turn it off, add `CATALOG_SYNC_DISABLED=1` to `~/freellmapi/.env`, then run `cd ~/freellmapi && docker compose up -d`.

## Undo

Make sure Docker Desktop is running, then:

```bash
freellm-uninstall
```

It asks once, then removes everything in the table above: the container, every version of the image, the database, both folders and the PATH line. If Docker isn't running, it stops without changing anything, so you can open Docker and run it again. Open a new terminal afterwards.

**Just want to pause it?** Run `cd ~/freellmapi && docker compose stop`. Bring it back with `cd ~/freellmapi && docker compose start`.

**If `freellm-uninstall` is gone,** do it by hand, with Docker running:

```bash
docker rm -f freellmapi-freellmapi-1
docker volume rm freellmapi_freellmapi-data
docker image rm $(docker image ls -q ghcr.io/tashfeenahmed/freellmapi)
rm -rf ~/freellmapi ~/.freellmapi-free
# then delete the line ending in "# freellmapi-free" from your shell file (see the table above)
```

## Updating

Check the [release notes](https://github.com/tashfeenahmed/freellmapi/releases) first. Then run the installer again with the new version:

```bash
FREELLMAPI_VERSION=v0.16.0 bash ~/Downloads/install.sh
```

This keeps your account, your provider keys, your settings and your port. If `install.sh` is no longer in Downloads, download it again the same way as in step 1.

**Port 3001 already taken?** Install on another one with `FREELLMAPI_PORT=3002 bash ~/Downloads/install.sh`. The dashboard is then at http://localhost:3002, and later runs remember the new port.

## Why not the official one-liner?

The README's `curl https://freellmapi.co/install.sh | bash` downloads and runs a script that isn't in the repo, so nobody can review it ahead of time. This kit runs the same Docker Compose steps from the repo's own install guide, pinned to v0.15.0, the release that was reviewed. It also leaves out the optional auto-updater, which needs root-level access to Docker.
