// Small touches on top of pages that work without it.

// Show game times in the viewer's own time zone. The server writes Eastern.
const short = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const long = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function localTimes(root) {
  for (const el of root.querySelectorAll('time[data-local]')) {
    const at = new Date(el.getAttribute('datetime'));
    if (!Number.isNaN(+at)) el.textContent = (el.dataset.local === 'long' ? long : short).format(at);
  }
}
localTimes(document);

// Get the app. Hidden once installed. Where the browser offers a real install
// prompt (Chrome, Edge, Android), the button and the install page use it.
const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
if (standalone) document.documentElement.classList.add('installed');
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  const now = document.querySelector('[data-install-now]');
  if (now) now.hidden = false;
});
window.addEventListener('appinstalled', () => document.documentElement.classList.add('installed'));
async function promptInstall(event) {
  if (!installPrompt) return;
  event.preventDefault();
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
}
// iPhone Safari can't install from a button, so Get the app opens a pop-up
// that points at Safari's own Share button instead of sending them away.
const iosInstall = document.querySelector('[data-ios-install]');
// Safari keeps Share in its bottom bar; Chrome, Edge and Firefox on iPhone keep
// it by the address bar at the top. Apps' built-in browsers can't add to the
// Home Screen at all, so they go to the install page instead.
const iosUa = navigator.userAgent;
const iosBrowser = !/iPhone|iPod/.test(iosUa) || /Instagram|FBAN|FBAV|TikTok|musical_ly|Snapchat|Twitter|LinkedInApp|GSA\//.test(iosUa)
  ? null
  : /CriOS|EdgiOS|FxiOS/.test(iosUa) ? 'chrome' : /Safari\//.test(iosUa) ? 'safari' : null;
function showIosInstall(event) {
  if (!iosInstall || !iosBrowser || standalone) return false;
  event.preventDefault();
  iosInstall.classList.toggle('top', iosBrowser === 'chrome');
  iosInstall.querySelector('.ios-arrow').textContent = iosBrowser === 'chrome' ? '↑' : '↓';
  for (const el of iosInstall.querySelectorAll('[data-where]')) el.hidden = el.dataset.where !== iosBrowser;
  iosInstall.hidden = false;
  return true;
}
iosInstall?.addEventListener('click', (event) => {
  if (event.target === iosInstall || event.target.closest('[data-ios-close]')) iosInstall.hidden = true;
});
for (const link of document.querySelectorAll('[data-get-app]')) {
  link.addEventListener('click', (event) => {
    if (!showIosInstall(event)) promptInstall(event);
  });
}
document.querySelector('[data-install-now]')?.addEventListener('click', promptInstall);
// The install page puts the viewer's own device first, with the steps for the
// browser they're in. Apps' built-in browsers (Instagram, TikTok, Facebook...)
// can't install anything, so those get "open it in Safari/Chrome" first.
const ua = navigator.userAgent;
const device = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
const inApp = [['Instagram', /Instagram/], ['Facebook', /FBAN|FBAV|FB_IAB/], ['TikTok', /TikTok|musical_ly|BytedanceWebview/], ['Snapchat', /Snapchat/], ['X', /Twitter/], ['LinkedIn', /LinkedInApp/], ['Google', /GSA\//]].find(([, re]) => re.test(ua))?.[0];
document.querySelector(`.install-card[data-device="${device}"]`)?.classList.add('mine');
if (device === 'ios' && /CriOS|FxiOS|EdgiOS/.test(ua)) {
  document.querySelector('[data-ios="safari"]')?.setAttribute('hidden', '');
  document.querySelector('[data-ios="other"]')?.removeAttribute('hidden');
}
const inAppNote = document.querySelector('[data-inapp-note]');
if (inAppNote && inApp && device !== 'desktop') {
  inAppNote.hidden = false;
  inAppNote.querySelector('[data-inapp-name]').textContent = `${inApp}'s built-in browser`;
  for (const el of inAppNote.querySelectorAll('[data-browser-name]')) el.textContent = device === 'ios' ? 'Safari' : 'Chrome';
}

// On a phone that hasn't installed the app, a small bar offers it once.
// "Not now" hides it for good on that phone.
const banner = document.querySelector('[data-app-banner]');
if (banner && !standalone && device !== 'desktop') {
  let dismissed = false;
  try {
    dismissed = localStorage.getItem('bb-app-banner') === 'no';
  } catch {
    // Private browsing: show it.
  }
  if (!dismissed) banner.hidden = false;
  banner.querySelector('[data-banner-close]').addEventListener('click', () => {
    banner.hidden = true;
    try {
      localStorage.setItem('bb-app-banner', 'no');
    } catch {
      // Nowhere to remember it; it'll show again next time.
    }
  });
}

// After a pick the board comes back at the game that was picked (#g-...), not
// the top. Move the LOCKED ticket (or an error) next to that game so it's seen.
const pickedCard = window.location.hash.startsWith('#g-') && document.getElementById(window.location.hash.slice(1));
if (pickedCard) {
  const notice = document.querySelector('.locked-ticket, main .flash');
  if (notice) pickedCard.before(notice);
  (notice ?? pickedCard).scrollIntoView({ block: 'start' });
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

// Ask before anything that can't be undone.
for (const form of document.querySelectorAll('form[data-confirm]')) {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
}

// Keep "to win" on the pick slip in step with the units. A parlay's form
// carries its exact decimal price too, so "to win" matches what it pays.
function initSlip(slip) {
  const odds = Number(slip.dataset.odds);
  const decimal = Number(slip.dataset.decimal);
  const input = slip.querySelector('input[name="units"]');
  const chips = slip.querySelector('.chips');
  const update = () => {
    const units = Number(input.value.replace(/[u,\s]/gi, ''));
    const ok = Number.isFinite(units) && units > 0;
    const raw = decimal ? units * (decimal - 1) : odds > 0 ? (units * odds) / 100 : (units * 100) / -odds;
    const win = ok ? Math.round(raw * 100) / 100 : 0;
    slip.querySelector('[data-to-win]').textContent = ok ? `${win}u` : '–';
    for (const chip of chips.querySelectorAll('.chip')) chip.classList.toggle('on', Number(chip.dataset.units) === units);
  };
  chips.hidden = false;
  chips.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    input.value = chip.dataset.units;
    update();
  });
  input.addEventListener('input', update);
  update();
}
const pageSlip = document.querySelector('form[data-odds]');
if (pageSlip) initSlip(pageSlip);

// "Lock it in" (or "Add to parlay", or "Lock parlay") says it's working the
// moment it's tapped, and the form can't be sent twice.
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!form.matches('form[action="/picks"], form[action="/parlays"]')) return;
  if (form.dataset.sending) {
    event.preventDefault();
    return;
  }
  form.dataset.sending = '1';
  const button = event.submitter?.dataset.busy ? event.submitter : form.querySelector('button[data-busy]');
  if (button) {
    button.dataset.label = button.textContent;
    button.textContent = button.dataset.busy;
    button.classList.add('busy');
  }
});
// Coming back to a page from the phone's back button shouldn't leave it stuck on "Locking…".
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  for (const form of document.querySelectorAll('form[data-sending]')) {
    delete form.dataset.sending;
    for (const button of form.querySelectorAll('button[data-label]')) {
      button.textContent = button.dataset.label;
      button.classList.remove('busy');
    }
  }
});

