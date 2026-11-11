import { listServices } from './booking.js';
import { html, money, paragraphs } from './html.js';
import { groupByCategory, layout, serviceList } from './views.js';

// Photos live in public/ and are swapped by replacing the files (same names).
// A category without one here just shows a card with no photo.
const CATEGORY_PHOTOS = {
  Facials: ['/static/facials.jpg', 'A client relaxing during a facial with a clay mask'],
  Lashes: ['/static/lashes.jpg', 'Close-up of natural lashes'],
  Waxing: ['/static/waxing.jpg', 'Folded towel, a pump bottle and pink tulips'],
};

// Cheapest paid service in a group (a free consultation shouldn't make everything "from $0").
const fromPrice = (items) => {
  const paid = items.map((i) => i.price_cents).filter((p) => p > 0);
  return paid.length ? Math.min(...paid) : 0;
};

const anchor = (category) => category.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function registerPublic(add, { store }) {
  add('GET', '/', (ctx) => {
    const s = ctx.settings;
    const groups = groupByCategory(listServices(store));
    const blurb = {
      Facials: 'Hydradermabrasion, microdermabrasion, microneedling and enzyme peels, matched to your skin on the day.',
      Lashes: 'Lifts and tints that make your own lashes do more, with no daily upkeep.',
      Waxing: 'Quick, clean and gentle, for face and body.',
    };
    const firstVisit = s.first_visit.split('\n').map((l) => l.trim()).filter(Boolean);
    const body = html`
<section class="hero">
  <div class="wrap hero-inner">
    <div class="hero-text">
      <p class="eyebrow">${s.public_area} · by appointment</p>
      <h1>${s.studio_name}</h1>
      <p class="lead">${s.tagline}</p>
      <p class="hero-actions"><a class="btn" href="/book">Book a visit</a> <a class="btn btn-quiet" href="/services">See the menu</a></p>
    </div>
    <img class="hero-photo" src="/static/hero.jpg" alt="A client resting during a calm, hands-on facial" width="1400" height="1050">
  </div>
</section>

<section class="wrap page">
  <h2 class="section-title">What I do</h2>
  <div class="cards">
    ${groups.map(([category, items]) => {
      const photo = CATEGORY_PHOTOS[category];
      return html`<a class="card${photo ? ' has-photo' : ''}" href="/services#${anchor(category)}">
      ${photo ? html`<img src="${photo[0]}" alt="${photo[1]}" width="800" height="560" loading="lazy">` : ''}
      <div class="card-body">
        <h3>${category}</h3>
        <p>${blurb[category] ?? `${items.length} services`}</p>
        <p class="muted small">From ${money(fromPrice(items))}</p>
      </div>
    </a>`;
    })}
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
  <img class="about-photo" src="/static/about.jpg" alt="A drop of serum on the back of a hand" width="800" height="1000" loading="lazy">
  <div class="about-text">
    <h2 class="section-title">About ${s.esthetician_name}</h2>
    ${paragraphs(s.bio)}
    <div class="note">
      <h3>A private home studio</h3>
      <p>Quiet, clean and one-on-one. I'm in ${s.public_area}. You get the exact address when you book.</p>
      <p><a href="/policies">Read the policies</a></p>
    </div>
  </div>
</section>

${firstVisit.length ? html`<section class="band">
  <div class="wrap page first-visit">
    <div>
      <h2 class="section-title">Your first visit</h2>
      <ul class="checklist">${firstVisit.map((line) => html`<li>${line}</li>`)}</ul>
      <p><a class="btn btn-quiet" href="/book/consultation">Not sure where to start? Book a free consultation</a></p>
    </div>
    <img class="first-visit-photo" src="/static/first-visit.jpg" alt="A serum bottle on a white marble tray" width="900" height="600" loading="lazy">
  </div>
</section>` : ''}

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
    const services = listServices(store);
    const consult = services.find((s) => s.slug === 'consultation');
    ctx.page(layout(ctx, {
      title: 'Book', section: 'book',
      body: html`<section class="wrap page"><h1>Book a visit</h1><p class="lead">Choose a service to see open times.</p>
  ${consult ? html`<aside class="start-here">
    <div>
      <h2>Not sure what to book?</h2>
      <p>Start with a ${consult.price_cents ? money(consult.price_cents) : 'free'} ${consult.duration_min}-minute ${consult.name.toLowerCase()}. We'll look at your skin together and plan what's next.</p>
    </div>
    <a class="btn" href="/book/${consult.slug}">Book a consultation</a>
  </aside>` : ''}
  ${serviceList(services)}</section>`,
    }));
  });
}
