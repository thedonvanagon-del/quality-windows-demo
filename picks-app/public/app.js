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
for (const link of document.querySelectorAll('[data-get-app]')) link.addEventListener('click', promptInstall);
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

// Ask before anything that can't be undone.
for (const form of document.querySelectorAll('form[data-confirm]')) {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
}

// Keep "to win" on the pick slip in step with the units.
function initSlip(slip) {
  const odds = Number(slip.dataset.odds);
  const input = slip.querySelector('input[name="units"]');
  const chips = slip.querySelector('.chips');
  const update = () => {
    const units = Number(input.value.replace(/[u,\s]/gi, ''));
    const ok = Number.isFinite(units) && units > 0;
    const win = ok ? Math.round((odds > 0 ? (units * odds) / 100 : (units * 100) / -odds) * 100) / 100 : 0;
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

// On the games board, a tapped line opens its slip in a sheet that slides up
// over the board instead of a new page. Anything off and it's a normal link.
const board = document.querySelector('.event') && window.HTMLDialogElement && window.DOMParser;
if (board) {
  const sheet = document.createElement('dialog');
  sheet.className = 'sheet';
  sheet.setAttribute('aria-label', 'Pick slip');
  document.body.append(sheet);
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet || event.target.closest('[data-close]')) sheet.close();
  });
  document.addEventListener('click', async (event) => {
    const link = event.target.closest('a.cell[href^="/pick?"]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    try {
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
      initSlip(sheet.querySelector('form[data-odds]'));
      localTimes(sheet);
      sheet.showModal();
    } catch {
      window.location.href = link.href;
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
          await navigator.share({ files: [file], title: `${card.dataset.name} on Bookie Bullies` });
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
  c.fillText('BOOKIE BULLIES', 224, 150);
  c.fillStyle = '#ffd257';
  c.font = `800 34px ${cond}`;
  c.fillText('✓ TRUST YOUR BETS', 226, 196);

  c.fillStyle = v('--ink');
  c.font = `800 96px ${cond}`;
  c.fillText(d.name, 80, 360);
  if (d.rank) {
    c.font = `800 40px ${cond}`;
    const label = `${d.rank} OVERALL`;
    const w = c.measureText(label).width + 32;
    c.fillStyle = v('--accent');
    c.fillRect(80, 392, w, 56);
    c.fillStyle = v('--accent-ink');
    c.fillText(label, 96, 434);
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
  c.fillText(`Every pick locked before the game · ${d.url}`, 80, 1290);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}

// Game chat stays current: every 15 seconds while the page is in view, swap in
// the newest messages. Typing isn't touched; only the list changes.
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