// On the games board, a tapped line opens its slip in a sheet that slides up
// over the board instead of a new page. A BB Pick chip opens the model's picks
// the same way. Anything off and it's a normal link.
const board = document.querySelector('.event') && window.HTMLDialogElement && window.DOMParser;
if (board) {
  const sheet = document.createElement('dialog');
  sheet.className = 'sheet';
  sheet.setAttribute('aria-label', 'Pick slip');
  document.body.append(sheet);
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet || event.target.closest('[data-close]')) sheet.close();
  });
  // The sheet opens the moment a line is tapped, with a loading note, so a
  // slow connection never looks like a dead tap. A second tap while one is
  // loading is ignored.
  let loading = null;
  const loadingNote = () => {
    const note = document.createElement('p');
    note.className = 'sheet-loading';
    note.textContent = 'Loading the line…';
    return note;
  };
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('a.cell[href^="/pick?"], a.bb-chip');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (loading) return;
    loading = link;
    link.classList.add('loading');
    sheet.setAttribute('aria-label', link.dataset.sheet ?? 'Pick slip');
    try {
      sheet.replaceChildren(loadingNote());
      if (!sheet.open) sheet.showModal();
      const res = await fetch(link.href, { credentials: 'same-origin', headers: { accept: 'text/html' } });
      if (!res.ok || res.redirected) throw new Error('no slip');
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const slip = doc.querySelector('.slip');
      if (!slip) throw new Error('no slip');
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'sheet-close';
      close.dataset.close = '';
      close.setAttribute('aria-label', 'Close');
      close.textContent = '×';
      sheet.replaceChildren(close, document.adoptNode(slip));
      const form = sheet.querySelector('form[data-odds]');
      if (form) initSlip(form);
      localTimes(sheet);
      if (!sheet.open) sheet.showModal();
    } catch {
      window.location.href = link.href;
    } finally {
      loading = null;
      link.classList.remove('loading');
    }
  });
}

