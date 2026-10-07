import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/store.js";
import { Budget } from "../src/budget.js";
import { makeSecrets } from "../src/secrets.js";
import { Runtime } from "../src/runtime.js";

export function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "buddha-station-test-"));
}

export function setup(overrides = {}) {
  const home = tempHome();
  const store = new Store(home);
  store.saveConfig({ ...store.config, ...overrides.config });
  const secrets = makeSecrets(home, { platform: "linux" });
  const budget = new Budget(store, () => store.config);
  const client = overrides.client ?? fakeClient([]);
  const runtime = new Runtime({ store, budget, secrets, makeClient: async () => client, etsy: overrides.etsy ?? null });
  const agent = (name) => store.station.agents.find((a) => a.name === name);
  return { home, store, secrets, budget, client, runtime, agent };
}

export function msg(content, stop_reason = "end_turn", usage = { input_tokens: 1000, output_tokens: 200 }) {
  return { model: "claude-opus-5-5", content, stop_reason, usage, container: null };
}

export const text = (t) => ({ type: "text", text: t });
export const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });

// Plays back canned responses and records every request it was sent.
export function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        stream(params, opts) {
          calls.push(structuredClone(params));
          const next = responses.shift();
          return {
            finalMessage: () => {
              if (typeof next === "function") return next(opts);
              if (next instanceof Error) return Promise.reject(next);
              if (!next) return Promise.reject(new Error("fake client ran out of responses"));
              return Promise.resolve(next);
            },
          };
        },
      },
    },
  };
}

export function finished(runtime, taskId) {
  return new Promise((resolve) => {
    const on = (task) => {
      if (task.id === taskId) {
        runtime.off("finished", on);
        resolve(task);
      }
    };
    runtime.on("finished", on);
  });
}
