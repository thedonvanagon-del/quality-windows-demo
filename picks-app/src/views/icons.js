import { raw } from '../html.js';

// Line icons, drawn on a 24px grid in the text color.
const svg = (paths) =>
  raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`);

export const icons = {
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  games: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M10 10v10"/>'),
  picks: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  board: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>'),
  groups: svg('<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.3a5 5 0 0 1 5 4.7"/>'),
  me: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  line: svg('<path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/>'),
  more: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>'),
  live: svg('<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>'),
  grade: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),
};

// The "Trust Your Bets" mark: a white check on a gold tile. Gold in every theme.
export const trustMark = raw(`<svg class="trust-mark" viewBox="0 0 32 32" aria-hidden="true">
<defs><linearGradient id="trust-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd257"/><stop offset="1" stop-color="#d99a06"/></linearGradient></defs>
<rect width="32" height="32" rx="7" fill="url(#trust-gold)"/>
<path d="M8.5 16.5l5 5 10-11" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`);
