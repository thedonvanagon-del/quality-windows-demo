// Night Shift: leave the station running and come back to finished work.
// On a Mac it keeps the computer awake (the built-in `caffeinate` tool) while
// the station is open. When you clock back in, it writes a shift report to the
// Outbox. Caps and every other limit stay exactly the same overnight.

import { spawn } from "node:child_process";
import { writeTextFile } from "./paths.js";

export class NightShift {
  constructor({ store, runtime, platform = process.platform }) {
    this.store = store;
    this.runtime = runtime;
    this.platform = platform;
    this.awake = null;
    this.log = [];
    runtime.on("finished", (task) => {
      if (this.store.config.nightShift) this.log.push(task);
    });
    if (this.store.config.nightShift) this.keepAwake();
  }

  keepAwake() {
    if (this.platform !== "darwin" || this.awake) return;
    // -i stops idle sleep; -w ties it to this process, so it ends when we do.
    this.awake = spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" });
    this.awake.on("error", () => (this.awake = null));
    this.awake.on("exit", () => (this.awake = null));
  }

  letSleep() {
    this.awake?.kill();
    this.awake = null;
  }

  async set(on) {
    const was = this.store.config.nightShift;
    this.store.saveConfig({ ...this.store.config, nightShift: Boolean(on) });
    this.store.audit(on ? "nightshift.on" : "nightshift.off");
    if (on && !was) {
      this.log = [];
      this.started = new Date();
      this.keepAwake();
      return null;
    }
    if (!on && was) {
      this.letSleep();
      return this.writeReport();
    }
    return null;
  }

  async writeReport() {
    const tasks = this.log;
    this.log = [];
    if (tasks.length === 0) return null;
    const total = tasks.reduce((sum, t) => sum + t.cost, 0);
    const lines = [
      "# Night Shift report",
      "",
      `Shift ended ${new Date().toLocaleString()}. ${tasks.length} job${tasks.length === 1 ? "" : "s"}, $${total.toFixed(2)} spent.`,
      "",
    ];
    for (const t of tasks) {
      lines.push(`## ${t.agentName}: ${t.status}`, "", `**Job:** ${t.text}`, "", `**Cost:** $${t.cost.toFixed(2)}`, "", t.result ?? "", "");
    }
    const name = `night-shift-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.md`;
    await writeTextFile(this.store.dir("outbox"), name, lines.join("\n"));
    return name;
  }
}
