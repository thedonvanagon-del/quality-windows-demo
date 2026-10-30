import { html } from '../html.js';
import { icons, trustMark } from './icons.js';
import { csrfField, layout } from './layout.js';
import { boardTable } from './parts.js';

export function home(ctx, { top }) {
  return layout(ctx, {
    body: html`
      <section class="hero">
        <div class="trust">${trustMark}<span>Trust Your Bets</span></div>
        <h1>Every pick on the record.</h1>
        <p>Make your picks before the game. They lock at the start, get graded off the final score, and nobody can edit them. Not even you.</p>
        <div class="row">
          <a class="btn" href="/signup">Start your record</a>
          <a class="btn ghost" href="/leaderboard">See the leaderboard</a>
        </div>
      </section>
      <div class="rules">
        <div class="rule"><span class="icon">${icons.lock}</span><h3>Locked at the start</h3><p>Picks close the second a game starts. Change your mind before then and you can delete it. After that, it's on the record.</p></div>
        <div class="rule"><span class="icon">${icons.line}</span><h3>The real number</h3><p>Every pick takes the line ESPN is showing right then. Nobody types in a better number than the one that was out there.</p></div>
        <div class="rule"><span class="icon">${icons.grade}</span><h3>Graded for you</h3><p>Final scores come straight from ESPN. Wins, losses and pushes add up on their own, units and all.</p></div>
        <div class="rule"><span class="icon">${icons.groups}</span><h3>Bring your people</h3><p>Climb the big board, a single sport's board, or start a group for your friends with an invite code.</p></div>
      </div>
      <h2>Top 10, last 30 days</h2>
      ${boardTable(top)}
    `,
  });
}

export function signup(ctx, { email = '', error, next, adult = false, terms = false }) {
  return layout(ctx, {
    title: 'Sign up',
    active: 'signup',
    body: html`
      <div class="auth">
        <h1>Start your record</h1>
        <p class="lede">Email and a password. You'll pick a screen name next.</p>
        ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
        <form class="form" method="post" action="/signup">
          ${csrfField(ctx)}
          ${next ? html`<input type="hidden" name="next" value="${next}">` : ''}
          <label>Email<input type="email" name="email" value="${email}" autocomplete="email" required maxlength="254"></label>
          <label>Password <span class="hint">At least 8 characters.</span>
            <input type="password" name="password" autocomplete="new-password" required minlength="8" maxlength="200"></label>
          <label class="check"><input type="checkbox" name="adult" required ${adult ? 'checked' : ''}><span>I'm 21 or older.</span></label>
          <label class="check"><input type="checkbox" name="terms" required ${terms ? 'checked' : ''}><span>I agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a>.</span></label>
          <button class="btn block">Create account</button>
        </form>
        <p class="fine">Already have one? <a href="/login${next ? `?next=${encodeURIComponent(next)}` : ''}">Log in</a></p>
      </div>
    `,
  });
}

export function login(ctx, { email = '', error, next }) {
  return layout(ctx, {
    title: 'Log in',
    active: 'login',
    body: html`
      <div class="auth">
        <h1>Welcome back</h1>
        <p class="lede">Log in to make your picks.</p>
        ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
        <form class="form" method="post" action="/login">
          ${csrfField(ctx)}
          ${next ? html`<input type="hidden" name="next" value="${next}">` : ''}
          <label>Email<input type="email" name="email" value="${email}" autocomplete="email" required maxlength="254"></label>
          <label>Password<input type="password" name="password" autocomplete="current-password" required maxlength="200"></label>
          <button class="btn block">Log in</button>
        </form>
        <p class="fine"><a href="/forgot">Forgot your password?</a></p>
        <p class="fine">New here? <a href="/signup${next ? `?next=${encodeURIComponent(next)}` : ''}">Make an account</a></p>
      </div>
    `,
  });
}

