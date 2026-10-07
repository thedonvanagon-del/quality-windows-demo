// Talk to the crew from your phone through a Telegram bot you own.
//
// Locked to one chat: yours. Pairing needs a one-time code shown on the
// station screen, so someone who finds your bot can't take it over. From the
// phone you can give orders, check status and hit stop. You can't change
// gear, caps, keys or anything else in Settings.

import crypto from "node:crypto";

const API = "https://api.telegram.org";
const PAIR_TTL_MS = 10 * 60 * 1000;
const MAX_REPLY = 3500;

export class Telegram {
  constructor({ store, secrets, runtime, budget, fetchImpl = globalThis.fetch }) {
    this.store = store;
    this.secrets = secrets;
    this.runtime = runtime;
    this.budget = budget;
    this.fetch = fetchImpl;
    this.running = false;
    this.offset = 0;
    this.pairing = null;
    this.abort = null;
    runtime.on("finished", (task) => this.onFinished(task).catch(() => {}));
  }

  status() {
    return {
      paired: Boolean(this.store.config.telegram?.chatId),
      pairing: Boolean(this.pairing && Date.now() < this.pairing.expires),
      running: this.running,
    };
  }

  beginPairing() {
    // Six digits from a secure random source, good for ten minutes, once.
    this.pairing = { code: String(crypto.randomInt(100000, 1000000)), expires: Date.now() + PAIR_TTL_MS };
    return this.pairing.code;
  }

  async start() {
    if (this.running) return;
    const token = await this.secrets.get("telegram");
    if (!token) return;
    this.running = true;
    this.loop(token);
  }

  stop() {
    this.running = false;
    this.abort?.abort();
  }

  async unpair() {
    this.stop();
    await this.secrets.remove("telegram");
    this.store.saveConfig({ ...this.store.config, telegram: { chatId: null } });
    this.store.audit("telegram.unpaired");
  }

  async call(token, method, body) {
    this.abort = new AbortController();
    const res = await this.fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(40000)]),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(`Telegram ${method} failed (${res.status})`);
    return data.result;
  }

  async loop(token) {
    let backoff = 1000;
    while (this.running) {
      try {
        const updates = await this.call(token, "getUpdates", { offset: this.offset, timeout: 25, allowed_updates: ["message"] });
        backoff = 1000;
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handle(token, update.message).catch(() => {});
        }
      } catch (err) {
        if (!this.running) return;
        // Never log the error object itself: the request URL carries the token.
        this.store.audit("telegram.error", { message: String(err?.message ?? "error").replace(token, "[token]").slice(0, 120) });
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 60000);
      }
    }
  }

  send(token, chatId, text) {
    return this.call(token, "sendMessage", { chat_id: chatId, text: text.slice(0, MAX_REPLY) });
  }

  async handle(token, message) {
    if (!message?.chat || typeof message.text !== "string") return;
    const chatId = message.chat.id;
    const text = message.text.trim();
    const paired = this.store.config.telegram?.chatId;

    if (!paired) {
      const p = this.pairing;
      if (message.chat.type === "private" && p && Date.now() < p.expires && text === p.code) {
        this.pairing = null;
        this.store.saveConfig({ ...this.store.config, telegram: { chatId } });
        this.store.audit("telegram.paired");
        await this.send(token, chatId, "Paired. This chat is now the only one the station listens to. Send /help to see what you can do.");
      }
      return;
    }
    if (chatId !== paired) {
      this.store.audit("telegram.ignored", { reason: "message from an unpaired chat" });
      return;
    }

    const [command, ...rest] = text.split(/\s+/);
    const arg = rest.join(" ");
    const agents = this.store.station.agents;
    switch (command.toLowerCase().replace(/@.*$/, "")) {
      case "/help":
      case "/start":
        return this.send(token, chatId, [
          "/crew  who's on board",
          "/ask NAME job  give someone a job, e.g. /ask Sage draft a post about our new Ethiopian",
          "/status  what's running and today's spend",
          "/stop  stop everything right now",
        ].join("\n"));
      case "/crew":
        return this.send(token, chatId, agents.map((a) => `${a.name} (${a.class})`).join("\n") || "No crew yet.");
      case "/status": {
        const active = this.runtime.activeTasks();
        const lines = active.map((t) => `${t.agentName}: ${t.status} — ${t.text.slice(0, 60)}`);
        const cap = this.store.config.dailyCapUsd;
        lines.push(`Spent today: $${this.budget.spentToday().toFixed(2)} of $${cap.toFixed(2)}`);
        return this.send(token, chatId, lines.join("\n"));
      }
      case "/stop":
        this.runtime.stopAll("Stopped from Telegram.");
        this.store.audit("telegram.stop_all");
        return this.send(token, chatId, "Stopped everything.");
      case "/ask": {
        const [name, ...job] = arg.split(/\s+/);
        const agent = agents.find((a) => a.name.toLowerCase() === (name ?? "").toLowerCase());
        if (!agent) return this.send(token, chatId, `No crew member called ${name || "that"}. Try /crew.`);
        try {
          const task = this.runtime.startTask(agent.id, job.join(" "), { source: "telegram", chatId });
          this.store.audit("telegram.order", { agent: agent.name, task: task.id });
          return this.send(token, chatId, `${agent.name} is on it.`);
        } catch (err) {
          return this.send(token, chatId, String(err.message));
        }
      }
      default:
        return this.send(token, chatId, "I didn't catch that. Send /help.");
    }
  }

  async onFinished(task) {
    const chatId = this.store.config.telegram?.chatId;
    if (!chatId || !this.running) return;
    const fromPhone = task.source === "telegram" && task.chatId === chatId;
    const nightShift = this.store.config.nightShift && task.source !== "you";
    if (!fromPhone && !nightShift) return;
    const token = await this.secrets.get("telegram");
    if (!token) return;
    const head = `${task.agentName} ${task.status === "done" ? "finished" : task.status} ($${task.cost.toFixed(2)}):`;
    await this.send(token, chatId, `${head}\n\n${task.result ?? ""}`);
  }
}
