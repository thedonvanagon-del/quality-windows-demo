// Etsy, read-only. Crew can look at your shop, listings, orders and reviews.
// They can't change a price, publish a listing, message a buyer, or see who a
// buyer is. Customer names, emails, addresses and messages are stripped out
// here, before anything reaches the model.
//
// Sign-in uses Etsy's OAuth with PKCE: you approve access on etsy.com, and the
// station gets a token that only covers reading. You can revoke it from Etsy
// at any time.

import crypto from "node:crypto";

export const ETSY_SCOPES = ["listings_r", "transactions_r"];
const API = "https://api.etsy.com/v3";
const PENDING_TTL_MS = 10 * 60 * 1000;

export class EtsyError extends Error {}

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function money(price) {
  if (!price || typeof price.amount !== "number" || !price.divisor) return null;
  return `${(price.amount / price.divisor).toFixed(2)} ${price.currency_code ?? ""}`.trim();
}

const day = (seconds) => (seconds ? new Date(seconds * 1000).toISOString().slice(0, 10) : null);

export class Etsy {
  constructor({ store, secrets, port, fetchImpl = globalThis.fetch }) {
    this.store = store;
    this.secrets = secrets;
    this.port = port;
    this.fetch = fetchImpl;
    this.pending = null;
  }

  get redirectUri() {
    return `http://localhost:${this.port}/etsy/callback`;
  }

  status() {
    const e = this.store.config.etsy ?? {};
    return { connected: Boolean(e.shopId), shopName: e.shopName ?? null, redirectUri: this.redirectUri };
  }

  async apiKeyHeader() {
    const key = await this.secrets.get("etsy-key");
    const secret = await this.secrets.get("etsy-secret");
    if (!key || !secret) throw new EtsyError("Add your Etsy app keystring and shared secret in Settings first.");
    return `${key}:${secret}`;
  }

  // Step 1: build the etsy.com approval link. The verifier and state stay in
  // memory for ten minutes and work once.
  async beginConnect() {
    const key = await this.secrets.get("etsy-key");
    if (!key) throw new EtsyError("Add your Etsy app keystring first.");
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    const state = b64url(crypto.randomBytes(24));
    this.pending = { verifier, state, expires: Date.now() + PENDING_TTL_MS };
    const url = new URL("https://www.etsy.com/oauth/connect");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: key,
      redirect_uri: this.redirectUri,
      scope: ETSY_SCOPES.join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  }

  // Step 2: Etsy sends you back here with a one-time code.
  async finishConnect({ code, state }) {
    const pending = this.pending;
    this.pending = null;
    if (!pending || Date.now() > pending.expires) throw new EtsyError("That sign-in link expired. Start again from Settings.");
    const a = Buffer.from(String(state ?? ""));
    const b = Buffer.from(pending.state);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new EtsyError("That sign-in didn't match. Start again from Settings.");
    if (typeof code !== "string" || code.length > 2000) throw new EtsyError("Etsy didn't send a sign-in code.");
    const key = await this.secrets.get("etsy-key");
    const tokens = await this.tokenRequest({
      grant_type: "authorization_code",
      client_id: key,
      redirect_uri: this.redirectUri,
      code,
      code_verifier: pending.verifier,
    });
    await this.saveTokens(tokens);
    const me = await this.get("/application/users/me");
    if (!me.shop_id) throw new EtsyError("That Etsy account doesn't have a shop.");
    const shop = await this.get(`/application/shops/${Number(me.shop_id)}`);
    this.store.saveConfig({
      ...this.store.config,
      etsy: { ...(this.store.config.etsy ?? {}), shopId: Number(me.shop_id), shopName: String(shop.shop_name ?? "").slice(0, 80) },
    });
    this.store.audit("etsy.connected", { shop: shop.shop_name });
  }

  async disconnect() {
    await this.secrets.remove("etsy-access");
    await this.secrets.remove("etsy-refresh");
    const { etsy, ...rest } = this.store.config;
    this.store.saveConfig({ ...rest, etsy: { } });
    this.store.audit("etsy.disconnected");
  }

