import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tempHome } from "./helpers.js";
import { resolveInside, cleanFileName, PathError, writeTextFile } from "../src/paths.js";
import { costOf, Budget, dayKey } from "../src/budget.js";
import { sanitizeStation, starterStation, handoffTargets, capabilitiesFor } from "../src/layout.js";
import { isDue, sanitizeSchedules } from "../src/scheduler.js";
import { makeSecrets, checkValue, SecretError } from "../src/secrets.js";
import { sanitizeConfig, DEFAULT_CONFIG } from "../src/store.js";

test("resolveInside keeps paths in their folder", async () => {
  const root = tempHome();
  assert.equal(await resolveInside(root, "a/b.md"), path.join(fs.realpathSync(root), "a", "b.md"));
  for (const bad of ["../x.md", "/abs.md", "~/x.md", ".hidden.md", "a/./../../x", "", "a\0b.md", "a/b/c/d/e/f/g.md"]) {
    await assert.rejects(resolveInside(root, bad), PathError, bad);
  }
});

test("writes refuse executable and unknown file types", async () => {
  const root = tempHome();
  for (const name of ["x.command", "x.sh", "x.app", "x.js", "x.pkg", "x", "x.scpt"]) {
    await assert.rejects(writeTextFile(root, name, "x"), PathError, name);
  }
  await writeTextFile(root, "ok.md", "fine");
  assert.equal(fs.readFileSync(path.join(root, "ok.md"), "utf8"), "fine");
});

test("cleanFileName flattens names", () => {
  assert.equal(cleanFileName("../../etc/notes.md"), "notes.md");
  assert.equal(cleanFileName(".bashrc.txt"), "bashrc.txt");
  assert.throws(() => cleanFileName("evil.command"), PathError);
});

test("costOf prices tokens, cache and searches", () => {
  const cost = costOf("claude-opus-5-5", {
    input_tokens: 1_000_000, output_tokens: 1_000_000,
    cache_creation_input_tokens: 0, cache_read_input_tokens: 1_000_000,
    server_tool_use: { web_search_requests: 10 },
  });
  assert.equal(Math.round(cost * 100) / 100, 4 + 20 + 0.2 + 0.1);
  // Unknown models are priced high, never low.
  assert.ok(costOf("mystery-model", { input_tokens: 1_000_000, output_tokens: 0 }) >= 5);
});

test("budget tracks today and rolls over", () => {
  let now = new Date(2026, 9, 7, 10);
  const saved = {};
  const store = { readSpend: () => ({ days: {} }), writeSpend: (s) => Object.assign(saved, s) };
  const budget = new Budget(store, () => ({ dailyCapUsd: 2 }), () => now);
  budget.record(1.5);
  assert.equal(budget.remainingToday(), 0.5);
  now = new Date(2026, 9, 8, 9);
  assert.equal(budget.spentToday(), 0);
  assert.equal(budget.remainingToday(), 2);
  assert.equal(dayKey(new Date(2026, 0, 5)), "2026-01-05");
});

test("sanitizeStation drops anything it doesn't recognize", () => {
  const s = starterStation();
  const room = s.rooms[0];
  const dirty = {
    ...s,
    rooms: [...s.rooms, { ...room, id: "aaaaaaaaaaaa" }, { id: "bbbbbbbbbbbb", name: "<script>", x: 99, y: 99, w: 1, h: 1 }],
    gear: [...s.gear, { type: "terminal", room: room.id, x: room.x + 2, y: room.y + 2 }, { type: "cabinet", room: "nope", x: 0, y: 0 }],
    agents: [...s.agents, { name: "Sage", class: "writer", room: room.id }, { name: "Root", class: "admin", room: room.id, model: "gpt-9" }],
    evil: true,
  };
  const clean = sanitizeStation(dirty);
  // The overlapping copy is dropped; the off-grid one is pulled back onto the grid.
  assert.equal(clean.rooms.length, s.rooms.length + 1);
  assert.ok(!clean.rooms.some((r) => r.id === "aaaaaaaaaaaa"));
  assert.ok(clean.rooms.every((r) => r.x + r.w <= 32 && r.y + r.h <= 20 && r.w >= 4 && r.h >= 3));
  assert.ok(!clean.gear.some((g) => g.type === "terminal"));
  assert.equal(clean.agents.filter((a) => a.name === "Sage").length, 1, "duplicate names are dropped");
  const root = clean.agents.find((a) => a.name === "Root");
  assert.equal(root.class, "generalist");
  assert.equal(root.model, "claude-opus-5-5");
  assert.equal(clean.evil, undefined);
});

