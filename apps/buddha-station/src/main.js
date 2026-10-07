// Starts Buddha Station and opens it in your browser.

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { Store } from "./store.js";
import { makeSecrets } from "./secrets.js";
import { Budget } from "./budget.js";
import { Runtime } from "./runtime.js";
import { Scheduler } from "./scheduler.js";
import { Telegram } from "./telegram.js";
import { Etsy } from "./etsy.js";
import { NightShift } from "./nightshift.js";
import { createServer } from "./server.js";

const port = Number(process.env.BUDDHA_STATION_PORT || 4777);
const store = new Store();
const secrets = makeSecrets(store.home);
const budget = new Budget(store, () => store.config);

let cached = { key: null, client: null };
async function makeClient() {
  const key = (await secrets.get("anthropic")) || process.env.ANTHROPIC_API_KEY || null;
  if (!key) return null;
  if (cached.key !== key) cached = { key, client: new Anthropic({ apiKey: key, maxRetries: 2 }) };
  return cached.client;
}

async function checkKey() {
  const client = await makeClient();
  if (!client) return { ok: false, message: "No key saved yet." };
  try {
    // Listing models costs nothing and proves the key works.
    await client.models.list({ limit: 1 });
    return { ok: true, message: "The key works." };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, message: "Anthropic didn't accept that key." };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, message: "Couldn't reach Anthropic. Check your internet connection." };
    return { ok: false, message: "Anthropic returned an error. Try again in a minute." };
  }
}

const etsy = new Etsy({ store, secrets, port });
const runtime = new Runtime({ store, budget, secrets, makeClient, etsy });
const scheduler = new Scheduler({ store, runtime });
const telegram = new Telegram({ store, secrets, runtime, budget });
const nightShift = new NightShift({ store, runtime });
const token = crypto.randomBytes(32).toString("base64url");

const server = createServer({ store, runtime, budget, secrets, telegram, etsy, nightShift, port, token, checkKey });

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\nPort ${port} is busy. Buddha Station may already be running. Close the other window first.\n`);
  } else {
    console.error("\nBuddha Station couldn't start:", err.message, "\n");
  }
  process.exit(1);
});

server.listen(port, "127.0.0.1", async () => {
  const url = `http://127.0.0.1:${port}/#t=${token}`;
  store.audit("station.started", { port });
  scheduler.start();
  await telegram.start();
  console.log("\n  Buddha Station is running.");
  console.log(`  Data folder: ${store.home}`);
  console.log(`  Inbox (drop files here for the crew): ${store.dir("inbox")}`);
  console.log(`  Outbox (finished work lands here): ${store.dir("outbox")}`);
  console.log("\n  Keep this window open. Close it, or press Ctrl+C, to shut the station down.\n");
  if (!process.argv.includes("--no-open")) {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? null : "xdg-open";
    if (opener) execFile(opener, [url], () => {});
  }
  console.log(`  If the browser didn't open, paste this into it:\n  ${url}\n`);
});

function shutdown() {
  console.log("\n  Shutting down. Stopping any work in progress...");
  runtime.stopAll("The station was shut down.");
  scheduler.stop();
  telegram.stop();
  nightShift.letSleep();
  store.audit("station.stopped");
  server.close();
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
