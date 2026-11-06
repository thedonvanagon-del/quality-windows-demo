import { listServices } from './booking.js';
import { html, money, paragraphs } from './html.js';
import { groupByCategory, layout, serviceList } from './views.js';

// Cheapest paid service in a group (a free consultation shouldn't make everything "from $0").
const fromPrice = (items) => {
  const paid = items.map((i) => i.price_cents).filter((p) => p > 0);
  return paid.length ? Math.min(...paid) : 0;
};

export function registerPublic(add, { store }) {
  add('GET', '/', (ctx) => {
    const s = ctx.settings;
    const groups = groupByCategory(listServices(store));
    const blurb = {
      Facials: 'Hydradermabrasion, microdermabrasion, microneedling and enzyme peels, matched to your skin on the day.',
      Lashes: 'Lifts and tints that make your own lashes do more, with no daily upkeep.',
      Waxing: 'Quick, clean and gentle, for face and body.',
    };
    const body = html`
<section class="hero">
  <div class="wrap hero-inner">
    <p class="eyebrow">${s.public_area} · by appointment</p>
    <h1>${s.studio_name}</h1>
    <p class="lead">${s.tagline}</p>
    <p class="hero-actions"><a class="btn" href="/book">Book a visit</a> <a class="btn btn-quiet" href="/services">See the menu</a></p>
  </div>
</section>

<section class="wrap page">
  <h2 class="section-title">What I do</h2>
  <div class="cards">
    ${groups.map(([category, items]) => html`<a class="card" href="/services#${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">
      <h3>${category}</h3>
      <p>${blurb[category] ?? `${items.length} services`}</p>
      <p class="muted small">From ${money(fromPrice(items))}</p>
    </a>`)}
  </div>
</section>

<section class="band">
  <div class="wrap page">
    <h2 class="section-title">How booking works</h2>
    <ol class="how">
      <li><strong>Pick a service.</strong> Add an extra or two if you like.</li>
      <li><strong>Choose a time.</strong> You see what's actually open, no back and forth.</li>
      <li><strong>Sign in with your email.</strong> No password needed. I'll send a code.</li>
      <li><strong>Come in.</strong> The address and arrival notes land in your inbox. Change it free up to ${s.cancel_window_hours} hours before.</li>
    </ol>
  </div>
</section>

<section class="wrap page about">
  <div>
    <h2 class="section-title">About ${s.esthetician_name}</h2>
    ${paragraphs(s.bio)}
  </div>
  <aside class="note">
    <h3>A private home studio</h3>
    <p>Quiet, clean and one-on-one. I'm in ${s.public_area}. You get the exact address when you book.</p>
    <p><a href="/policies">Read the policies</a></p>
  </aside>
</section>

<section class="wrap page center cta">
  <h2>Ready when you are</h2>
  <p><a class="btn" href="/book">Book a visit</a></p>
</section>`;
    ctx.page(layout(ctx, { title: '', body }));
  });

  add('GET', '/services', (ctx) => {
    ctx.page(layout(ctx, {
      title: 'Services', section: 'services',
      description: `Facials, lash lifts and waxing at ${ctx.settings.studio_name}.`,
      body: html`<section class="wrap page"><h1>Services</h1><p class="lead">Prices are what you pay at your visit. Tap Book to see open times.</p>${serviceList(listServices(store))}</section>`,
    }));
  });

  add('GET', '/policies', (ctx) => {
    ctx.page(layout(ctx, {
      title: 'Policies', section: 'policies',
      body: html`<section class="wrap narrow page"><h1>Policies</h1>${paragraphs(ctx.settings.policies)}<p><a class="btn" href="/book">Book a visit</a></p></section>`,
    }));
  });

  add('GET', '/book', (ctx) => {
    ctx.page(layout(ctx, {
      title: 'Book', section: 'book',
      body: html`<section class="wrap page"><h1>Book a visit</h1><p class="lead">Choose a service to see open times.</p>${serviceList(listServices(store))}</section>`,
    }));
  });
}
