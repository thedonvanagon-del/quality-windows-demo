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

// Keep "to win" on the pick slip in step with the stake.
const slip = document.querySelector('[data-odds]');
if (slip) {
  const odds = Number(slip.dataset.odds);
  const out = document.querySelector('[data-to-win]');
  const update = () => {
    const units = Number(slip.querySelector('input[name="units"]:checked')?.value || 1);
    const win = odds > 0 ? (units * odds) / 100 : (units * 100) / -odds;
    out.textContent = `${Math.round(win * 100) / 100}u`;
  };
  slip.addEventListener('change', update);
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
