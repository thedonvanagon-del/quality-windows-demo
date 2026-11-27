# Studio booking

Online booking for a home-studio esthetician. Clients pick a service, see
what's actually open, sign in with their email, and book. She runs the day from
a schedule page. The flow follows what clients already know from GlossGenius:
menu, calendar, time slots, a profile, easy changes.

No packages to install. It's Node 22 with its built-in SQLite, the same way the
Bookie Bullies app (`../picks-app`) runs, so it fits on the same server.

## Try it

```bash
cd studio-app
npm run demo
```

Open http://localhost:3100. Demo mode fills in sample clients and bookings and
shows each sign-in code on screen instead of emailing it. Sign in as
`owner@example.com` to see the owner pages.

```bash
npm test
```

## What clients get

- **Menu** by category (Facials, Lashes, Waxing) with price, length, and a
  "before you come" note per service (like "no retinoids for 3 days").
- **Add-ons** (brow wax with a facial, LED light) that add time and price.
- **Live availability**: a month calendar of open days, then start times. A
  time disappears the moment someone books it, and two people can't take the
  same slot.
- **Sign in with an emailed 6-digit code**, or create a profile with a
  password. No account exists until the email is confirmed.
- **Health check once**, before the first visit, with a signed consent. Kept
  on file; editable under My visits.
- **Change or cancel** from their own page. Free until the cutoff she sets
  (24 hours by default); inside it they're asked to text, and a late cancel is
  flagged for her.
- **Emails**: confirmation, reminder the day before, change and cancel notices.
  A calendar file (.ics) to add the visit to their phone.
- The **street address is private**. The public site shows only the
  neighborhood. The address and arrival notes come with the confirmation.

## What she gets

Everything under **Schedule** after signing in with her email:

- **Schedule**: a week at a time, with each visit's client, phone, add-ons,
  their note, and **health flags** (pregnant, Accutane, rosacea, allergies...)
  right on the appointment. Mark done, no-show, move, cancel (the client is
  emailed). Private notes per visit.
- **Book a client**: for people who text her. Can go outside normal hours;
  can't double-book.
- **Clients**: search, health form, her private skin notes, visit history.
- **Menu**: add, edit, hide services and add-ons. Prices, lengths, a "best for" line, prep notes.
- **Hours**: weekly hours with split days (lunch), plus time off for trips.
- **Settings**: studio name, tagline, her bio, address, arrival notes, phone,
  Instagram, policies, and the booking rules (notice, how far ahead, cleanup
  time between clients, start-time spacing).

The first boot starts with a sample menu and hours (Tue to Sat) so it isn't
empty. **The names, prices and times are placeholders.** Change all of it in the
owner pages.

## Photos

The site uses six photos from `public/`. **Right now they are free stock
placeholders from Unsplash** (free to use under the Unsplash License, no
credit required). Swap in her own photos by replacing the files with the
same names, then redeploy:

| File | Where it shows | Best shape |
|---|---|---|
| `hero.jpg` | Top of the home page | Landscape, 4:3. Her at work, or the treatment room. |
| `facials.jpg`, `lashes.jpg`, `waxing.jpg` | The three service cards | Landscape, about 10:7 |
| `about.jpg` | Next to her bio | Portrait, 4:5. A photo of her. |
| `first-visit.jpg` | "Your first visit" section | Landscape, 3:2. The room, the entrance or her products. |

Keep each under about 300 KB (1400 px wide is plenty) so the site stays fast on
phones. Only use client photos (before and after) with written permission.

Sources of the placeholders, for the record: images.unsplash.com photo IDs
1512290923902-8a9f81dc236c (hero), 1570172619644-dfd03ed5d881 (facials),
1531746020798-e6953c6e8e04 (lashes), 1540555700478-4be289fbecef (waxing),
1573461160327-b450ce3d8e7f (about), 1576426863848-c21f53c60b19 (first visit).

## Not built yet

- **Online payment and deposits.** Everything is paid at the visit. Cards on
  file, deposits and no-show fees are the big GlossGenius feature this lacks.
  Stripe is the usual next step; say the word.
- Text-message reminders (email only today).
- A photo gallery, uploading photos from the owner pages, gift cards, packages (a 3-session microneedling series).
- Syncing to Google Calendar (the .ics file works one visit at a time).
- More than one practitioner.