// Share a profile: the phone's share sheet where there is one, else copy the link.
for (const button of document.querySelectorAll('[data-share]')) {
  button.hidden = false;
  button.addEventListener('click', async () => {
    const url = button.dataset.share;
    if (navigator.share) {
      try {
        await navigator.share({ title: button.dataset.shareText, url });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      button.textContent = 'Link copied';
    } catch {
      button.textContent = url;
    }
  });
}

// Share the record card as a picture: drawn on a canvas in the page's own
// colors, then handed to the share sheet, or saved where there isn't one.
for (const button of document.querySelectorAll('[data-share-image]')) {
  const card = button.closest('.record-card');
  if (!card || !HTMLCanvasElement.prototype.toBlob) continue;
  button.hidden = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const blob = await drawCard(card.dataset);
      const name = `bookie-bullies-${card.dataset.name}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${card.dataset.name} on LockBox Picks` });
        } catch (err) {
          if (err.name !== 'AbortError') throw err;
        }
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      }
    } catch {
      button.textContent = "Couldn't make the image";
    } finally {
      button.disabled = false;
    }
  });
}

// Share a top-3 finish (a tournament, or a weekly contest) as a square picture,
// the same way: the share sheet where it takes files, else a download.
for (const button of document.querySelectorAll('[data-share-win]')) {
  if (!HTMLCanvasElement.prototype.toBlob) continue;
  button.hidden = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const blob = await drawWinCard(button.dataset);
      const name = `bookie-bullies-${button.dataset.place}-${button.dataset.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${button.dataset.place} in ${button.dataset.title}` });
        } catch (err) {
          if (err.name !== 'AbortError') throw err;
        }
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      }
    } catch {
      button.textContent = "Couldn't make the image";
    } finally {
      button.disabled = false;
    }
  });
}

/** Shrink a font until `text` fits `max` pixels wide. Leaves the font set on `c`. */
function fitText(c, text, weight, family, size, max, min = 36) {
  do {
    c.font = `${weight} ${size}px ${family}`;
    size -= 4;
  } while (size > min && c.measureText(text).width > max);
}

/**
 * The win card: 1080 square, in the page's own colors. The crest and name up
 * top, "1st in Hoops Night" big, the units and record, "Out of 24 players",
 * the date and the app's address.
 */
async function drawWinCard(d) {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const W = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = W;
  const c = canvas.getContext('2d');
  const cond = '"Barlow Condensed", "Arial Narrow", sans-serif';
  await Promise.all(['800 40px "Barlow Condensed"', '700 40px "Barlow Condensed"', '600 40px Barlow'].map((f) => document.fonts?.load(f).catch(() => {})));
  const gold = v('--gold') || '#ffd257';

  c.fillStyle = v('--bg');
  c.fillRect(0, 0, W, W);
  c.fillStyle = v('--accent');
  c.fillRect(0, 0, W, 14);
  c.fillRect(0, W - 14, W, 14);

  const crest = document.querySelector('.brand-logo');
  if (crest?.complete && crest.naturalWidth) c.drawImage(crest, 80, 80, 110, 110);
  c.fillStyle = v('--ink');
  c.font = `800 60px ${cond}`;
  c.fillText('LOCKBOX PICKS', 214, 142);
  c.fillStyle = gold;
  c.font = `800 32px ${cond}`;
  c.fillText('✓ TRUST YOUR BETS', 216, 184);

  // The place, huge, in gold, with the tournament under it.
  c.fillStyle = gold;
  c.font = `800 250px ${cond}`;
  c.fillText(d.place, 72, 470);
  c.fillStyle = v('--ink');
  fitText(c, `in ${d.title}`, 800, cond, 92, W - 160);
  c.fillText(`in ${d.title}`, 80, 572);

  // Who, with their photo when they have one.
  const face = d.photo ? await loadImage(d.photo).catch(() => null) : null;
  let x = 80;
  if (face) {
    c.save();
    c.beginPath();
    c.arc(122, 652, 42, 0, Math.PI * 2);
    c.clip();
    c.drawImage(face, 80, 610, 84, 84);
    c.restore();
    x = 184;
  }
  c.fillStyle = v('--muted');
  fitText(c, d.name, 700, cond, 52, W - x - 80);
  c.fillText(d.name, x, 670);

  // Units and record.
  const units = Number(d.units);
  const unitText = `${units > 0 ? '+' : ''}${units}u`;
  c.fillStyle = v('--card');
  c.fillRect(80, 724, W - 160, 150);
  c.fillStyle = units > 0 ? v('--win') : units < 0 ? v('--loss') : v('--ink');
  c.font = `800 112px ${cond}`;
  c.fillText(unitText, 112, 840);
  c.textAlign = 'right';
  c.fillStyle = v('--ink');
  c.font = `800 72px ${cond}`;
  c.fillText(d.record, W - 112, 822);
  c.fillStyle = v('--muted');
  c.font = `700 28px ${cond}`;
  c.fillText('RECORD', W - 112, 856);
  c.textAlign = 'left';

  c.fillStyle = v('--ink');
  c.font = `600 36px Barlow, sans-serif`;
  if (d.players) c.fillText(`Out of ${d.players} ${d.players === '1' ? 'player' : 'players'}`, 80, 940);
  c.fillStyle = v('--muted');
  fitText(c, `${d.date} · ${d.url}`, 600, 'Barlow, sans-serif', 30, W - 160, 18);
  c.fillText(`${d.date} · ${d.url}`, 80, 994);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}