export function forgot(ctx, { email = '', error, sent }) {
  return layout(ctx, {
    title: 'Forgot password',
    body: html`
      <div class="auth">
        <h1>Forgot your password?</h1>
        ${sent
          ? html`<p class="lede">If ${email} has an account, a link to set a new password is on its way. It works once, for the next hour. Check spam if it doesn't show up in a few minutes.</p>
            <a class="btn ghost block" href="/login">Back to log in</a>`
          : html`<p class="lede">Put in the email you signed up with and we'll send a link to set a new one.</p>
            ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
            <form class="form" method="post" action="/forgot">
              ${csrfField(ctx)}
              <label>Email<input type="email" name="email" value="${email}" autocomplete="email" required maxlength="254"></label>
              <button class="btn block">Send the link</button>
            </form>
            <p class="fine"><a href="/login">Back to log in</a></p>`}
      </div>
    `,
  });
}

export function reset(ctx, { token, error }) {
  return layout(ctx, {
    title: 'New password',
    body: html`
      <div class="auth">
        <h1>Set a new password</h1>
        <p class="lede">This signs you out everywhere else.</p>
        ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
        <form class="form" method="post" action="/reset">
          ${csrfField(ctx)}
          <input type="hidden" name="token" value="${token}">
          <label>New password <span class="hint">At least 8 characters.</span>
            <input type="password" name="password" autocomplete="new-password" required minlength="8" maxlength="200"></label>
          <button class="btn block">Save password</button>
        </form>
      </div>
    `,
  });
}

export function resetDead(ctx) {
  return layout(ctx, {
    title: 'Link expired',
    body: html`
      <div class="auth">
        <h1>That link has expired</h1>
        <p class="lede">Reset links work once, for an hour. Ask for a fresh one.</p>
        <a class="btn block" href="/forgot">Send a new link</a>
      </div>
    `,
  });
}

export function welcome(ctx, { name = '', error, next, firstName = '', lastName = '' }) {
  return layout(ctx, {
    title: 'Pick a screen name',
    body: html`
      <div class="auth">
        <h1>Pick your screen name</h1>
        <p class="lede">It's how you show up on leaderboards and in groups. It stays with your record, so pick one you'll want to keep.</p>
        ${error ? html`<div class="flash err" role="alert">${error}</div>` : ''}
        <form class="form" method="post" action="/welcome">
          ${csrfField(ctx)}
          ${next ? html`<input type="hidden" name="next" value="${next}">` : ''}
          <label>Screen name <span class="hint">3 to 20 letters, numbers or underscores.</span>
            <input type="text" name="screen_name" value="${name}" autocomplete="nickname" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" autocapitalize="off" spellcheck="false"></label>
          <div class="pair">
            <label>First name <span class="hint">Optional</span>
              <input type="text" name="first_name" value="${firstName}" autocomplete="given-name" maxlength="40"></label>
            <label>Last name <span class="hint">Optional</span>
              <input type="text" name="last_name" value="${lastName}" autocomplete="family-name" maxlength="40"></label>
          </div>
          <p class="muted small">A name shows on your profile next to your screen name. Leave it blank to go by your screen name alone.</p>
          <button class="btn block">Lock it in</button>
        </form>
      </div>
    `,
  });
}

export function verifyDead(ctx) {
  return layout(ctx, {
    title: 'Link expired',
    body: html`
      <div class="auth">
        <h1>That link has expired</h1>
        <p class="lede">Confirm links work for a week, once. Log in and we'll send a fresh one from the banner at the top.</p>
        <a class="btn block" href="/login">Log in</a>
      </div>
    `,
  });
}

export function notFound(ctx) {
  return layout(ctx, {
    title: 'Not found',
    body: html`<div class="card empty"><h1>Nothing here</h1><p>That page doesn't exist, or it isn't yours to see.</p><a class="btn quiet" href="/">Home</a></div>`,
  });
}

export function problem(ctx, { status = 500, text }) {
  return layout(ctx, {
    title: 'Something broke',
    body: html`<div class="card empty"><h1>${status === 403 ? 'Not allowed' : status === 429 ? 'Slow down' : 'Something broke'}</h1><p>${text ?? 'Try that again in a minute.'}</p><a class="btn quiet" href="/">Home</a></div>`,
  });
}
