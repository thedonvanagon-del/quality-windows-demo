// The objectionable-language filter (App Store guideline 1.2 asks apps with
// chat and profiles for "a method for filtering objectionable material").
// Pure functions, no state.
//
// Two lists. A SLUR (racial, ethnic, homophobic, transphobic, ableist) is
// refused everywhere. STRONG PROFANITY is masked in chat ("f***") and refused
// in names, bios and labels. Mild words that sports talk runs on (damn, hell,
// crap, sucks, ass, piss, bastard, dick, cock) are fine: "Dick Vitale",
// "Gamecocks" and "Hancock" have to get through.
//
// Matching works on whole words of normalized text (lowercase, NFKC, no
// zero-width characters or accents, look-alike letters and leetspeak read as
// letters, runs of 3+ repeated letters collapsed), so "Sh1iiit" is caught but
// "Scunthorpe", "assist" and "Matsushita" aren't. Only the strongest terms
// (STRONGEST) are also caught inside a longer word ("xXfuckXx") and spelled
// out with gaps ("f u c k", "f.u.c.k").
//
// To extend: add the word, lowercase and in plain letters, to SLURS or
// PROFANITY. A plural in -s (or -es after ch/sh/s/x/z, -ies for -y) is
// matched on its own; list other forms (-ing, -ed, compounds) yourself. Put a
// stem in STRONGEST only if no ordinary word contains it, or add the ordinary
// words to INSIDE_OK. If a real phrase trips a slur ("Van Dyke"), add it to
// SAFE_PHRASES. Then add a test for the catch and one for the near miss.

const SLURS = new Set([
  // racial and ethnic
  'nigger', 'nigga', 'niggaz', 'niggah', 'nigguh', 'chink', 'gook', 'spic', 'spick', 'wetback', 'beaner',
  'kike', 'kyke', 'raghead', 'towelhead', 'paki', 'jap', 'wop', 'dago', 'polack', 'chinaman', 'chinamen',
  'zipperhead', 'injun', 'squaw', 'jigaboo', 'golliwog',
  // homophobic and transphobic
  'fag', 'faggot', 'faggy', 'dyke', 'lesbo', 'poofter', 'tranny', 'shemale',
  // ableist
  'retard', 'retarded', 'spaz', 'spazz', 'mongoloid',
]);

const PROFANITY = new Set([
  'fuck', 'fuk', 'fuks', 'fukin', 'fuking', 'fuker', 'fukker', 'fuked', 'fck', 'fcking', 'fckin', 'fcked', 'fcker',
  'fcuk', 'fcuking', 'phuck', 'phuk', 'phuking', 'fuq', 'fuqing', 'muthafuka', 'mothafuka',
  'cunt', 'cunty',
  'shit', 'shitty', 'shitting', 'shitted', 'shitter', 'shite', 'shitload', 'shithead', 'shithole', 'shitshow',
  'shitbag', 'shitstain', 'bullshit', 'horseshit', 'dipshit', 'chickenshit', 'batshit', 'apeshit', 'jackshit', 'dogshit',
  'bitch', 'bitchy', 'bitching', 'bitchin', 'bitchass', 'biatch', 'biotch', 'sonofabitch',
  'pussy', 'asshole', 'arsehole', 'asswipe', 'asshat', 'dickhead', 'cocksucker', 'cocksucking',
  'twat', 'wanker', 'whore', 'slut', 'slutty', 'jizz', 'dildo', 'blowjob',
]);

/** Caught inside longer words and spelled out with gaps, too. */
const STRONGEST = [
  ['nigger', 'slur'], ['nigga', 'slur'], ['faggot', 'slur'],
  ['fuck', 'profanity'], ['cunt', 'profanity'],
];

/** Ordinary words that contain a STRONGEST stem. */
const INSIDE_OK = /scunthorp|placunt|snigger|niggard/;

