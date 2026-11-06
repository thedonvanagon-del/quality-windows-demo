// A starter menu so the first boot is usable. Prices and durations are
// PLACEHOLDERS: the owner edits all of it under Admin → Services and Hours.
// Runs only when the services table is empty.

const SERVICES = [
  // Facials
  ['consultation', 'Skin Consultation', 'Facials', 'A relaxed chat and a close look at your skin, with a plan for what to book next. Great for first-timers.', '', 20, 0],
  ['hydradermabrasion', 'Hydradermabrasion Facial', 'Facials', 'Deep cleansing, gentle exfoliation and extractions with a hydrating serum infusion. Skin looks fresh and plump the same day, with no downtime.', 'Skip retinoids and exfoliating acids for 3 days before.', 60, 14000],
  ['microdermabrasion', 'Microdermabrasion Facial', 'Facials', 'Crystal-free diamond-tip polishing that lifts dullness and smooths rough texture, followed by a calming mask.', 'Skip retinoids and exfoliating acids for 3 days before.', 60, 12000],
  ['microneedling', 'Microneedling', 'Facials', 'Fine needling to encourage collagen and refine texture, paired with a nourishing serum. A series of 3 to 6 sessions gives the best results.', 'No retinoids for 5 days before. Not for anyone pregnant, on isotretinoin, or with active breakouts or cold sores. A health form is required.', 75, 25000],
  ['enzyme-peel', 'Enzyme Peel Facial', 'Facials', 'A fruit-enzyme peel that dissolves dead cells without the sting of an acid. Good for sensitive, dull or congested skin.', 'Skip retinoids and exfoliating acids for 3 days before.', 50, 11000],
  // Lashes
  ['lash-lift', 'Lash Lift', 'Lashes', 'Lifts and curls your natural lashes from the root for an open, wide-awake look that lasts 6 to 8 weeks.', 'Come with clean lashes, no mascara or extensions. Avoid water and steam for 24 hours after.', 60, 8500],
  ['lash-lift-tint', 'Lash Lift + Tint', 'Lashes', 'A lash lift plus a tint for darker, fuller-looking lashes. Mascara optional.', 'Come with clean lashes, no mascara or extensions. Avoid water and steam for 24 hours after.', 75, 10000],
  ['lash-tint', 'Lash Tint', 'Lashes', 'A quick tint for darker lashes without mascara.', 'Come with clean lashes, no mascara.', 20, 3000],
  // Waxing
  ['brow-wax', 'Brow Wax', 'Waxing', 'Clean, natural shaping to suit your face.', '', 20, 2500],
  ['lip-chin-wax', 'Lip or Chin Wax', 'Waxing', 'Quick and gentle.', '', 10, 1200],
  ['full-face-wax', 'Full Face Wax', 'Waxing', 'Brows, lip, chin and sides of the face.', '', 40, 6000],
  ['underarm-wax', 'Underarm Wax', 'Waxing', '', '', 15, 2500],
  ['bikini-wax', 'Bikini Wax', 'Waxing', '', 'Hair should be about a quarter inch long: the length of a grain of rice.', 30, 5000],
  ['brazilian-wax', 'Brazilian Wax', 'Waxing', '', 'Hair should be about a quarter inch long: the length of a grain of rice.', 45, 8000],
  ['half-leg-wax', 'Half Leg Wax', 'Waxing', '', '', 30, 5000],
  ['full-leg-wax', 'Full Leg Wax', 'Waxing', '', '', 60, 8500],
];

const ADDONS = [
  ['Brow wax', 'Facials', 15, 2000],
  ['Lip wax', 'Facials', 10, 1000],
  ['LED light therapy', 'Facials', 15, 2000],
  ['Lip treatment', 'Facials', 10, 1500],
  ['Brow wax', 'Lashes', 15, 2000],
];

// Tuesday to Friday 10-5, Saturday 9-2. (0 = Sunday.)
const HOURS = [[2, 600, 1020], [3, 600, 1020], [4, 600, 1020], [5, 600, 1020], [6, 540, 840]];

export function seedIfEmpty(store) {
  if (store.get('SELECT 1 AS x FROM services LIMIT 1')) return false;
  store.tx(() => {
    SERVICES.forEach(([slug, name, category, description, prep, duration, price], i) => {
      store.run(
        'INSERT INTO services (slug, name, category, description, prep_note, duration_min, price_cents, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        slug, name, category, description, prep, duration, price, i,
      );
    });
    ADDONS.forEach(([name, appliesTo, duration, price], i) => {
      store.run('INSERT INTO addons (name, applies_to, duration_min, price_cents, sort) VALUES (?, ?, ?, ?, ?)', name, appliesTo, duration, price, i);
    });
    if (!store.get('SELECT 1 AS x FROM hours LIMIT 1')) {
      for (const [weekday, start, end] of HOURS) store.run('INSERT INTO hours (weekday, start_min, end_min) VALUES (?, ?, ?)', weekday, start, end);
    }
  });
  return true;
}

export const CATEGORY_ORDER = ['Facials', 'Lashes', 'Waxing'];
