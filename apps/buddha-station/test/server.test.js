import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { setup } from "./helpers.js";
import { createServer } from "../src/server.js";
import { Telegram } from "../src/telegram.js";
import { Etsy } from "../src/etsy.js";
import { NightShift } from "../src/nightshift.js";

async function boot() {
  const ctx = setup();
  const port = 41000 + Math.floor(Math.random() * 2000);
  const token = "test-token-0123456789abcdefghijklmnopqrstuv";
  const telegram = new Telegram({ ...ctx, fetchImpl: async () => { throw new Error("no network in tests"); } });
  const etsy = new Etsy({ ...ctx, port });
  const nightShift = new NightShift({ ...ctx, platform: "linux" });
  const server = createServer({ ...ctx, telegram, etsy, nightShift, port, token, checkKey: async () => ({ ok: true }) });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const base = `http://127.0.0.1:${port}`;
  const call = (method, p, { body, headers = {}, auth = true } = {}) => fetch(base + p, {
    method,
    headers: { ...(auth && { "x-station-token": token }), ...(body !== undefined && { "content-type": "application/json" }), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { ...ctx, server, call, port, token };
}

test("the API needs the launch token", async (t) => {
  const s = await boot();
  t.after(() => s.server.close());
  assert.equal((await s.call("GET", "/api/state", { auth: false })).status, 401);
  assert.equal((await s.call("GET", "/api/state", { headers: { "x-station-token": "wrong" } })).status, 401);
  assert.equal((await s.call("GET", "/api/events", { auth: false })).status, 401);
  assert.equal((await s.call("GET", "/api/state")).status, 200);
});

test("other websites can't reach the API", async (t) => {
  const s = await boot();
  t.after(() => s.server.close());
  assert.equal((await s.call("GET", "/api/state", { headers: { origin: "https://evil.example" } })).status, 403);
  assert.equal((await s.call("GET", "/api/state", { headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  const form = await fetch(`http://127.0.0.1:${s.port}/api/stop-all`, {
    method: "POST", headers: { "x-station-token": s.token, "content-type": "application/x-www-form-urlencoded" }, body: "a=1",
  });
  assert.equal(form.status, 415);
});

test("the page is served with a strict security policy", async (t) => {
  const s = await boot();
  t.after(() => s.server.close());
  const res = await s.call("GET", "/", { auth: false });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal((await s.call("GET", "/../src/server.js", { auth: false })).status, 404);
});

test("state never includes secret values", async (t) => {
  const s = await boot();
  t.after(() => s.server.close());
  await s.call("POST", "/api/secrets/anthropic", { body: { value: "sk-ant-api03-SECRETVALUE-xyz9" } });
  const body = await (await s.call("GET", "/api/state")).text();
  assert.ok(!body.includes("SECRETVALUE"));
  assert.match(body, /…xyz9/);
  const audit = fs.readFileSync(path.join(s.home, "audit.log"), "utf8");
  assert.ok(!audit.includes("SECRETVALUE"));
});

test("station edits are cleaned up on the way in", async (t) => {
  const s = await boot();
  t.after(() => s.server.close());
  const station = structuredClone(s.store.station);
  const room = station.rooms[0];
  station.gear.push({ type: "terminal", room: room.id, x: room.x + 3, y: room.y + 3 });
  const res = await s.call("PUT", "/api/station", { body: station });
  const saved = await res.json();
  assert.ok(!saved.gear.some((g) => g.type === "terminal"));
});

test("outbox downloads stay in the outbox and can't run in the page", async (t) => {
  const s = await boot();
  t.after(() => s.server.close());
  fs.writeFileSync(path.join(s.store.dir("outbox"), "page.html"), "<script>alert(1)</script>");
  const ok = await s.call("GET", "/api/outbox/download?name=page.html");
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("content-disposition"), /^attachment/);
  assert.equal(ok.headers.get("content-type"), "application/octet-stream");
  assert.match(ok.headers.get("content-security-policy"), /sandbox/);
  const escape = await s.call("GET", "/api/outbox/download?name=../config.json");
  assert.equal(escape.status, 400);
});

test("the Etsy callback rejects a forged sign-in", async (t) => {
  const s = await boot();
  t.after(() => s.server.close());
  const res = await fetch(`http://localhost:${s.port}/etsy/callback?code=abc&state=forged`);
  assert.equal(res.status, 400);
  assert.match(await res.text(), /expired|didn't match/);
});