/** Real phrases with a listed word in them, on the plain lowercase words. */
const SAFE_PHRASES = [
  /\bspick? (?:and |n )?span\b/g,
  /\bvan dykes?\b/g,
  /\bchinks? in (?:the|their|his|her|its|our|your|my|that|this|an?) armou?r\b/g,
  /\bsquaw valley\b/g,
  /\bkike hernandez\b/g, // the Dodgers' Kiké Hernández
];

const LEET = { 0: 'o', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
// Cyrillic and Greek letters that pass for Latin ones.
const LOOKALIKE = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', к: 'k', ο: 'o', α: 'a', ι: 'i', κ: 'k', ε: 'e', ρ: 'p', ν: 'v', τ: 't' };

const INVISIBLE = /[\u00ad\u034f\u180e\u200b-\u200f\u2060-\u2064\ufeff]/g;
// A word: letters, digits, marks, the leetspeak symbols, and the invisible
// characters someone might hide inside one. Apostrophes split ("Dick's").
const WORD = /[\p{L}\p{N}\p{M}@$!*\u00ad\u034f\u180e\u200b-\u200f\u2060-\u2064\ufeff]+/gu;
const GAP = /^[\s._-]+$/;

export const CHAT_REFUSED = "That message has language that isn't allowed here.";
export const NAME_REFUSED = "Pick a different name. That one has language that isn't allowed.";

/** A word in plain lowercase letters: NFKC, no invisible characters, accents or look-alikes. */
function plain(word) {
  return word.normalize('NFKC').toLowerCase().replace(INVISIBLE, '')
    .normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
    .replace(/./gu, (c) => LOOKALIKE[c] ?? c);
}

/**
 * Every reading of one word to check: leetspeak mapped (1 as i and as l) when
 * the word has a letter in it, and runs of 3+ letters collapsed to one and to
 * two ("fuuuck" → "fuck", "fagggot" → "faggot").
 */
export function readings(word) {
  const base = plain(word).replace(/^!+|!+$/g, '');
  const leet = /\p{L}/u.test(base)
    ? ['i', 'l'].map((one) => base.replace(/[0-9@$!]/g, (c) => (c === '1' ? one : LEET[c] ?? c)))
    : [base];
  const out = new Set();
  for (const w of leet) {
    out.add(w.replace(/(\p{L})\1{2,}/gu, '$1'));
    out.add(w.replace(/(\p{L})\1{2,}/gu, '$1$1'));
  }
  return [...out];
}

/** The word and its singular, when it reads as a plural. */
function singulars(w) {
  const out = [w];
  if (w.endsWith('ies')) out.push(`${w.slice(0, -3)}y`);
  if (/(?:ch|sh|s|x|z)es$/.test(w)) out.push(w.slice(0, -2));
  if (w.endsWith('s')) out.push(w.slice(0, -1));
  return out;
}

/** 'slur', 'profanity' or null for one word. */
function classify(word) {
  let found = null;
  for (const w of readings(word)) {
    for (const s of singulars(w)) {
      if (SLURS.has(s)) return 'slur';
      if (PROFANITY.has(s)) found = 'profanity';
    }
    if (INSIDE_OK.test(w)) continue;
    for (const [stem, kind] of STRONGEST) {
      if (!w.includes(stem)) continue;
      if (kind === 'slur') return 'slur';
      found = 'profanity';
    }
  }
  return found;
}

/** The words of `text`, with where they are, camelCase parts split off too. */
function wordsOf(text) {
  const words = [];
  for (const m of text.matchAll(WORD)) {
    // "!" reads as an i inside a word ("sh!t"), not at either end ("damn!").
    const word = m[0].replace(/^!+|!+$/g, '');
    if (!word) continue;
    const start = m.index + m[0].match(/^!*/)[0].length;
    const parts = [];
    let at = start;
    for (const part of word.split(/(?<=\p{Ll})(?=\p{Lu})/u)) {
      parts.push({ text: part, start: at, end: at + part.length });
      at += part.length;
    }
    words.push({ text: word, start, end: start + word.length, parts: parts.length > 1 ? parts : [] });
  }
  return words;
}

/** Indexes of words inside a SAFE_PHRASE. */
function safeWords(words) {
  const safe = new Set();
  let line = '';
  const startOf = [];
  words.forEach((w, i) => {
    startOf[i] = line.length;
    line += `${plain(w.text)} `;
  });
  for (const re of SAFE_PHRASES) {
    for (const m of line.matchAll(re)) {
      words.forEach((_, i) => {
        if (startOf[i] >= m.index && startOf[i] < m.index + m[0].length) safe.add(i);
      });
    }
  }
  return safe;
}

/**
 * Everything objectionable in `text`: { slur, profanity, hits } where each
 * hit is { start, end, kind } in `text` (a spelled-out one also has `gaps`).
 */
export function scan(text) {
  text = String(text ?? '');
  const words = wordsOf(text);
  const safe = safeWords(words);
  const hits = [];
  words.forEach((w, i) => {
    if (safe.has(i)) return;
    const kind = classify(w.text);
    if (kind) return hits.push({ start: w.start, end: w.end, kind });
    for (const p of w.parts) {
      const part = classify(p.text);
      if (part) hits.push({ start: p.start, end: p.end, kind: part });
    }
  });
  hits.push(...spelledOut(text, words));
  return { slur: hits.some((h) => h.kind === 'slur'), profanity: hits.some((h) => h.kind === 'profanity'), hits };
}

/**
 * The strongest terms spelled a letter at a time with spaces, dots, dashes
 * or underscores between ("f u c k", "n.i.g.g.e.r", "f_u_c_k").
 */
function spelledOut(text, words) {
  const hits = [];
  let run = [];
  const flush = () => {
    if (run.length >= 3) {
      const letters = run.map((w) => w.letter).join('');
      for (const [stem, kind] of STRONGEST) {
        for (let at = letters.indexOf(stem); at !== -1; at = letters.indexOf(stem, at + 1)) {
          hits.push({ start: run[at].start, end: run[at + stem.length - 1].end, kind, gaps: true });
        }
      }
    }
    run = [];
  };
  for (const w of words) {
    const one = plain(w.text);
    const letter = [...one].length === 1 ? (LEET[one] ?? (one === '1' ? 'i' : one)) : null;
    if (!letter || !/\p{L}/u.test(letter)) {
      flush();
      continue;
    }
    const prev = run.at(-1);
    if (prev && !GAP.test(text.slice(prev.end, w.start))) flush();
    run.push({ letter, start: w.start, end: w.end });
  }
  flush();
  return hits;
}

/** Slurs or strong profanity anywhere in `text`: for names, bios and labels. */
export function hasBadLanguage(text) {
  const { slur, profanity } = scan(text);
  return slur || profanity;
}

/** `text` with each strong word masked after its first letter ("f***", "f * * *"). */
export function maskProfanity(text) {
  text = String(text ?? '');
  const hits = scan(text).hits.filter((h) => h.kind === 'profanity').sort((a, b) => b.start - a.start);
  let out = text;
  let lastStart = Infinity;
  for (const h of hits) {
    if (h.end > lastStart) continue; // overlaps one already masked
    const chars = [...out.slice(h.start, h.end)];
    const masked = chars.map((c, i) => (i === 0 || (h.gaps && /[\s._-]/.test(c)) ? c : '*')).join('');
    out = out.slice(0, h.start) + masked + out.slice(h.end);
    lastStart = h.start;
  }
  return out;
}

/** A chat message as it gets stored: { body } with strong words masked, or { error } for a slur. */
export function filterChat(text) {
  if (scan(text).slur) return { error: CHAT_REFUSED };
  return { body: maskProfanity(text) };
}