async function drawCard(d) {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  const cond = '"Barlow Condensed", "Arial Narrow", sans-serif';
  await Promise.all(['800 40px "Barlow Condensed"', '700 40px "Barlow Condensed"', '600 40px Barlow'].map((f) => document.fonts?.load(f).catch(() => {})));

  c.fillStyle = v('--bg');
  c.fillRect(0, 0, W, H);
  c.fillStyle = v('--accent');
  c.fillRect(0, 0, W, 14);

  const crest = document.querySelector('.brand-logo');
  if (crest?.complete && crest.naturalWidth) c.drawImage(crest, 80, 84, 120, 120);
  c.fillStyle = v('--ink');
  c.font = `800 64px ${cond}`;
  c.fillText('LOCKBOX PICKS', 224, 150);
  c.fillStyle = v('--gold') || '#ffd257';
  c.font = `800 34px ${cond}`;
  c.fillText('✓ TRUST YOUR BETS', 226, 196);

  // The player's photo in a ring beside their name, when they have one.
  const face = d.photo ? await loadImage(d.photo).catch(() => null) : null;
  const nameX = face ? 240 : 80;
  if (face) {
    c.save();
    c.beginPath();
    c.arc(146, 316, 66, 0, Math.PI * 2);
    c.clip();
    c.drawImage(face, 80, 250, 132, 132);
    c.restore();
    c.strokeStyle = v('--accent');
    c.lineWidth = 6;
    c.beginPath();
    c.arc(146, 316, 66, 0, Math.PI * 2);
    c.stroke();
  }
  c.fillStyle = v('--ink');
  let nameSize = 96;
  do {
    c.font = `800 ${nameSize}px ${cond}`;
    nameSize -= 6;
  } while (nameSize > 48 && c.measureText(d.name).width > W - nameX - 80);
  c.fillText(d.name, nameX, 360);
  if (d.rank) {
    c.font = `800 40px ${cond}`;
    const label = `${d.rank} OVERALL`;
    const w = c.measureText(label).width + 32;
    c.fillStyle = v('--accent');
    c.fillRect(nameX, 392, w, 56);
    c.fillStyle = v('--accent-ink');
    c.fillText(label, nameX + 16, 434);
  }

  const units = Number(d.units);
  c.fillStyle = v('--muted');
  c.font = `700 34px ${cond}`;
  c.fillText('RECORD', 80, 540);
  c.textAlign = 'right';
  c.fillText('UNITS', W - 80, 540);
  const unitText = `${units > 0 ? '+' : ''}${units}u`;
  let size = 170;
  const fits = () => {
    c.font = `800 ${size}px ${cond}`;
    return c.measureText(d.record).width + c.measureText(unitText).width + 70 <= W - 160;
  };
  while (size > 60 && !fits()) size -= 6;
  c.fillStyle = units > 0 ? v('--win') : units < 0 ? v('--loss') : v('--ink');
  c.fillText(unitText, W - 80, 700);
  c.textAlign = 'left';
  c.fillStyle = v('--ink');
  c.fillText(d.record, 80, 700);

  const series = d.series ? d.series.split(',').map(Number) : [];
  if (series.length > 1) {
    const x0 = 80;
    const y0 = 760;
    const w = W - 160;
    const h = 220;
    const lo = Math.min(0, ...series);
    const span = Math.max(0, ...series) - lo || 1;
    const y = (val) => y0 + h - ((val - lo) / span) * h;
    c.strokeStyle = v('--line');
    c.setLineDash([10, 10]);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x0, y(0));
    c.lineTo(x0 + w, y(0));
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = series.at(-1) >= 0 ? v('--win') : v('--loss');
    c.lineWidth = 7;
    c.lineJoin = 'round';
    c.beginPath();
    series.forEach((val, i) => c[i ? 'lineTo' : 'moveTo'](x0 + (i / (series.length - 1)) * w, y(val)));
    c.stroke();
    c.fillStyle = v('--muted');
    c.font = `600 28px Barlow, sans-serif`;
    c.fillText('Units, last 30 days', x0, y0 + h + 44);
  }

  const stats = [['WIN', d.win], ['ROI', d.roi], ['LAST 10', d.last10]];
  stats.forEach(([label, value], i) => {
    const x = 80 + i * 320;
    c.fillStyle = v('--card');
    c.fillRect(x, 1070, 280, 140);
    c.fillStyle = v('--muted');
    c.font = `700 30px ${cond}`;
    c.fillText(label, x + 24, 1116);
    c.fillStyle = v('--ink');
    c.font = `800 62px ${cond}`;
    c.fillText(value.replace('−', '-'), x + 24, 1186);
  });

  c.fillStyle = v('--muted');
  c.font = `600 30px Barlow, sans-serif`;
  c.fillText(`Every pick locked before the game · ${d.url}`, 80, 1268);
  // The daily picks site, on every share image.
  if (d.site) {
    c.fillStyle = v('--gold') || '#ffd257';
    c.font = `700 30px Barlow, sans-serif`;
    c.fillText(`Free daily picks · ${d.site}`, 80, 1314);
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}

