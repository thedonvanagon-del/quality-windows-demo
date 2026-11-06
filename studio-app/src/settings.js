// Business details the owner edits in the app (Admin → Settings). Stored as
// text; getSettings() hands back the defaults filled in and the numbers parsed.

export const FIELDS = [
  { key: 'studio_name', label: 'Studio name', type: 'text', default: 'Lumen Skin Studio', group: 'Your studio' },
  { key: 'tagline', label: 'Tagline (home page)', type: 'text', default: 'Calm, personalized skin care in a private home studio in Santa Barbara.', group: 'Your studio' },
  { key: 'esthetician_name', label: 'Your name', type: 'text', default: 'Your Esthetician', group: 'Your studio' },
  { key: 'bio', label: 'About you (shown on the home page)', type: 'textarea', default: 'Licensed esthetician. I treat every face like it belongs to a friend: a real conversation about your skin, a plan that fits your life, and products you will actually use. Write a few lines about your training, your approach, and what a visit feels like.', group: 'Your studio' },
  { key: 'public_area', label: 'Public location (neighborhood, no street address)', type: 'text', default: 'Santa Barbara, CA', group: 'Where you are' },
  { key: 'address', label: 'Street address (sent only to booked clients)', type: 'text', default: '', group: 'Where you are' },
  { key: 'arrival_notes', label: 'Arrival notes (parking, gate code, pets)', type: 'textarea', default: 'Street parking is easy. Come to the front door and ring the bell. Please arrive on time, not early.', group: 'Where you are' },
  { key: 'phone', label: 'Text / phone', type: 'text', default: '', group: 'Contact' },
  { key: 'instagram', label: 'Instagram handle (no @)', type: 'text', default: '', group: 'Contact' },
  { key: 'min_notice_hours', label: 'Shortest notice for a booking (hours)', type: 'number', default: 12, min: 0, max: 720, group: 'Booking rules' },
  { key: 'max_advance_days', label: 'How far ahead people can book (days)', type: 'number', default: 60, min: 1, max: 365, group: 'Booking rules' },
  { key: 'cancel_window_hours', label: 'Free cancellation until (hours before)', type: 'number', default: 24, min: 0, max: 168, group: 'Booking rules' },
  { key: 'buffer_min', label: 'Cleanup time between clients (minutes)', type: 'number', default: 15, min: 0, max: 120, group: 'Booking rules' },
  { key: 'slot_step_min', label: 'Start times every (minutes)', type: 'number', default: 30, min: 5, max: 120, group: 'Booking rules' },
  { key: 'policies', label: 'Policies (shown on the Policies page)', type: 'textarea', group: 'Policies',
    default: [
      'Cancellations and changes: please give at least 24 hours. Inside that window, text me and I will do my best to move you. Late cancellations and no-shows may be charged half of the service price.',
      'Running late: I will hold your time as long as I can, but your treatment may need to be shortened so the next person is not kept waiting.',
      'Payment: due at your visit. Card, Venmo and cash all work.',
      'Pregnant or nursing? Many treatments are fine and some are not. Tell me when you book and I will steer you right.',
      'Please come with a clean, makeup-free face for facials and lash services. Skip retinoids and exfoliating acids for 3 days before a facial, and skip waxing areas you have recently exfoliated or sunburned.',
      'This is a private home studio. Please leave children and pets at home so you can fully relax.',
    ].join('\n\n') },
];

const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

export function getSettings(store) {
  const saved = new Map(store.all('SELECT key, value FROM settings').map((r) => [r.key, r.value]));
  const out = {};
  for (const f of FIELDS) {
    const raw = saved.has(f.key) ? saved.get(f.key) : f.default;
    out[f.key] = f.type === 'number' ? parseNumber(raw, f) : String(raw ?? '');
  }
  return out;
}

/** Validates a form body against FIELDS. Returns { values } or { error }. */
export function parseSettingsForm(body) {
  const values = {};
  for (const f of FIELDS) {
    const raw = String(body[f.key] ?? '').trim();
    if (f.type === 'number') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < f.min || n > f.max) return { error: `${f.label} must be a whole number from ${f.min} to ${f.max}.` };
      values[f.key] = String(n);
    } else {
      if (raw.length > 4000) return { error: `${f.label} is too long.` };
      values[f.key] = raw;
    }
  }
  return { values };
}

export function saveSettings(store, values) {
  store.tx(() => {
    for (const [key, value] of Object.entries(values)) {
      if (!BY_KEY.has(key)) continue;
      store.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
    }
  });
}

function parseNumber(raw, f) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : f.default;
}
