# Buddha Station

A private pixel-art space station where AI crew members do real work for Buddha Beans, on your own Mac.

You build rooms, put gear in them, and recruit crew. A crew member can only use the gear in their own room. Give them a job, watch them walk to the filing cabinet or the signal dish, and pick up the finished work from the Outbox.

It's our own build, written from scratch. It's modeled on the idea behind StarNet and uses none of their code.

## What's safe about it

Safety was the main goal, so the limits are built into how the station works:

- **Nothing runs on your Mac's terminal.** Crew can't run commands, install anything, or open apps. When code needs to run, it runs in Anthropic's cloud sandbox, not on your computer.
- **Two folders, nothing else.** Each crew member gets one private workspace folder. They can also deliver to the Outbox and read the Inbox you drop files into. They can't reach the rest of your computer: no "..", no full paths, no hidden files, no shortcuts (symlinks) pointing out.
- **Text files only.** Crew can only write `.md .txt .csv .tsv .json .html .xml .yaml`. Nothing they make can be double-clicked into a running program.
- **No delete button for crew.** When they overwrite a file, the old version is kept.
- **Spending caps.** There's a daily cap ($5 to start), a per-job cap ($1 to start), and a step limit per job. When a cap is hit, work stops. Also set a monthly limit at console.anthropic.com as a second brake.
- **A big red Stop button.** It stops every job at once, from the screen or from your phone.
- **Keys in the Keychain.** Your Anthropic key, Etsy keys and Telegram token go in the Mac Keychain. They never reach the web page, the logs, or the station's files.
- **Only your Mac can open it.** The control panel only listens to this computer, and it needs a fresh secret code every time it starts. Other websites open in your browser can't drive the crew.
- **Etsy is read-only.** Crew can look at listings, orders and reviews. They can't change a price, publish anything, or message a buyer. Buyer names, emails, addresses and notes are removed before a crew member ever sees an order.
- **Your phone is the only phone.** Telegram pairing needs a code shown on your screen. Messages from any other chat are ignored and logged.
- **Everything is logged.** The Log tab shows every job, tool use, setting change and outside message.
- **One outside library.** The station uses Anthropic's official SDK and nothing else, pinned to an exact version and installed with install scripts turned off.

What it can't promise: AI can get things wrong. Read what the crew writes before you publish it or send it to a customer. Web pages and reviews can contain sneaky instructions. The crew is told to ignore them, and the gear limits mean that even a fooled crew member can only touch their own folder.

## Setting it up

You need a Mac and about ten minutes.

1. **Install Node.js.** Download the LTS installer from [nodejs.org](https://nodejs.org) (version 22 or newer) and run it.
2. **Get an Anthropic API key.** Sign in at [console.anthropic.com](https://console.anthropic.com), create a key, and set a monthly spend limit while you're there.
3. **Start the station.** Double-click `Start Buddha Station.command` in this folder. The first time, macOS may say it can't verify the file. If it does, right-click it, choose Open, then Open again. The first start installs Anthropic's library, which takes about a minute.
4. **Paste your key.** The station opens in your browser. Go to Settings, paste the key, click Save, then click Check the key.
5. **Give an order.** Click a crew member, type a job, and hit Send order.

Keep the Terminal window open while you use the station. Close it to shut everything down.

## How the station works

**Gear decides what crew can do.** A crew member can use the gear in their own room, plus the Outbox.

| Gear | What it allows |
|---|---|
| Filing Cabinet | Read and write files in their own folder. Read the shared Inbox. |
| Memory Core | Keep notes that carry over between jobs. You can read and edit them. |
| Signal Dish | Search the web and read pages. Runs on Anthropic's servers. |
| Workbench | Run code in Anthropic's cloud sandbox. Good for crunching CSVs. |
| Comms Hatch | Hand work to crew in the same room or one hallway away. |
| Shop Counter | Look at your Etsy shop. Read-only. |
| Antenna | Use an outside tool server (MCP) you've added in Settings. |

**Drag a crew member into another room** to change what they can do. The change applies from their next job.

**Hallways** join rooms. With a Comms Hatch in the room, crew can hand work to anyone a hallway away. A job can only be passed along three times, so crew can't bounce work around forever.

**Schedules** run jobs on their own: every day, weekdays, or every few hours. A job only runs while the station is open, and one missed while it was closed is skipped, not piled up.

**Night Shift** keeps your Mac awake while the station runs, sends finished work to your phone, and leaves a shift report in the Outbox when you switch it off. Caps stay the same overnight.

**Models.** Each crew member uses Claude Opus 5.5 (the smartest) or Claude Sonnet 5.5 (half the price), at low, medium or high effort. Higher effort thinks harder and costs more. Change it under Edit on their page.

## Connecting Etsy

1. Go to [etsy.com/developers](https://www.etsy.com/developers) and create an app. Etsy has to approve it, which can take a few days.
2. In the app's settings, add this callback URL exactly: `http://localhost:4777/etsy/callback`
3. In the station, go to Settings → Etsy and paste the app's keystring and shared secret.
4. Click Connect Etsy and approve on etsy.com.
5. Put a Shop Counter in a room. Crew in that room can now see your shop.

To cut access, click Disconnect Etsy, or revoke the app from your Etsy account settings.

## Talking to the crew from your phone

1. In Telegram, message @BotFather, send `/newbot`, and follow the steps. It gives you a token.
2. Paste the token in Settings → Telegram and click Save.
3. Click Pair my phone, then send the code it shows to your new bot within ten minutes.

From your phone: `/crew`, `/ask Sage write a post about our Colombian decaf`, `/status`, and `/stop`. Nothing in Settings can be changed from the phone.

## Where your stuff lives

Everything is in `~/BuddhaStation`, readable only by your Mac account:

- `inbox/`: drop text files here for crew to read
- `outbox/`: finished work
- `agents/`: each crew member's workspace, memory and old file versions
- `tasks/`: full records of every job
- `audit.log`: the log
- `station.json`, `config.json`, `schedules.json`: your layout and settings

## For whoever maintains it

```sh
npm ci --ignore-scripts
npm test          # 40 tests: safety limits, server locks, Etsy privacy, Telegram pairing
npm start         # same as the launcher
```

Settings for development: `BUDDHA_STATION_HOME` (data folder), `BUDDHA_STATION_PORT` (default 4777), `BUDDHA_STATION_FILE_SECRETS=1` (keep secrets in files instead of the Keychain, for non-Mac machines). Pass `--no-open` to skip opening the browser.

The code is small on purpose. Every file starts with a comment that says what it does:

- `src/main.js`: starts everything
- `src/server.js`: the control panel server and its locks
- `src/runtime.js`: runs jobs, enforces caps and the step limit
- `src/tools.js`: the only things crew can do
- `src/paths.js`: keeps file paths inside their folder
- `src/layout.js`: rooms, gear, crew, and who can do what
- `src/etsy.js`, `src/telegram.js`, `src/scheduler.js`, `src/nightshift.js`: the connections
- `src/secrets.js`: Keychain storage
- `public/`: the station screen, drawn in code with no outside images or scripts