  async tokenRequest(form) {
    const res = await this.fetch(`${API}/public/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new EtsyError(`Etsy sign-in failed${body.error_description ? `: ${String(body.error_description).slice(0, 200)}` : "."}`);
    }
    return body;
  }

  async saveTokens(tokens) {
    await this.secrets.set("etsy-access", tokens.access_token);
    if (tokens.refresh_token) await this.secrets.set("etsy-refresh", tokens.refresh_token);
    const expiresAt = Date.now() + Math.max(60, Number(tokens.expires_in) || 3600) * 1000;
    this.store.saveConfig({ ...this.store.config, etsy: { ...(this.store.config.etsy ?? {}), expiresAt } });
  }

  async accessToken() {
    const e = this.store.config.etsy ?? {};
    let token = await this.secrets.get("etsy-access");
    if (token && e.expiresAt && Date.now() < e.expiresAt - 60_000) return token;
    const refresh = await this.secrets.get("etsy-refresh");
    if (!refresh) throw new EtsyError("Etsy isn't connected. Connect it in Settings.");
    const tokens = await this.tokenRequest({
      grant_type: "refresh_token",
      client_id: await this.secrets.get("etsy-key"),
      refresh_token: refresh,
    });
    await this.saveTokens(tokens);
    return tokens.access_token;
  }

  async get(pathname, query = {}) {
    const url = new URL(`${API}${pathname}`);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const res = await this.fetch(url, {
      headers: {
        "x-api-key": await this.apiKeyHeader(),
        authorization: `Bearer ${await this.accessToken()}`,
      },
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new EtsyError("Etsy turned down the sign-in. Reconnect Etsy in Settings.");
    if (res.status === 429) throw new EtsyError("Etsy says slow down. Try again in a minute.");
    if (!res.ok) throw new EtsyError(`Etsy returned an error (${res.status})${body.error ? `: ${String(body.error).slice(0, 200)}` : ""}.`);
    return body;
  }

  shopId() {
    const id = this.store.config.etsy?.shopId;
    if (!id) throw new EtsyError("Etsy isn't connected. Connect it in Settings.");
    return id;
  }

  // ---- What the crew can see. Every field is picked by hand. ----

  async shopOverview() {
    const s = await this.get(`/application/shops/${this.shopId()}`);
    return {
      shop_name: s.shop_name,
      title: s.title,
      currency: s.currency_code,
      active_listings: s.listing_active_count,
      favorites: s.num_favorers,
      review_average: s.review_average,
      review_count: s.review_count,
      announcement: s.announcement,
    };
  }

  async listings({ state = "active", limit = 25, offset = 0 } = {}) {
    const r = await this.get(`/application/shops/${this.shopId()}/listings`, { state, limit, offset });
    return {
      total: r.count,
      listings: (r.results ?? []).map((l) => ({
        listing_id: l.listing_id,
        title: l.title,
        state: l.state,
        price: money(l.price),
        quantity: l.quantity,
        views: l.views,
        favorites: l.num_favorers,
        tags: l.tags,
        url: l.url,
      })),
    };
  }

  async listing(listingId) {
    const l = await this.get(`/application/listings/${Number(listingId)}`);
    if (Number(l.shop_id) !== this.shopId()) throw new EtsyError("That listing isn't in your shop.");
    return {
      listing_id: l.listing_id,
      title: l.title,
      description: l.description,
      state: l.state,
      price: money(l.price),
      quantity: l.quantity,
      tags: l.tags,
      materials: l.materials,
      views: l.views,
      favorites: l.num_favorers,
      url: l.url,
    };
  }

  // Orders without the people. No names, emails, addresses or buyer notes.
  async recentOrders({ days = 30, limit = 25 } = {}) {
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    const r = await this.get(`/application/shops/${this.shopId()}/receipts`, { min_created: since, limit });
    return {
      total: r.count,
      orders: (r.results ?? []).map((o) => ({
        order_id: o.receipt_id,
        date: day(o.created_timestamp),
        status: o.status,
        paid: o.is_paid,
        shipped: o.is_shipped,
        total: money(o.grandtotal),
        items: (o.transactions ?? []).map((t) => ({ title: t.title, quantity: t.quantity, price: money(t.price), listing_id: t.listing_id })),
      })),
    };
  }

  async reviews({ limit = 25 } = {}) {
    const r = await this.get(`/application/shops/${this.shopId()}/reviews`, { limit });
    return {
      total: r.count,
      reviews: (r.results ?? []).map((v) => ({
        rating: v.rating,
        review: v.review,
        date: day(v.created_timestamp),
        listing_id: v.listing_id,
      })),
    };
  }
}
