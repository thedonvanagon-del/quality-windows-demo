// Prize tournaments: an admin-made custom tournament with a sponsor's prize
// ("A bag of Buddha Beans coffee"). Still free to enter: no purchase or
// payment of any kind, and tournaments.entry_fee_cents stays 0 by its CHECK.
//
// Each one gets official rules at /tournaments/<slug>/rules, written from
// its fields and a standard template. Nobody but admins sees it until an
// admin records that a lawyer reviewed those rules (who and when) and then
// publishes it. Joining needs "I've read the official rules", stamped on
// the entry. After it closes, the admin page shows the winner with their
// account email and a "Mark prize sent" button.

export const DEFAULT_ELIGIBILITY = 'US residents 21+, void where prohibited';
export const FIELD_MAX = { prize: 140, sponsor: 80, eligibility: 200, delivery: 300 };
export const VALUE_MAX_DOLLARS = 5000;
/** How the winner is picked: always the tournament's own finish. */
export const WINNER_METHOD = 'The player in first place in the final standings when the tournament closes.';

/** A tournament's prize row, or null. */
export function prizeOf(store, t) {
  if (!t) return null;
  return store.get('SELECT * FROM prize_tournaments WHERE tournament_id = ?', t.id) ?? null;
}

/** Hidden from players: a prize tournament nobody has published yet. */
export const isDraftPrize = (prize) => Boolean(prize && !prize.published_at);

/** "$25", "$24.99" */
export function dollars(cents) {
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

const tidy = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Check a prize form: { prize, value (dollars, "25" or "24.99"), sponsor,
 * eligibility, delivery }. Returns the clean fields with value_cents, or { error }.
 */
export function checkPrize(form) {
  const out = {
    prize: tidy(form.prize),
    sponsor: tidy(form.sponsor),
    eligibility: tidy(form.eligibility) || DEFAULT_ELIGIBILITY,
    delivery: tidy(form.delivery),
  };
  for (const [key, max] of Object.entries(FIELD_MAX)) {
    if (!out[key]) return { error: `Fill in the ${key === 'delivery' ? 'delivery details' : key}.` };
    if (out[key].length > max) return { error: `Keep the ${key} to ${max} characters.` };
  }
  const raw = String(form.value ?? '').replace(/[$,\s]/g, '');
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(raw)) return { error: 'Give the prize value in dollars, like 25 or 24.99.' };
  const cents = Math.round(Number(raw) * 100);
  if (cents < 1 || cents > VALUE_MAX_DOLLARS * 100) return { error: `Keep the value from $0.01 to $${VALUE_MAX_DOLLARS.toLocaleString('en-US')}.` };
  return { ...out, value_cents: cents };
}

/**
 * Make a custom tournament a prize tournament, or change its prize. Only an
 * admin-made custom one (not the timer's, not player-made), before it starts
 * and with nobody in it yet, and never once it's published. Changing the
 * fields clears an earlier lawyer review: the rules changed.
 */
export function savePrize(store, t, form, { userId, now, playerMade = false }) {
  if (t.kind !== 'custom' || playerMade) return { error: 'Only a tournament an admin made can carry a prize.' };
  const existing = prizeOf(store, t);
  if (existing?.published_at) return { error: "It's published, so the prize and rules can't change." };
  if (now.toISOString() >= t.starts_at) return { error: "It's already started. Make a new tournament for a prize." };
  if (!existing && store.get('SELECT COUNT(*) AS n FROM tournament_entries WHERE tournament_id = ?', t.id).n) {
    return { error: 'Players are already in it. Make a new tournament for a prize, so everyone joins under the rules.' };
  }
  const clean = checkPrize(form);
  if (clean.error) return clean;
  const at = now.toISOString();
  if (!existing) {
    store.run(
      `INSERT INTO prize_tournaments (tournament_id, prize, value_cents, sponsor, eligibility, delivery, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id, clean.prize, clean.value_cents, clean.sponsor, clean.eligibility, clean.delivery, userId, at, at,
    );
  } else {
    const changed = ['prize', 'value_cents', 'sponsor', 'eligibility', 'delivery'].some((k) => existing[k] !== clean[k]);
    store.run(
      `UPDATE prize_tournaments SET prize = ?, value_cents = ?, sponsor = ?, eligibility = ?, delivery = ?, updated_at = ?,
              reviewed_by = CASE WHEN ? THEN NULL ELSE reviewed_by END, reviewed_at = CASE WHEN ? THEN NULL ELSE reviewed_at END
        WHERE tournament_id = ?`,
      clean.prize, clean.value_cents, clean.sponsor, clean.eligibility, clean.delivery, at, changed ? 1 : 0, changed ? 1 : 0, t.id,
    );
  }
  store.run('UPDATE tournaments SET prize = ? WHERE id = ?', clean.prize, t.id);
  return { ok: true };
}

/** "A lawyer has reviewed these rules": who and when. Unticking clears it, until it's published. */
export function setReviewed(store, t, { reviewed, userId, now }) {
  const prize = prizeOf(store, t);
  if (!prize) return { error: "That isn't a prize tournament." };
  if (prize.published_at) return { error: "It's published; the review stays on the record." };
  store.run(
    'UPDATE prize_tournaments SET reviewed_by = ?, reviewed_at = ? WHERE tournament_id = ?',
    reviewed ? userId : null, reviewed ? now.toISOString() : null, t.id,
  );
  return { ok: true };
}

/** Publish: players can see it and join. Only after a recorded lawyer review. */
export function publishPrize(store, t, { userId, now }) {
  const prize = prizeOf(store, t);
  if (!prize) return { error: "That isn't a prize tournament." };
  if (!prize.reviewed_at) return { error: 'Record the lawyer review of the rules first.' };
  if (t.canceled_at) return { error: 'It was canceled.' };
  store.run('UPDATE prize_tournaments SET published_by = COALESCE(published_by, ?), published_at = COALESCE(published_at, ?) WHERE tournament_id = ?', userId, now.toISOString(), t.id);
  return { ok: true };
}

/** The winner of a closed prize tournament, with their account email for delivery: { id, screen_name, email, units, record } or null. */
export function prizeWinner(store, t) {
  if (!t.closed_at) return null;
  return store.get(
    `SELECT u.id, u.screen_name, u.email, r.units, r.record, e.rules_accepted_at FROM tournament_results r JOIN users u ON u.id = r.user_id
       LEFT JOIN tournament_entries e ON e.tournament_id = r.tournament_id AND e.user_id = r.user_id
      WHERE r.tournament_id = ? AND r.place = 1`,
    t.id,
  ) ?? null;
}

/** "Mark prize sent", once, after it's closed and has a winner. */
export function markPrizeSent(store, t, { userId, now }) {
  if (!prizeOf(store, t)) return { error: "That isn't a prize tournament." };
  if (!prizeWinner(store, t)) return { error: 'There is no winner yet.' };
  const { changes } = store.run('UPDATE prize_tournaments SET sent_by = ?, sent_at = ? WHERE tournament_id = ? AND sent_at IS NULL', userId, now.toISOString(), t.id);
  return changes ? { ok: true } : { error: 'Already marked sent.' };
}

/** Who did what on a prize (screen names for the admin page). */
export function prizeAudit(store, prize) {
  const name = (id) => (id ? store.get('SELECT screen_name, email FROM users WHERE id = ?', id) ?? null : null);
  return { reviewer: name(prize.reviewed_by), publisher: name(prize.published_by), sender: name(prize.sent_by) };
}