test("no gear means no capabilities, and no hatch means no hand-offs", () => {
  const s = starterStation();
  const sage = s.agents.find((a) => a.name === "Sage");
  const bare = { ...s, gear: s.gear.filter((g) => g.room !== sage.room) };
  assert.equal(capabilitiesFor(bare, sage).grants.size, 0);
  assert.deepEqual(handoffTargets(bare, sage), []);
  assert.deepEqual(handoffTargets(s, sage).map((a) => a.name).sort(), ["Scout", "Tally"]);
});

test("schedules fire once in their window and skip missed runs", () => {
  const s = { enabled: true, kind: "daily", time: "08:00", lastRunAt: null };
  assert.equal(isDue(s, new Date(2026, 9, 7, 7, 59)), false);
  assert.equal(isDue(s, new Date(2026, 9, 7, 8, 5)), true);
  assert.equal(isDue({ ...s, lastRunAt: new Date(2026, 9, 7, 8, 1).toISOString() }, new Date(2026, 9, 7, 8, 5)), false);
  assert.equal(isDue(s, new Date(2026, 9, 7, 11, 0)), false, "too late: skipped, not piled up");
  const weekday = { ...s, kind: "weekdays" };
  assert.equal(isDue(weekday, new Date(2026, 9, 10, 8, 5)), false, "Saturday");
  const every = { enabled: true, kind: "every", everyHours: 6, lastRunAt: new Date(2026, 9, 7, 1).toISOString() };
  assert.equal(isDue(every, new Date(2026, 9, 7, 6, 59)), false);
  assert.equal(isDue(every, new Date(2026, 9, 7, 7, 0)), true);
  assert.equal(isDue({ ...s, enabled: false }, new Date(2026, 9, 7, 8, 5)), false);
  const weekly = { ...s, kind: "weekly", day: 1 };
  assert.equal(isDue(weekly, new Date(2026, 9, 5, 8, 5)), true, "Monday");
  assert.equal(isDue(weekly, new Date(2026, 9, 6, 8, 5)), false, "Tuesday");
});

test("sanitizeSchedules keeps only valid jobs for real crew", () => {
  const agents = [{ id: "aaaaaaaaaaaa" }];
  const out = sanitizeSchedules([
    { agentId: "aaaaaaaaaaaa", kind: "daily", time: "08:00", task: "go" },
    { agentId: "bbbbbbbbbbbb", kind: "daily", time: "08:00", task: "nobody" },
    { agentId: "aaaaaaaaaaaa", kind: "daily", time: "25:00", task: "bad time" },
    { agentId: "aaaaaaaaaaaa", kind: "every", everyHours: 0, task: "too often" },
    { agentId: "aaaaaaaaaaaa", kind: "cron", task: "unknown" },
    { agentId: "aaaaaaaaaaaa", kind: "weekly", time: "08:00", day: 7, task: "no such day" },
    { agentId: "aaaaaaaaaaaa", kind: "weekly", time: "08:00", day: 1, task: "mondays" },
  ], agents);
  assert.equal(out.length, 2);
});

test("secrets: values that could break out of a command are refused", async () => {
  for (const bad of ['abc"def123', "abc def123", "abc\\def123", "short", "abc'def123"]) {
    assert.throws(() => checkValue(bad), SecretError, bad);
  }
  const home = tempHome();
  const secrets = makeSecrets(home, { platform: "linux" });
  await secrets.set("anthropic", "sk-ant-test-1234567890");
  assert.equal(await secrets.get("anthropic"), "sk-ant-test-1234567890");
  const mode = fs.statSync(path.join(home, "secrets", "anthropic")).mode & 0o777;
  assert.equal(mode, 0o600);
  await secrets.remove("anthropic");
  assert.equal(await secrets.get("anthropic"), null);
});

test("config limits are clamped", () => {
  const c = sanitizeConfig({ dailyCapUsd: -5, taskCapUsd: 9999, maxSteps: 1000, allowedDomains: ["https://Etsy.com/shop", "not a domain", "localhost"] }, DEFAULT_CONFIG);
  assert.equal(c.dailyCapUsd, 0);
  assert.equal(c.taskCapUsd, 50);
  assert.equal(c.maxSteps, 60);
  assert.deepEqual(c.allowedDomains, ["etsy.com"]);
});
