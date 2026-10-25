// Small touches on top of pages that work without it.

// Show game times in the viewer's own time zone. The server writes Eastern.
const short = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const long = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
for (const el of document.querySelectorAll('time[data-local]')) {
  const at = new Date(el.getAttribute('datetime'));
  if (!Number.isNaN(+at)) el.textContent = (el.dataset.local === 'long' ? long : short).format(at);
}

// Ask before anything that can't be undone.
for (const form of document.querySelectorAll('form[data-confirm]')) {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
}

// Keep "to win" and the unit count on the pick slip in step with the wager.
const slip = document.querySelector('form[data-odds]');
if (slip) {
  const odds = Number(slip.dataset.odds);
  const unit = Number(slip.dataset.unit) || 100;
  const input = slip.querySelector('input[name="wager"]');
  const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
  const chips = slip.querySelector('.chips');
  const update = () => {
    const wager = Number(input.value.replace(/[$,\s]/g, ''));
    const ok = Number.isFinite(wager) && wager > 0;
    const win = ok ? Math.round((odds > 0 ? (wager * odds) / 100 : (wager * 100) / -odds) * 100) / 100 : 0;
    slip.querySelector('[data-to-win]').textContent = ok ? money(win) : '–';
    slip.querySelector('[data-units]').textContent = ok ? `${Math.max(0.01, Math.round((wager / unit) * 100) / 100)}u` : '–';
    for (const chip of chips.querySelectorAll('.chip')) chip.classList.toggle('on', Number(chip.dataset.wager) === wager);
  };
  chips.hidden = false;
  chips.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    input.value = chip.dataset.wager;
    update();
  });
  input.addEventListener('input', update);
  update();
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
