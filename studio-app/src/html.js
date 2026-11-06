// Tiny HTML templating. Everything interpolated is escaped unless it came
// out of html`` itself or raw(). Pages never build markup by string-gluing.

const RAW = Symbol('raw');
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const raw = (s) => ({ [RAW]: true, s: String(s) });

const render = (v) => {
  if (v == null || v === false || v === true) return '';
  if (typeof v === 'object' && v[RAW]) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return String(v).replace(/[&<>"']/g, (c) => ESCAPES[c]);
};

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += render(values[i]) + strings[i + 1];
  return raw(out);
}

export const toString = (v) => render(v);

/** Plain text with blank-line paragraph breaks → <p> elements. */
export function paragraphs(text) {
  return html`${String(text ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => html`<p>${p}</p>`)}`;
}

export const money = (cents) => (cents === 0 ? 'Complimentary' : `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`);