// Game chat stays current: every 15 seconds while the page is in view, swap in
// the newest messages. Typing isn't touched; only the list changes.
// Live games keep their scores current: every 30 seconds while the page is in
// view, swap in the latest list from the server. A live tournament's "As it
// stands" does the same every 45 (data-poll-every, in seconds).
const liveList = document.querySelector('[data-live-poll]');
if (liveList && window.DOMParser) {
  const every = Math.max(15, Number(liveList.dataset.pollEvery) || 30) * 1000;
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const res = await fetch(window.location.pathname, { credentials: 'same-origin', headers: { accept: 'text/html' } });
      if (!res.ok || res.redirected) return;
      const next = new DOMParser().parseFromString(await res.text(), 'text/html').querySelector('[data-live-poll]');
      if (next) liveList.replaceChildren(...[...next.childNodes].map((n) => document.adoptNode(n)));
    } catch {
      // Try again on the next tick.
    }
  }, every);
}

const chatBox = document.querySelector('.chat[data-poll]');
if (chatBox && window.DOMParser) {
  const list = chatBox.querySelector('.chat-list');
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const res = await fetch(window.location.pathname, { credentials: 'same-origin', headers: { accept: 'text/html' } });
      if (!res.ok || res.redirected) return;
      const next = new DOMParser().parseFromString(await res.text(), 'text/html').querySelector('.chat-list');
      const ids = (el) => [...el.querySelectorAll('.msg')].map((m) => m.dataset.id).join();
      if (!next || ids(next) === ids(list)) return;
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
      list.replaceChildren(...[...next.childNodes].map((n) => document.adoptNode(n)));
      localTimes(list);
      for (const form of list.querySelectorAll('form[data-confirm]')) {
        form.addEventListener('submit', (event) => {
          if (!window.confirm(form.dataset.confirm)) event.preventDefault();
        });
      }
      if (nearBottom) window.scrollTo(0, document.body.scrollHeight);
    } catch {
      // Try again on the next tick.
    }
  }, 15_000);
}

// Phone notifications: register the service worker, ask permission, and hand
// the subscription to the server. iPhones only allow it from the Home Screen app.
const pushBox = document.querySelector('[data-push-key]');
if (pushBox) {
  const on = pushBox.querySelector('[data-push-on]');
  const status = pushBox.querySelector('[data-push-status]');
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) pushBox.querySelector('[data-push-help]').hidden = false;
  else on.hidden = false;
  on?.addEventListener('click', async () => {
    on.disabled = true;
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        status.textContent = 'Notifications are blocked. Allow them for this site in your settings, then try again.';
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const key = Uint8Array.from(atob(pushBox.dataset.pushKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      const json = sub.toJSON();
      const csrf = document.querySelector('input[name="_csrf"]')?.value ?? '';
      const res = await fetch('/push/subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ _csrf: csrf, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }),
      });
      status.textContent = res.ok ? "You're set. Notifications will show on this device." : "That didn't work. Try again in a minute.";
    } catch {
      status.textContent = "That didn't work on this device.";
    } finally {
      on.disabled = false;
    }
  });
}

// Copy an invite link.
for (const button of document.querySelectorAll('[data-copy]')) {
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select and copy the link';
    }
  });
}

