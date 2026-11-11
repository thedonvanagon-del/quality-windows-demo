// The health questionnaire and treatment consent. Filled in once, before a
// first visit, and kept with the client. It never blocks a booking silently:
// anything worth a conversation shows up as a flag on the owner's schedule.

export const CONDITIONS = [
  'Eczema or psoriasis',
  'Rosacea',
  'Active cold sores or breakouts',
  'Keloid or raised scarring',
  'Autoimmune condition',
  'Diabetes',
  'History of skin cancer',
  'Blood thinners',
  'Pacemaker or implanted device',
];

export function hasIntake(store, userId) {
  return Boolean(store.get('SELECT 1 AS x FROM intake WHERE user_id = ?', userId));
}

export function getIntake(store, userId) {
  const row = store.get('SELECT * FROM intake WHERE user_id = ?', userId);
  return row ? { answers: JSON.parse(row.answers), signedName: row.signed_name, signedAt: row.signed_at } : null;
}

/** Validates the form. Returns { answers, signedName } or { error }. */
export function parseIntake(body) {
  const pick = (v, allowed) => (allowed.includes(v) ? v : null);
  const pregnant = pick(body.pregnant, ['no', 'yes', 'unsure']);
  const isotretinoin = pick(body.isotretinoin, ['no', 'yes']);
  if (!pregnant || !isotretinoin) return { error: 'Please answer the pregnancy and Accutane questions.' };
  const conditions = [body.conditions ?? []].flat().filter((c) => CONDITIONS.includes(c));
  const text = (k, max = 600) => String(body[k] ?? '').trim().slice(0, max);
  const signedName = text('signed_name', 120);
  if (!body.consent) return { error: 'Please check the box to agree to the consent.' };
  if (signedName.length < 2) return { error: 'Please type your full name to sign.' };
  return {
    answers: { pregnant, isotretinoin, conditions, allergies: text('allergies'), medications: text('medications'), goals: text('goals') },
    signedName,
  };
}

export function saveIntake(store, userId, { answers, signedName }, now = new Date()) {
  store.run(
    `INSERT INTO intake (user_id, answers, signed_name, signed_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET answers = excluded.answers, signed_name = excluded.signed_name, signed_at = excluded.signed_at`,
    userId, JSON.stringify(answers), signedName, now.toISOString(),
  );
}

/** Short heads-ups for the owner, e.g. "Pregnant or nursing". */
export function flagsFor(intake) {
  if (!intake) return ['No health form yet'];
  const a = intake.answers;
  const flags = [];
  if (a.pregnant === 'yes') flags.push('Pregnant or nursing');
  if (a.pregnant === 'unsure') flags.push('Might be pregnant');
  if (a.isotretinoin === 'yes') flags.push('Accutane in the last 6 months');
  for (const c of a.conditions ?? []) flags.push(c);
  if (a.allergies) flags.push(`Allergies: ${a.allergies}`);
  return flags;
}
