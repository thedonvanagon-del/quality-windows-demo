import { html } from '../html.js';
import { layout } from './layout.js';

// Plain-language first drafts. Have a lawyer read them before relying on them.
const UPDATED = 'October 30, 2026';

function page(ctx, title, body) {
  return layout(ctx, {
    title,
    body: html`<article class="legal">
      <h1>${title}</h1>
      <p class="muted small">Last updated ${UPDATED}</p>
      ${body}
    </article>`,
  });
}

export function terms(ctx, { contact }) {
  const app = ctx.app.name;
  return page(ctx, 'Terms of Use', html`
    <p>These terms cover your use of ${app}. By making an account you agree to them. If you don't agree, don't use ${app}.</p>

    <h2>What ${app} is</h2>
    <p>${app} is a free game for tracking sports picks. You pick games, the app records the line at that moment, and it grades the pick off the final score. <strong>No real money is wagered, held, won or paid out here.</strong></p>

    <h2>Who can use it</h2>
    <p>You have to be 21 or older. One account per person. Keep your password to yourself; you're responsible for what happens on your account.</p>

    <h2>Picks are not advice</h2>
    <p>Picks, records and leaderboards on ${app} are for entertainment. Nothing here is betting, financial or professional advice, and past results don't predict future ones. If you bet with a sportsbook, that's between you and the sportsbook, and it's your call. If gambling stops being fun, call 1-800-GAMBLER.</p>

    <h2>Lines, scores and grading</h2>
    <p>Games, lines and scores come from public sports data. It's usually right, but not always. ${app} grades picks automatically, voids picks on postponed or canceled games, and may correct a grade that came from bad data. A pick can't be changed or deleted once its game starts.</p>

    <h2>Your profile and your link</h2>
    <p>Your screen name, bio, link, record and started picks are public. If you link to a place where you sell picks, that sale is between you and your buyers; ${app} isn't part of it and doesn't take payment. Don't claim "guaranteed" or "lock" wins, don't pretend to be someone else, and don't post anything illegal, hateful or harassing.</p>

    <h2>Game chat</h2>
    <p>Each game has a public chat. What you post there is public and signed with your screen name. Keep it about the games: no harassment, hate, threats, spam, or selling picks in chat (your profile link is the place for that). You can delete your own messages. Messages that several players report are hidden until we look at them.</p>

    <h2>When we can step in</h2>
    <p>We can remove content, reset a record built on bad data or cheating, or close accounts that break these terms. We can change or end features, or ${app} itself.</p>

    <h2>No warranty</h2>
    <p>${app} is provided as is. We don't promise it will always be up, error-free, or that data will never be lost. To the extent the law allows, we aren't liable for losses from using it, including any bets you place elsewhere.</p>

    <h2>Changes</h2>
    <p>We may update these terms. If the change matters, we'll say so in the app. Using ${app} after that means you accept the new terms.</p>

    <h2>Contact</h2>
    <p>Questions: <a href="mailto:${contact}">${contact}</a></p>
  `);
}

export function privacy(ctx, { contact }) {
  const app = ctx.app.name;
  return page(ctx, 'Privacy Policy', html`
    <p>This says what ${app} collects, why, and what you can do about it.</p>

    <h2>What we collect</h2>
    <ul>
      <li><strong>Account:</strong> your email, a scrambled (hashed) copy of your password, your screen name, and, only if you add them, your first and last name, bio and a link.</li>
      <li><strong>Picks:</strong> every pick you make, the line and time it was locked, and how many units you played.</li>
      <li><strong>Settings:</strong> your app color and the groups you're in.</li>
      <li><strong>Chat:</strong> messages you post in game chats, and any reports you make.</li>
      <li><strong>Follows and notifications:</strong> who you follow, your notification settings and inbox, and, if you turn on phone notifications, the delivery address your phone's browser gives us (from Apple, Google, Mozilla or Microsoft). Messages to your phone are encrypted so only your phone can read them.</li>
      <li><strong>Basics to keep the app working:</strong> a sign-in cookie, and your IP address for a short time to stop password guessing and spam signups.</li>
    </ul>
    <p>We don't ask for your address, phone number, payment details or ID, and we don't use ad trackers.</p>

    <h2>Who sees what</h2>
    <ul>
      <li><strong>Everyone:</strong> your screen name, name (if you added one), bio, link, record, picks once their game has started, your chat messages, and how many followers you have.</li>
      <li><strong>Only you:</strong> your email, and your open picks before their games start.</li>
      <li><strong>Your groups:</strong> members see each other's started picks and records.</li>
    </ul>

    <h2>What we do with it</h2>
    <p>Run the game: record and grade picks, build leaderboards, and send the emails you need (confirming your address, resetting your password). We don't sell your information or share it for advertising.</p>

    <h2>Where it lives</h2>
    <p>On our server in the United States, with nightly backups. Emails go out through our email provider. Team logos load from ESPN's image server, which sees that your device requested them.</p>

    <h2>Deleting your account</h2>
    <p>You can delete your account any time from your profile, under Delete account. That removes your account, picks, chat messages and settings. Copies can stay in nightly backups for up to 30 days before they roll off.</p>

    <h2>Age</h2>
    <p>${app} is for people 21 and older. If we learn an account belongs to someone younger, we delete it.</p>

    <h2>Changes and contact</h2>
    <p>If this policy changes in a way that matters, we'll say so in the app. Questions or requests: <a href="mailto:${contact}">${contact}</a></p>
  `);
}