// Team initials show until a logo has actually loaded, and stay if it never does.
for (const img of document.querySelectorAll('.logo img')) {
  const shown = () => img.parentElement.classList.add('loaded');
  if (img.complete && img.naturalWidth) shown();
  else img.addEventListener('load', shown);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// The look picker's sample card shows a look before it's saved: a preset on
// hover or focus, a team or custom colors as they're picked. Team and custom
// samples load the server's own stylesheet for those colors, so the sample
// is exactly what saving gives, readability guard and all.
const picker = document.querySelector('[data-picker]');
if (picker) {
  const sample = picker.querySelector('[data-preview]');
  const saved = sample.dataset.theme;
  let sheet = null;
  const showSheet = (href) => {
    if (!sheet) {
      sheet = document.createElement('link');
      sheet.rel = 'stylesheet';
      document.head.append(sheet);
    }
    if (sheet.getAttribute('href') !== href) sheet.href = href;
    sample.dataset.theme = 'preview';
  };
  for (const button of picker.querySelectorAll('[data-sample]')) {
    const show = () => {
      sample.dataset.theme = button.dataset.sample;
    };
    const back = () => {
      sample.dataset.theme = saved;
    };
    button.addEventListener('mouseenter', show);
    button.addEventListener('focus', show);
    button.addEventListener('mouseleave', back);
    button.addEventListener('blur', back);
  }
  const modeOf = (form) => (form.querySelector('input[name="mode"]:checked')?.value === 'light' ? 'light' : 'dark');

  // Match my team: the sport first, then its teams.
  const teamForm = picker.querySelector('[data-team-form]');
  if (teamForm) {
    const sportPick = teamForm.querySelector('[data-sport-pick]');
    const sportSelect = teamForm.querySelector('[data-team-sport]');
    const teamSelect = teamForm.querySelector('[data-team-select]');
    const blank = teamSelect.querySelector('option[value=""]');
    const bySport = new Map([...teamSelect.querySelectorAll('optgroup')].map((g) => [g.dataset.sport, [...g.querySelectorAll('option')]]));
    const fill = () => {
      const keep = teamSelect.value;
      const options = bySport.get(sportSelect.value) ?? [];
      teamSelect.replaceChildren(blank, ...options);
      teamSelect.value = options.some((o) => o.value === keep) ? keep : '';
    };
    const previewTeam = () => {
      const option = teamSelect.selectedOptions[0];
      if (option?.value) showSheet(option.dataset[modeOf(teamForm)]);
    };
    fill();
    sportPick.hidden = false;
    sportSelect.addEventListener('change', fill);
    teamSelect.addEventListener('change', previewTeam);
    for (const radio of teamForm.querySelectorAll('input[name="mode"]')) radio.addEventListener('change', previewTeam);
  }

  // Custom: two colors and a background, previewed as they change.
  const customForm = picker.querySelector('[data-custom-form]');
  if (customForm) {
    let timer = null;
    const previewCustom = () => {
      const accent = customForm.elements.accent.value.toLowerCase();
      const tint = customForm.elements.tint.value.toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(accent) || !/^#[0-9a-f]{6}$/.test(tint)) return;
      showSheet(`/theme/t1-${modeOf(customForm) === 'light' ? 'l' : 'd'}-${accent.slice(1)}-${tint.slice(1)}-preview.css`);
    };
    customForm.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(previewCustom, 150);
    });
    customForm.addEventListener('change', previewCustom);
  }
}

// A picked file as something a canvas can draw. The page allows data: images
// but not blob: ones, so older browsers read the file as data.
async function decodePicture(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to an <img>.
    }
  }
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return loadImage(url);
}

/**
 * Send a cropped canvas as a JPEG in `field`, with the form's token, and
 * reload the profile, which shows how it went. False if it didn't send.
 */
async function sendCanvas(form, canvas, field, quality) {
  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/jpeg', quality));
  const body = new FormData();
  body.append('_csrf', form.querySelector('input[name="_csrf"]')?.value ?? '');
  body.append(field, blob, `${field}.jpg`);
  // The answer is a redirect that carries the result; the profile shows it.
  const res = await fetch(form.action, { method: 'POST', body, credentials: 'same-origin', redirect: 'manual' });
  if (res.type !== 'opaqueredirect' && !res.ok) throw new Error(`answered ${res.status}`);
  window.location.assign(window.location.pathname);
}

// Profile photo: cut the chosen picture to a square from the middle, shrink
// it to 400×400 and send it as a JPEG. Drawing it on a canvas also leaves its
// EXIF (and any GPS) behind. Without this, the form sends the file as it is,
// and the server checks it either way.
const photoForm = document.querySelector('[data-photo-form]');
const photoCanvas = document.querySelector('[data-photo-canvas]');
if (photoForm && photoCanvas && HTMLCanvasElement.prototype.toBlob) {
  const input = photoForm.querySelector('[data-photo-input]');
  const status = photoForm.querySelector('[data-photo-status]');
  const save = photoForm.querySelector('[data-photo-save]');
  const current = photoCanvas.parentElement.querySelector('.avatar:not(canvas)');
  let ready = false;
  input.addEventListener('change', async () => {
    ready = false;
    const file = input.files?.[0];
    status.textContent = '';
    if (!file) return;
    try {
      const pic = await decodePicture(file);
      const w = pic.naturalWidth || pic.width;
      const h = pic.naturalHeight || pic.height;
      const side = Math.min(w, h);
      const c = photoCanvas.getContext('2d');
      // A see-through PNG gets white behind it, not black, as a JPEG.
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, 400, 400);
      c.imageSmoothingQuality = 'high';
      c.drawImage(pic, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 400, 400);
      photoCanvas.hidden = false;
      if (current) current.hidden = true;
      ready = true;
      status.textContent = 'Looks good? Save it.';
    } catch {
      status.textContent = "That file didn't open as a picture. Try another.";
    }
  });
  photoForm.addEventListener('submit', async (event) => {
    if (!ready) return;
    event.preventDefault();
    save.disabled = true;
    status.textContent = 'Saving…';
    try {
      await sendCanvas(photoForm, photoCanvas, 'photo', 0.85);
    } catch {
      status.textContent = "That didn't save. Reload the page and try again.";
      save.disabled = false;
    }
  });
}

