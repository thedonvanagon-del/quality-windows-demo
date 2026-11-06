// Sign in, sign up, sign out. See auth.js for the rules.

import { checkPassword, hashPassword, issueCode, normalizeEmail, passwordProblem, redeemCode, completeSignIn } from './auth.js';
import { html } from './html.js';
import { csrf, field, layout } from './views.js';

/** Only same-site paths: never let ?next= send someone to another site. */
export function safeNext(raw, fallback = '/account') {
  const next = String(raw ?? '');
  return next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !/[\r\n]/.test(next) && next.length < 600 ? next : fallback;
}

export function registerAuth(add, { store, notifier, loginLimiter, codeLimiter, now }) {
  const loginPage = (ctx, { error = '', email = '', next = '/account' } = {}) => layout(ctx, {
    title: 'Sign in', section: 'login',
    body: html`<section class="wrap narrow page">
  <h1>Sign in</h1>
  <p class="lead">Use your email to book and manage visits. No password needed.</p>
  ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
  <form method="post" action="/login/code" class="stack">
    ${csrf(ctx)}<input type="hidden" name="next" value="${next}">
    ${field({ label: 'Email', name: 'email', type: 'email', value: email, required: true, autocomplete: 'email' })}
    <button class="btn" type="submit">Email me a code</button>
    <p class="muted small">New here? The same button creates your profile once you enter the code.</p>
  </form>
  <details class="more">
    <summary>Use a password instead</summary>
    <form method="post" action="/login" class="stack">
      ${csrf(ctx)}<input type="hidden" name="next" value="${next}">
      ${field({ label: 'Email', name: 'email', type: 'email', value: email, required: true, autocomplete: 'email' })}
      ${field({ label: 'Password', name: 'password', type: 'password', required: true, autocomplete: 'current-password' })}
      <button class="btn btn-quiet" type="submit">Sign in</button>
    </form>
  </details>
  <p class="muted">Prefer a profile with a name, phone and password? <a href="/signup?next=${encodeURIComponent(next)}">Create one</a>.</p>
</section>`,
  });

  const verifyPage = (ctx, { email, next, error = '' }) => layout(ctx, {
    title: 'Enter your code', section: 'login',
    body: html`<section class="wrap narrow page">
  <h1>Check your email</h1>
  <p class="lead">We sent a 6-digit code to <strong>${email}</strong>. It works for 10 minutes.</p>
  ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
  <form method="post" action="/login/verify" class="stack">
    ${csrf(ctx)}<input type="hidden" name="email" value="${email}"><input type="hidden" name="next" value="${next}">
    <label class="field"><span>Code</span><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus class="code-input"></label>
    <button class="btn" type="submit">Continue</button>
  </form>
  <p class="muted small">No email? Check spam, or <a href="/login?next=${encodeURIComponent(next)}">try again</a>.</p>
</section>`,
  });

  async function sendCode(ctx, email, next, payload) {
    if (!codeLimiter.take(ctx.ip ?? 'unknown')) {
      return ctx.page(loginPage(ctx, { error: 'Too many tries. Please wait a bit and try again.', email, next }), 429);
    }
    const issued = issueCode(store, email, payload, now());
    if (issued.limited) {
      return ctx.page(loginPage(ctx, { error: 'You have asked for several codes. Please wait an hour or use the most recent email.', email, next }), 429);
    }
    await notifier.code(email, issued.code, issued.minutes);
    ctx.redirect(`/login/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`,
      ctx.config.demo ? `Demo mode: your code is ${issued.code}` : null);
  }

  add('GET', '/login', (ctx) => {
    if (ctx.user) return ctx.redirect(safeNext(ctx.query.get('next')));
    ctx.page(loginPage(ctx, { next: safeNext(ctx.query.get('next')) }));
  });

  add('POST', '/login/code', async (ctx) => {
    const next = safeNext(ctx.form.next);
    const email = normalizeEmail(ctx.form.email);
    if (!email) return ctx.page(loginPage(ctx, { error: 'That email does not look right.', email: String(ctx.form.email ?? ''), next }), 400);
    await sendCode(ctx, email, next, null);
  });

  add('GET', '/login/verify', (ctx) => {
    const email = normalizeEmail(ctx.query.get('email'));
    if (!email) return ctx.redirect('/login');
    ctx.page(verifyPage(ctx, { email, next: safeNext(ctx.query.get('next')) }));
  });

  add('POST', '/login/verify', (ctx) => {
    const next = safeNext(ctx.form.next);
    const email = normalizeEmail(ctx.form.email);
    if (!email) return ctx.redirect('/login');
    const result = redeemCode(store, email, ctx.form.code ?? '', now());
    if (!result.ok) return ctx.page(verifyPage(ctx, { email, next, error: 'That code did not work. Check it, or ask for a new one.' }), 400);
    const user = completeSignIn(store, email, result.payload, now());
    ctx.signIn(user.id);
    ctx.redirect(next, user.name ? `Welcome back, ${user.name.split(' ')[0]}.` : 'You are signed in.');
  });

  add('GET', '/signup', (ctx) => {
    if (ctx.user) return ctx.redirect('/account');
    const next = safeNext(ctx.query.get('next'));
    ctx.page(signupPage(ctx, { next }));
  });

  const signupPage = (ctx, { error = '', values = {}, next }) => layout(ctx, {
    title: 'Create your profile', section: 'login',
    body: html`<section class="wrap narrow page">
  <h1>Create your profile</h1>
  <p class="lead">Keep your details and visit history in one place. We'll email a code to confirm it's you.</p>
  ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
  <form method="post" action="/signup" class="stack">
    ${csrf(ctx)}<input type="hidden" name="next" value="${next}">
    ${field({ label: 'Full name', name: 'name', value: values.name ?? '', required: true, autocomplete: 'name' })}
    ${field({ label: 'Email', name: 'email', type: 'email', value: values.email ?? '', required: true, autocomplete: 'email' })}
    ${field({ label: 'Mobile', name: 'phone', type: 'tel', value: values.phone ?? '', autocomplete: 'tel', hint: 'Only used for appointment changes.' })}
    ${field({ label: 'Password', name: 'password', type: 'password', autocomplete: 'new-password', hint: 'Optional. At least 8 characters. You can always sign in with an emailed code instead.' })}
    <button class="btn" type="submit">Create profile</button>
  </form>
  <p class="muted">Already have one? <a href="/login?next=${encodeURIComponent(next)}">Sign in</a>.</p>
</section>`,
  });

  add('POST', '/signup', async (ctx) => {
    const next = safeNext(ctx.form.next);
    const values = { name: String(ctx.form.name ?? '').trim().slice(0, 120), email: String(ctx.form.email ?? ''), phone: String(ctx.form.phone ?? '').trim().slice(0, 40) };
    const email = normalizeEmail(values.email);
    const password = String(ctx.form.password ?? '');
    if (values.name.length < 2) return ctx.page(signupPage(ctx, { error: 'Please add your name.', values, next }), 400);
    if (!email) return ctx.page(signupPage(ctx, { error: 'That email does not look right.', values, next }), 400);
    if (password && passwordProblem(password)) return ctx.page(signupPage(ctx, { error: passwordProblem(password), values, next }), 400);
    await sendCode(ctx, email, next, { name: values.name, phone: values.phone, passwordHash: password ? hashPassword(password) : null });
  });

  add('POST', '/login', (ctx) => {
    const next = safeNext(ctx.form.next);
    const raw = String(ctx.form.email ?? '');
    const email = normalizeEmail(raw);
    const fail = (status = 400) => ctx.page(loginPage(ctx, { error: 'That email and password did not match. You can also get an emailed code.', email: raw, next }), status);
    if (!loginLimiter.take(`${ctx.ip}|${email ?? raw}`)) return ctx.page(loginPage(ctx, { error: 'Too many tries. Please wait a few minutes.', email: raw, next }), 429);
    const user = email ? store.get('SELECT * FROM users WHERE email = ? AND email_verified = 1', email) : null;
    // Always do the hashing work, so timing doesn't reveal whether the address has a profile.
    const ok = checkPassword(String(ctx.form.password ?? ''), user?.password_hash ?? null);
    if (!user || !ok) return fail();
    ctx.signIn(user.id);
    ctx.redirect(next, user.name ? `Welcome back, ${user.name.split(' ')[0]}.` : 'You are signed in.');
  });

  add('POST', '/logout', (ctx) => {
    ctx.signOut();
    ctx.redirect('/', 'You are signed out.');
  });
}
