// What a crew member costs. Prices are list prices in US dollars per million
// tokens. Your Anthropic invoice is the real number; this is the brake.

export const MODELS = {
  "claude-opus-5-5": { label: "Claude Opus 5.5 (smartest)", input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5 (half the price)", input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
};

// A refused request can be finished by a fallback model. These are the ones
// Anthropic may route to, so the meter still counts them right.
const FALLBACK_PRICES = {
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
};

// Anything we don't recognize is priced at the most expensive rate we know,
// so a surprise model can only make the meter run high, never low.
const UNKNOWN_MODEL = { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };

export const WEB_SEARCH_DOLLARS = 10 / 1000;

export const DEFAULT_MODEL = "claude-opus-5-5";

function priceFor(model) {
  return MODELS[model] ?? FALLBACK_PRICES[model] ?? UNKNOWN_MODEL;
}

export function costOf(model, usage) {
  if (!usage) return 0;
  const p = priceFor(model);
  const perToken = (rate) => rate / 1_000_000;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  return (
    (usage.input_tokens ?? 0) * perToken(p.input) +
    (usage.output_tokens ?? 0) * perToken(p.output) +
    (usage.cache_creation_input_tokens ?? 0) * perToken(p.cacheWrite) +
    (usage.cache_read_input_tokens ?? 0) * perToken(p.cacheRead) +
    searches * WEB_SEARCH_DOLLARS
  );
}

export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export class Budget {
  // store: { readSpend(), writeSpend(obj) }, getConfig: () => config
  constructor(store, getConfig, now = () => new Date()) {
    this.store = store;
    this.getConfig = getConfig;
    this.now = now;
    this.spend = store.readSpend();
  }

  spentToday() {
    return this.spend.days?.[dayKey(this.now())] ?? 0;
  }

  remainingToday() {
    return Math.max(0, this.getConfig().dailyCapUsd - this.spentToday());
  }

  record(dollars) {
    if (!(dollars > 0)) return;
    const key = dayKey(this.now());
    this.spend.days ??= {};
    this.spend.days[key] = (this.spend.days[key] ?? 0) + dollars;
    // Keep 90 days of history. Enough for a monthly look, small enough to read.
    const keys = Object.keys(this.spend.days).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - 90))) delete this.spend.days[old];
    this.store.writeSpend(this.spend);
  }

  history() {
    return this.spend.days ?? {};
  }
}