// Cover photo: cut the chosen picture to a strip 3 times as wide as it is
// tall, shrink it to 1200×400 and send it as a JPEG, the same way as the
// photo. It starts centered; drag the preview (or use the arrow keys) to
// choose what shows. The Edit cover button on the banner is a link to the
// form; here it opens the file picker too. Without this, the form sends the
// file as it is, and the server checks it either way.
const coverForm = document.querySelector('[data-cover-form]');
const coverCanvas = document.querySelector('[data-cover-canvas]');
if (coverForm && coverCanvas && HTMLCanvasElement.prototype.toBlob) {
  const input = coverForm.querySelector('[data-cover-input]');
  const status = coverForm.querySelector('[data-cover-status]');
  const save = coverForm.querySelector('[data-cover-save]');
  const current = coverCanvas.parentElement.querySelector('.cover-thumb:not(canvas)');
  const W = 1200;
  const H = 400;
  // The picture, its size, the 3:1 part of it that shows, and where that part sits (0 to 1 each way).
  let pic = null;
  let w = 0;
  let h = 0;
  let cw = 0;
  let ch = 0;
  let fx = 0.5;
  let fy = 0.5;
  const draw = () => {
    const c = coverCanvas.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, H);
    c.imageSmoothingQuality = 'high';
    c.drawImage(pic, (w - cw) * fx, (h - ch) * fy, cw, ch, 0, 0, W, H);
  };
  const clamp = (n) => Math.min(1, Math.max(0, n));

  for (const pick of document.querySelectorAll('[data-cover-pick]')) {
    pick.addEventListener('click', (event) => {
      event.preventDefault();
      input.click();
    });
  }

  input.addEventListener('change', async () => {
    pic = null;
    const file = input.files?.[0];
    status.textContent = '';
    if (!file) return;
    try {
      pic = await decodePicture(file);
      w = pic.naturalWidth || pic.width;
      h = pic.naturalHeight || pic.height;
      // The biggest 3:1 strip the picture has, centered to start.
      if (w / h > W / H) {
        ch = h;
        cw = (h * W) / H;
      } else {
        cw = w;
        ch = (w * H) / W;
      }
      fx = 0.5;
      fy = 0.5;
      draw();
      coverCanvas.hidden = false;
      if (current) current.hidden = true;
      status.textContent = w - cw > 1 || h - ch > 1 ? 'Drag it to choose what shows, then save.' : 'Looks good? Save it.';
      coverCanvas.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {
      pic = null;
      status.textContent = "That file didn't open as a picture. Try another.";
    }
  });

  // Dragging moves the strip over the picture: along whichever way it has room.
  let drag = null;
  coverCanvas.addEventListener('pointerdown', (event) => {
    if (!pic) return;
    coverCanvas.setPointerCapture(event.pointerId);
    drag = { x: event.clientX, y: event.clientY, fx, fy };
  });
  coverCanvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    // Picture pixels for each screen pixel of the preview.
    const scale = cw / coverCanvas.clientWidth;
    if (w - cw > 1) fx = clamp(drag.fx - ((event.clientX - drag.x) * scale) / (w - cw));
    if (h - ch > 1) fy = clamp(drag.fy - ((event.clientY - drag.y) * scale) / (h - ch));
    draw();
  });
  const stop = () => (drag = null);
  coverCanvas.addEventListener('pointerup', stop);
  coverCanvas.addEventListener('pointercancel', stop);
  coverCanvas.addEventListener('keydown', (event) => {
    // The picture moves the way the arrow points, the same as dragging it.
    const step = { ArrowUp: [0, 0.05], ArrowDown: [0, -0.05], ArrowLeft: [0.05, 0], ArrowRight: [-0.05, 0] }[event.key];
    if (!pic || !step) return;
    event.preventDefault();
    fx = clamp(fx + step[0]);
    fy = clamp(fy + step[1]);
    draw();
  });

  coverForm.addEventListener('submit', async (event) => {
    if (!pic) return;
    event.preventDefault();
    save.disabled = true;
    status.textContent = 'Saving…';
    try {
      await sendCanvas(coverForm, coverCanvas, 'cover', 0.82);
    } catch {
      status.textContent = "That didn't save. Reload the page and try again.";
      save.disabled = false;
    }
  });
}

