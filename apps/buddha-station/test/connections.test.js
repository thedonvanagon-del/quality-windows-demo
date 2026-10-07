import test from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { Etsy, ETSY_SCOPES } from "../src/etsy.js";
import { Telegram } from "../src/telegram.js";

function etsyWith(responses) {
  const ctx = setup();
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const body = responses[u.pathname];
    return { ok: Boolean(body), status: body ? 200 : 404, json: async () => body ?? {} };
  };
  const etsy = new Etsy({ ...ctx, port: 4777, fetchImpl });
  return { ...ctx, etsy };
}

test("Etsy asks for read-only access with PKCE", async () => {
  const { etsy, secrets } = etsyWith({});
  await secrets.set("etsy-key", "keystring123");
  const url = new URL(await etsy.beginConnect());
  assert.equal(url.hostname, "www.etsy.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "listings_r transactions_r");
  assert.ok(ETSY_SCOPES.every((s) => s.endsWith("_r")), "every scope is read-only");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:4777/etsy/callback");
});

test("Etsy orders never include who the buyer is", async () => {
  const { etsy, secrets, store } = etsyWith({
    "/v3/application/shops/42/receipts": {
      count: 1,
      results: [{
        receipt_id: 7, created_timestamp: 1790000000, status: "paid", is_paid: true, is_shipped: false,
        grandtotal: { amount: 2400, divisor: 100, currency_code: "USD" },
        name: "Jane Buyer", first_line: "1 Main St", city: "Austin", zip: "78701",
        buyer_email: "jane@example.com", message_from_buyer: "call me at 555-0100",
        transactions: [{ title: "Ethiopia Yirgacheffe 12oz", quantity: 2, price: { amount: 1200, divisor: 100, currency_code: "USD" }, listing_id: 9 }],
      }],
    },
  });
  await secrets.set("etsy-key", "keystring123");
  await secrets.set("etsy-secret", "sharedsecret1");
  await secrets.set("etsy-access", "1.accesstoken");
  store.saveConfig({ ...store.config, etsy: { shopId: 42, expiresAt: Date.now() + 3_600_000 } });
  const out = JSON.stringify(await etsy.recentOrders());
  for (const pii of ["Jane", "Main St", "Austin", "78701", "jane@example.com", "555-0100"]) {
    assert.ok(!out.includes(pii), `${pii} leaked`);
  }
  assert.match(out, /Ethiopia Yirgacheffe/);
  assert.match(out, /24.00 USD/);
});

test("Etsy listings from another shop are refused", async () => {
  const { etsy, secrets, store } = etsyWith({ "/v3/application/listings/5": { listing_id: 5, shop_id: 999, title: "not yours" } });
  await secrets.set("etsy-key", "keystring123");
  await secrets.set("etsy-secret", "sharedsecret1");
  await secrets.set("etsy-access", "1.accesstoken");
  store.saveConfig({ ...store.config, etsy: { shopId: 42, expiresAt: Date.now() + 3_600_000 } });
  await assert.rejects(etsy.listing(5), /isn't in your shop/);
});

function telegramWith() {
  const ctx = setup();
  const sent = [];
  const tg = new Telegram({ ...ctx, fetchImpl: async (url, init) => {
    sent.push(JSON.parse(init.body));
    return { status: 200, json: async () => ({ ok: true, result: {} }) };
  } });
  return { ...ctx, tg, sent };
}

test("Telegram ignores everyone until paired, and only pairs with the code", async () => {
  const { tg, store, runtime } = telegramWith();
  let started = 0;
  runtime.startTask = () => { started++; return { id: "x" }; };
  await tg.handle("tok", { chat: { id: 1, type: "private" }, text: "/ask Sage hi" });
  const code = tg.beginPairing();
  await tg.handle("tok", { chat: { id: 2, type: "private" }, text: "000000" === code ? "111111" : "000000" });
  assert.equal(store.config.telegram.chatId, null);
  await tg.handle("tok", { chat: { id: 3, type: "group" }, text: code });
  assert.equal(store.config.telegram.chatId, null, "groups can't pair");
  await tg.handle("tok", { chat: { id: 4, type: "private" }, text: code });
  assert.equal(store.config.telegram.chatId, 4);
  await tg.handle("tok", { chat: { id: 5, type: "private" }, text: "/ask Sage hi" });
  assert.equal(started, 0, "strangers can't give orders");
  await tg.handle("tok", { chat: { id: 4, type: "private" }, text: "/ask Sage hi" });
  assert.equal(started, 1);
});

test("Telegram /stop stops everything", async () => {
  const { tg, store, runtime } = telegramWith();
  store.saveConfig({ ...store.config, telegram: { chatId: 9 } });
  let stopped = false;
  runtime.stopAll = () => { stopped = true; };
  await tg.handle("tok", { chat: { id: 9, type: "private" }, text: "/stop" });
  assert.equal(stopped, true);
});