## Settings that live on the server

Business details are edited in the app. Only these come from the environment
(`/etc/studio-app.env` on the server):

| Variable | What it does |
|---|---|
| `ADMIN_EMAILS` | Who is the owner. Comma-separated. **Required**, or nobody can open the owner pages. |
| `APP_URL` | Public address, like `https://book.example.com`. Required once email is on. |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Outgoing email. For Google Workspace: `smtp.gmail.com`, her address, an [app password](https://myaccount.google.com/apppasswords). **Without these, sign-in codes are only printed to the log and nobody can sign in.** |
| `TIMEZONE` | Default `America/Los_Angeles`. |
| `DATABASE_PATH` | Default `data/studio.db`. |
| `PORT`, `HOST`, `TRUST_PROXY` | The setup script sets these for the server. |

## Putting it online (on the server you already have)

It goes on the same Lightsail server as the Bookie Bullies app: a second
service on port 3100 and a second Caddy site, which gets its own https
certificate. The first app is not touched. You need a domain or subdomain
for it, like `book.yourdomain.com`.

1. **DNS.** Add an A record for that name pointing at the server's static IP
   (the same one `app.bookiebullies.com` uses).
2. **Server setup, once.** From AWS CloudShell, or any shell that can SSH in
   (`ssh -i bb-deploy ubuntu@<ip>`), with this repo checked out:
   ```bash
   sudo bash studio-app/deploy/setup-on-server.sh book.yourdomain.com her-email@yourdomain.com
   ```
   It makes the service and the data folder, writes `/etc/studio-app.env`,
   and adds one block to the Caddyfile (after saving a backup of it).
3. **Ship the code.** Either let GitHub do it: in this repo's Settings,
   Secrets and variables, Actions, add variables `STUDIO_HOST` (the server IP)
   and `STUDIO_URL` (`https://book.yourdomain.com`). It reuses the
   `APP_SSH_KEY` secret from the picks app. Then each merge to `main` deploys
   it. Or by hand:
   ```bash
   tar czf - -C studio-app package.json src public | ssh -i ~/bb-deploy ubuntu@<ip> \
     'tar xzf - -C /opt/studio-app && sudo systemctl restart studio-app'
   ```
4. **Turn on email.** On the server, fill in the `SMTP_` lines in
   `/etc/studio-app.env`, then `sudo systemctl restart studio-app`.
5. **Sign in as the owner.** Go to the site, Sign in, use the `ADMIN_EMAILS`
   address, enter the code from the email. You'll see **Schedule** in the menu.
   Start with Settings, Menu and Hours.

The code lives in `/opt/studio-app`, the database in
`/var/lib/studio-app/studio.db`, logs in `sudo journalctl -u studio-app`.
The server's nightly Lightsail snapshot already covers the database, because it
covers the whole machine. **Client records and health forms are in that file;
treat it that way.**

## Security notes

- Passwords are hashed with scrypt. Sessions are random tokens in an HttpOnly,
  SameSite cookie; the database keeps only a hash. Signing in starts a fresh
  session.
- Every form carries a CSRF token. A strict Content-Security-Policy is on, and
  the site runs one tiny script of its own (the "are you sure?" on cancel).
- Sign-in codes expire in 10 minutes, die after 5 wrong tries, and are capped
  at 5 an hour per address.
- Nobody can claim someone else's address: an account is only created after the
  emailed code is entered. The owner view needs that proof, so a password alone
  never opens it. To anyone else the owner pages don't exist (404).
- Health forms are sensitive. They're visible only to the client and the owner,
  and aren't in any email.

## Things for her to check

- **What her license covers.** Microneedling depth and which devices an
  esthetician may use differ by state. In California, confirm against the Board
  of Barbering and Cosmetology before listing it. The site doesn't make claims
  about results or medical benefits; keep it that way.
- **The health form and policies** are reasonable starting text, not legal
  advice. Edit them to match how she works.
- Prices, durations and hours here are examples.

## How it's built

`src/availability.js` works out open times, `src/booking.js` changes the
schedule (always re-checking inside one database transaction), `src/routes-*.js`
are the pages, `src/views.js` and `public/style.css` are the look. Dates are
stored in UTC and shown in the studio's time zone, daylight saving included.