// "Your name on the boards": the sample row follows the color and icon as
// they're picked, before saving. The team logos can be narrowed to one league
// or found by name. Without this the form still saves; the sample shows what's saved.
const nametag = document.querySelector('[data-nametag]');
if (nametag) {
  const form = nametag.querySelector('[data-nametag-form]');
  const name = nametag.querySelector('[data-nt-name]');
  const slot = nametag.querySelector('[data-nt-icon]');
  const paint = () => {
    const color = form.querySelector('input[name="color"]:checked')?.value ?? 'default';
    name.className = color === 'default' ? 'who' : `who name-c-${color}`;
    const picked = form.querySelector('input[name="icon"]:checked');
    const glyph = picked?.parentElement.querySelector('[data-glyph]');
    if (!glyph) return slot.replaceChildren();
    if (glyph.tagName === 'IMG') {
      const img = document.createElement('img');
      img.className = 'name-logo';
      img.src = glyph.src;
      img.alt = glyph.dataset.name ?? '';
      img.width = 18;
      img.height = 18;
      img.referrerPolicy = 'no-referrer';
      slot.replaceChildren(img);
    } else {
      const span = document.createElement('span');
      span.className = 'name-icon';
      span.setAttribute('role', 'img');
      span.setAttribute('aria-label', picked.parentElement.title);
      span.textContent = glyph.textContent;
      slot.replaceChildren(span);
    }
  };
  form.addEventListener('change', paint);

  const filter = form.querySelector('[data-team-filter]');
  if (filter) {
    const league = filter.querySelector('[data-team-league]');
    const find = filter.querySelector('[data-team-find]');
    const sections = [...form.querySelectorAll('.team-league')];
    const narrow = () => {
      const q = find.value.trim().toLowerCase();
      for (const section of sections) {
        let shown = 0;
        for (const opt of section.querySelectorAll('[data-team-name]')) {
          opt.hidden = Boolean(q) && !opt.dataset.teamName.includes(q);
          if (!opt.hidden) shown += 1;
        }
        section.hidden = (league.value && section.dataset.league !== league.value) || (q && !shown);
        if (!section.hidden && (league.value || q)) section.open = true;
      }
    };
    filter.hidden = false;
    league.addEventListener('change', narrow);
    find.addEventListener('input', narrow);
  }
}

// The Today's Locks card on the board: the × hides it at once and tells the
// server, which keeps it hidden until the next ET day. Without this the form
// posts and the page comes back without it.
for (const form of document.querySelectorAll('form[data-bb-dismiss]')) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    form.closest('[data-bb-locks]')?.remove();
    fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)), credentials: 'same-origin', redirect: 'manual' }).catch(() => {});
  });
}

// The bracket challenge: a tap on a team saves it at once and redraws the
// bracket, so the next round fills in without a Save. Without JavaScript,
// each round's Save button does the same.
const bracketBox = document.querySelector('[data-bracket]');
if (bracketBox && window.DOMParser && window.fetch) {
  // Round buttons go; the Final Four's stays for the tiebreaker.
  const hideSaves = () => {
    for (const button of bracketBox.querySelectorAll('.bk-save')) button.hidden = !button.form?.querySelector('input[name="tiebreak"]');
  };
  hideSaves();
  let saving = Promise.resolve();
  bracketBox.addEventListener('change', (event) => {
    const form = event.target.closest('form[data-bracket-round]');
    if (!form || event.target.type !== 'radio') return;
    const body = new URLSearchParams();
    // Only the tapped game and the form's token and view: other games on the form keep what's saved.
    for (const [key, value] of new FormData(form)) if (!/^g\d+$/.test(key) || key === event.target.name) body.append(key, value);
    saving = saving.then(async () => {
      try {
        const res = await fetch(form.action, { method: 'POST', body, credentials: 'same-origin', headers: { accept: 'text/html' } });
        if (!res.ok) throw new Error(String(res.status));
        const page = new DOMParser().parseFromString(await res.text(), 'text/html');
        const next = page.querySelector('[data-bracket]');
        const clock = page.querySelector('.contest-clock');
        if (next) {
          const y = window.scrollY;
          bracketBox.replaceChildren(...[...next.childNodes].map((n) => document.adoptNode(n)));
          hideSaves();
          window.scrollTo(0, y);
        }
        const here = document.querySelector('.contest-clock');
        if (clock && here) here.replaceWith(document.adoptNode(clock));
      } catch {
        // Fall back to a normal submit, which shows any problem.
        form.submit();
      }
    });
  });
}
// The launch screen fades on its own; a tap skips it.
const splashScreen = document.querySelector('[data-splash]');
if (splashScreen) splashScreen.addEventListener('click', () => splashScreen.remove());
