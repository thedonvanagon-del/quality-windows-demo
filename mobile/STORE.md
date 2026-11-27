# LockBox in the App Store and Google Play

Everything you need to list LockBox, answer the stores' questions, and get
through review. The app itself is built (`mobile/`, see README.md); what's
left needs your accounts. Work down **Your steps, in order** at the bottom.

---

## The listing

Copy these as they are. Character counts are checked.

### Both stores

| Field | Text | Limit |
|---|---|---|
| App name (Apple) / Title (Google) | `LockBox: Sports Pick Tracker` | 28 of 30 |
| Category | **Sports** (Apple secondary: Entertainment) | |
| Price | Free. No in-app purchases. No ads. | |
| Support URL | https://app.bookiebullies.com (or a page with your contact email) | |
| Privacy policy URL | https://app.bookiebullies.com/privacy | |
| Marketing URL (Apple, optional) | https://www.bookiebullies.com | |

"Lockbox" alone is a common word (key safes, password apps), which is why
the name carries "Sports Pick Tracker". Search the App Store, Google Play
and USPTO for "LockBox" in sports and games before you submit.

### Apple only

**Subtitle** (30 of 30):
```
Free pick'em with real records
```

**Promotional text** (160 of 170; you can change it any time without a review):
```
Make your picks before the game. They lock at the start, grade off the final score, and stay on your record for good. Free, no real money, just bragging rights.
```

**Keywords** (97 of 100; commas, no spaces, nothing already in the name):
```
pickem,handicapper,capper,record,leaderboard,survivor,bracket,football,basketball,hockey,baseball
```
Don't add league names (NFL, NBA, MLB, NHL) or sportsbook names: they're
other companies' trademarks, and Apple rejects keywords that use them
(guideline 2.3.7). The words already in the name (LockBox, Sports, Pick,
Tracker) are searched anyway.

### Google only

**Short description** (70 of 80):
```
Free pick'em and pick tracker. Picks lock at the start. No real money.
```

### Description (both stores; about 2,000 of 4,000)

```
LockBox is a free pick'em and pick tracker for people who want to know who actually picks best. Made to show the true skill of real handicappers with nothing to hide.

Every pick is on the record for good:
• Picks take the line on the board right then. Nobody types in their own number.
• Picks lock when the game starts. Delete one before then; after that it stays.
• Picks grade off the final score, automatically.
• Your open picks stay hidden from everyone else until the game starts, so nobody can copy or fade them early.

Your record, in units:
• Size each pick from half a unit to five. Boards rank by units won, not just wins and losses, so long shots and heavy favorites don't look the same.
• Your profile shows your record, units, win rate, ROI, last 10, how often you beat the closing line, and every pick with the time it was locked. Losses included.
• Share your profile link or a picture of your record card.

Play with friends, or everyone:
• Leaderboards for everyone and for each sport: last 7 days, 30 days or all time.
• Chat rooms: private groups with an invite code, and a public room for your city.
• Game chat while games are on.
• Follow players and see their picks once each game starts.

Free contests and tournaments:
• A free weekly contest, with a winners wall.
• Free tournaments, or make your own for your group.
• NFL Survivor, NFL Pick'em against the spread, head-to-head leagues, and a March Madness bracket.
• The streak game: one Streak pick a day.

Sports: NFL, college football, NBA, college basketball, MLB and NHL. Spreads, totals, moneylines and parlays.

Notifications when your bets settle, when players you follow lock a pick, and when games you follow start, swing or finish.

No real money. LockBox is not a sportsbook: there are no deposits, no wagers and no payouts, and nothing in the app is for sale. Picks are sized in units, not dollars. For people 21 and older. If gambling stops being fun, call 1-800-GAMBLER.

By BOOKIEBULLIES.COM.
```

The league names in the description are fine (they say what the app covers);
it's keywords where Apple doesn't allow them.

---

## Age rating

### Apple (App Store Connect → App Information → Age Rating)

Answer:

| Question | Answer | Why |
|---|---|---|
| Simulated Gambling | **Frequent/Intense** | Odds, lines and "units" on every screen. |
| Contests | **Yes** | Free weekly contest, tournaments, prize tournaments. |
| Gambling (real money) | **No** | Nothing is wagered or paid out. |
| User-Generated Content | **Yes** | Chat, profiles, bios, photos, player-made tournaments. |
| Messaging and Chat | **Yes** | Game, group, city and tournament chat. |
| Unrestricted Web Access | **Yes** | A player's profile link opens in an in-app browser. (The rating is the top one anyway.) |
| Everything else (violence, sexual content, profanity, drugs, horror, medical) | **None** | |

Simulated gambling at Frequent/Intense puts the app at Apple's top rating
(17+ on the old scale, 18+ on the scale Apple brought in during 2025). The
app itself asks for 21+ at signup, which is stricter; nothing more to do.

### Google (Play Console → Policy → App content → Content rating, the IARC form)

Category: **Reference, News or Educational? No. Game? No** → pick
**"All other app types"** (it's a sports utility, not a game).

| Question | Answer |
|---|---|
| Violence, fear, sexuality, language, drugs | No |
| Gambling-related: does the app feature simulated gambling? | **Yes** |
| Does it offer real-money gambling? | **No** |
| Users can interact or exchange content (chat, posts, photos) | **Yes** |
| Shares the user's current physical location with other users | **No** (a home city a player picks isn't the phone's location) |
| Allows purchases of digital goods | **No** |
| Is it a web browser or search engine | **No** |

Expect 18+ / PEGI 18 / Mature. Then, under **Target audience and
content**, pick **18 and over** only. Under **Ads**, say **No ads**.

---

## Privacy answers

What the app actually stores (checked against the code, `src/db.js`):
email, a hashed password, screen name, optional first and last name, bio,
outside link, profile and cover photos (location and camera details
stripped on the server), home city (picked from a list), picks, chat
messages, follows, groups, reports, notification settings and inbox, the
web push address or app push token, and session cookies. **Not** stored:
phone number, street address, payment details, contacts, the phone's
location, advertising IDs. The IP address is used in memory only, to rate
limit logins and signups, and isn't saved. No analytics, no ad SDKs, no
tracking.

### Apple: App Privacy ("nutrition label")

**Do you or your partners collect data from this app? Yes.** For every type
below: **Linked to the user: Yes. Used for tracking: No. Purpose: App
Functionality** (nothing for advertising, analytics or product
personalization).

| Data type | Collected? | Notes |
|---|---|---|
| Contact Info → Email Address | Yes | Account and password resets. |
| Contact Info → Name | Yes | Optional first and last name. |
| User Content → Photos or Videos | Yes | Optional profile and cover photo. |
| User Content → Other User Content | Yes | Picks, bio, link, chat messages, home city, tournaments a player makes. |
| Identifiers → User ID | Yes | The account and screen name. |
| Location | No | The home city is picked from a list, not read from the phone. |
| Usage Data, Diagnostics, Financial Info, Health, Contacts, Browsing/Search History, Sensitive Info | No | |

Push tokens aren't a declared type (Apple treats them as part of delivering
notifications). Tracking: **No**; the app doesn't need the App Tracking
Transparency prompt.

### Google: Data safety form

**Does your app collect or share any of the required user data types? Yes.**
**Is all of the user data collected by your app encrypted in transit? Yes.**
**Do you provide a way for users to request that their data is deleted? Yes**,
in the app (profile → Delete account) and on the web:
`https://app.bookiebullies.com/privacy` (the "Deleting your account" section;
Google wants a web link that works without the app).

Shared with third parties: **None.** (Push messages pass through Google and
Apple to reach the phone, which Google counts as a service provider, not
sharing. Posting in chat is the player's own choice, which isn't "sharing"
either.)

| Category → type | Collected | Required or optional | Purpose |
|---|---|---|---|
| Personal info → Email address | Yes | Required | Account management, App functionality |
| Personal info → Name | Yes | Optional | App functionality |
| Personal info → User IDs | Yes | Required | Account management, App functionality |
| Photos and videos → Photos | Yes | Optional | App functionality |
| Messages → Other in-app messages | Yes | Optional | App functionality |
| Location → Approximate location | Yes | Optional | App functionality (the home city a player picks) |
| App activity → Other user-generated content | Yes | Required | App functionality (picks, bio, tournaments) |
| App activity → Other actions | Yes | Required | App functionality (follows, notification settings) |
| Device or other IDs | Yes | Optional | App functionality (the push token, only with notifications on) |

Everything else: not collected. Data processed only in memory (the IP
address for rate limits) doesn't need to be declared.

---

## App Review notes

Paste into App Store Connect → the version → **App Review Information →
Notes**, and into Play Console → **App access** (with the login).

**Sign-in information:**
```
Email: (create before submitting, see step 11 below)
Password: (create before submitting)
```

**Notes:**
```
LockBox is a free pick'em and pick tracker. Players pick real games (spreads, totals, moneylines) at the line shown, the pick locks when the game starts, and it grades off the final score. Records and leaderboards are in "units", not money.

No real money is involved anywhere. There are no deposits, wagers, payouts, purchases or ads, and nothing in the app is for sale. Signup asks players to confirm they are 21 or older.

The demo account above has a record, open picks, groups and tournament entries, so every screen has something on it. Games and lines come from live schedules, so the board changes through the day.

Where things are:
- Report: the flag on any chat message; "Report photo" / "Report cover" on another player's profile; "Report" on a player-made tournament. Three reports hide the item until an admin reviews it in the admin queue.
- Block: on another player's profile.
- Delete account: your profile (the avatar at the top right), at the bottom, "Delete account" (asks for the password, deletes the account, picks, chat and photos).
- Terms of Use and Privacy Policy: links at the bottom of every page.

Prize tournaments: occasionally a free tournament carries a prize from a named sponsor (Bookie Bullies LLC or a partner). They are free to enter (no purchase necessary), skill-based (best units over the window), and each has official rules in the app (the tournament page → Official rules) that state Apple Inc. and Google LLC are not sponsors and are not involved in any way.

Native features: push notifications for settled bets and followed games (asked for only after the player follows a game or turns them on), haptic feedback when a pick locks, an offline screen, the in-app browser for outside links, and the share sheet for record cards.

Links to www.bookiebullies.com go to our own free picks site, which takes no bets.
```

Before submitting, check that "Block" exists on profiles (it was being built
alongside this work), that at least one prize tournament's rules page shows
the "Apple and Google are not sponsors" section, and that the demo account
has open picks on games still to come (reviewers can take days).

---

## Screenshots

### Plan

Six screens, in this order (each tells one thing):

1. **The board**: live games with your pick on them, and the Today's Locks card.
2. **The pick slip**: the line, the price, units, "Lock it in".
3. **LOCKED**: the ticket, "Once it's in, it's on the record."
4. **Your record**: record, units, the units line, win rate, ROI, rank.
5. **The leaderboard**: ranked by units.
6. **Tournaments**: Survivor, Pick'em, March Madness, all free.

### Sizes

- **Apple:** iPhone only for version 1 (the project is set to iPhone; an
  iPad listing would need iPad screenshots and an iPad-tested layout).
  Apple needs the **6.9-inch** set (1320 × 2868); the **6.5-inch** set
  (1284 × 2778) is optional but included. Apple scales them for smaller
  iPhones.
- **Google:** 2 to 8 phone screenshots, each side between 320 and 3840 px
  and the long side no more than twice the short one, so not the iPhone
  ones (2778/1284 is over 2). The Google set is 1080 × 2160. Plus a
  **1024 × 500 feature graphic** and a **512 × 512 icon**.

### Made (in `mobile/store/`)

```
screenshots/iphone-6.9/01-board.png … 06-tournaments.png      1320×2868
screenshots/iphone-6.5/01-board.png … 06-tournaments.png      1284×2778
google-play/phone-screenshots/01-board.png … 06-tournaments.png  1080×2160
google-play/feature-graphic-1024x500.png
google-play/icon-512.png
```

All RGB PNGs with no transparency (both stores reject alpha in screenshots),
200 to 460 KB each. They come from the demo (`npm run demo`), captured as
the app shows pages (no Get the app prompts, no launch screen) by
`store/tools/shots.mjs`; the feature graphic by `store/tools/feature.mjs`.

**Team logos in these are stand-ins** (colored circles with the team's
letters): ESPN's logo server wasn't reachable where they were made. That's
safer for review anyway: real NFL, NBA, MLB and NHL logos in store
screenshots can draw a trademark question (guideline 5.2.1). If you'd rather
show real logos, retake them on a phone, or run `store/tools/shots.mjs`
without `STANDIN_LOGOS`.

The demo's names (Sharpshooter, Buddha Beans) are made up. Fine for
screenshots; never in the live app.

---

## Things App Review may flag

Ranked by how likely they are to come up.

1. **"It's a website in a wrapper" (guideline 4.2, minimum functionality).**
   The app loads app.bookiebullies.com. What answers it: native push, the
   haptic tap on a lock, the offline screen, the native share sheet, the
   in-app browser, and a full app's worth of features. Say so in the review
   notes (done above). If it's rejected anyway, the usual fix is more native
   surface: home-screen widgets for your record, or Sign in with Apple.
2. **Simulated gambling and the look of a sportsbook (5.3).** Odds, "Lock it
   in", the LOCKED ticket and the name "Bookie Bullies" all read as betting.
   The answers: no money anywhere, units not dollars, the 21+ gate, the
   footer ("Just picks, no betting here. 21+. 1-800-GAMBLER"), and the top
   age rating. The slip's "Line from ESPN BET via ESPN" names a real
   sportsbook; that's a source credit, not a link, but if a reviewer pushes
   on it, drop the book's name.
3. **User-generated content (1.2).** Apple wants all four: a way to
   **filter** objectionable content, **report** it, **block** abusive users,
   and **published contact info**. Report: built. Block: being built now.
   Contact: the Terms and Privacy pages. **Filter: not built** (chat has no
   word filter). Add at least a slur list on chat, bios, screen names and
   tournament names before submitting, and add a line to the Terms: "There's
   no tolerance for objectionable content or abusive users; we remove it and
   ban them."
4. **Outside links that sell picks (3.1.1 / 3.1.3).** A player's profile can
   carry a "Get my picks" button to Whop, Patreon or a paid Telegram. That's
   a link out to buy digital content without in-app purchase. Since May 2025
   Apple must allow such links on the US storefront, and LockBox sells
   nothing itself, but a reviewer outside the US may still flag it. If it
   comes up, hide the profile link button inside the app (the server already
   knows it's the app from `ctx.isNativeApp`) and keep it on the web.
5. **Links to www.bookiebullies.com** (the Locks card, the LOCKED ticket's
   "See the model's picks", More). Fine as long as that site takes no bets
   and doesn't push sportsbook sign-ups. If it carries sportsbook
   affiliate links, expect a 5.3 question.
6. **Prize tournaments (5.3.2).** Apple wants official rules in the app
   that say Apple isn't a sponsor or involved. **Added**: the generated
   official rules now have an "Apple and Google are not sponsors" section.
   Still open (from BRAIN.md): a lawyer reviews the rules, writes the
   limitation-of-liability section (a placeholder today) and checks state
   rules (New York and Florida registration and bond above certain prize
   values). The sponsor named in each prize tournament has to be the real
   one: Bookie Bullies LLC once the LLC exists.
7. **Team names and logos (5.2.1).** The app shows ESPN's team logos. Sports
   apps do this widely and in-app use is rarely questioned, but keep league
   logos out of the screenshots and the icon (they are), and league names
   out of the keywords (they are).
8. **The demo account must work and have content** (2.1). Reviewers are
   often outside the US and in a different time zone; check it the day you
   submit.

Google Play is usually less strict on all of these. Its own must-dos: the
Data safety form, the content rating, target audience 18+, a working login
under App access, and the account-deletion web link.

---

## Your steps, in order

1. **LLC.** Finish forming Bookie Bullies LLC. Both stores' organization
   accounts list the legal entity as the seller; the app shows "Bookie
   Bullies LLC" as its developer.
2. **D-U-N-S number** for the LLC (free from Dun & Bradstreet, via Apple's
   lookup page: developer.apple.com/enroll/duns-lookup). It can take a week
   or two to show up in Apple's system after D&B issues it.
3. **Apple Developer Program, as an organization** ($99 a year):
   developer.apple.com/programs/enroll. Needs the D-U-N-S number, a website
   on the LLC's domain (bookiebullies.com), and an Apple ID with two-factor
   on. Apple may call to verify. Note the **Team ID** (Membership page).
4. **App Store Connect app record:** My Apps → + → New App. Platform iOS,
   name "LockBox: Sports Pick Tracker", language English (U.S.), bundle ID
   **com.bookiebullies.lockbox** (register it first under Certificates,
   Identifiers & Profiles → Identifiers, with **Push Notifications** ticked),
   SKU `lockbox-ios`.
5. **APNs key (.p8):** Certificates, Identifiers & Profiles → Keys → + →
   tick **Apple Push Notifications service (APNs)** → download
   `AuthKey_XXXXXXXXXX.p8` (only downloadable once; keep a copy somewhere
   safe). Note its **Key ID**.
6. **App Store Connect API key** (for the release workflow): App Store
   Connect → Users and Access → Integrations → App Store Connect API → +,
   role **App Manager**. Download the `.p8`, note the **Key ID** and the
   **Issuer ID**.
7. **Google Play Console, as an organization** ($25 once):
   play.google.com/console/signup. Needs the D-U-N-S number and identity
   checks. (An organization account skips the "20 testers for 14 days" rule
   that new personal accounts have.)
8. **Firebase project for Android push:** console.firebase.google.com → Add
   project "LockBox" (Analytics off) → Add app → Android, package
   **com.bookiebullies.lockbox** → download **google-services.json**. Then
   Project settings → Service accounts → **Generate new private key** (a
   JSON file for the server).
9. **Android upload key** (one time, on any computer with Java):
   ```
   keytool -genkeypair -v -keystore lockbox-upload.jks -alias lockbox \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
   Keep the file and both passwords somewhere safe (a password manager).
   Google Play App Signing holds the real signing key; this one only signs
   uploads, and Google can reset it if it's lost.
10. **Keys on the server** (`picks-app/README.md`, "Turning on push for the
    App Store and Google Play apps"): the APNs `.p8` and the Firebase
    service-account JSON in `/etc/bookie-bullies-app/`, and in
    `/etc/bookie-bullies-app.env`:
    `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_FILE`,
    `FCM_SERVICE_ACCOUNT_FILE`. Restart, and check the log says
    "native push on for iPhone" and "native push on for Android".
11. **The review account:** sign up in the live app as something like
    review@bookiebullies.com, confirm the email, make a few picks, join a
    group and a tournament. Put the login in both stores' review notes.
12. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
    | Secret | What |
    |---|---|
    | `APPLE_TEAM_ID` | Team ID (step 3) |
    | `ASC_KEY_ID` | App Store Connect API Key ID (step 6) |
    | `ASC_ISSUER_ID` | Issuer ID (step 6) |
    | `ASC_KEY_P8_BASE64` | the API `.p8`, base64: `base64 -i AuthKey_X.p8` (Mac) or `base64 -w0 AuthKey_X.p8` |
    | `ANDROID_KEYSTORE_BASE64` | `base64 -w0 lockbox-upload.jks` |
    | `ANDROID_KEYSTORE_PASSWORD` | step 9 |
    | `ANDROID_KEY_ALIAS` | `lockbox` |
    | `ANDROID_KEY_PASSWORD` | step 9 |
    | `GOOGLE_SERVICES_JSON` | the whole google-services.json (step 8) |
13. **Build:** Actions → **mobile ios** → Run workflow, tick **release**. The
    build lands in App Store Connect → TestFlight in 10 to 30 minutes.
    Actions → **mobile android** → Run workflow, tick **release**; download
    the `lockbox-release-aab` artifact.
14. **Test on real phones:** TestFlight (iPhone) and a Play Console internal
    testing track (upload the AAB there first). Check: login, a pick and
    the haptic tap, notifications (follow a game; settle a pick), the
    offline screen (airplane mode), Android's back button, logout.
15. **Fill in the listings** from this file: text, screenshots, age rating,
    privacy answers, review notes. Apple: also the **Content Rights**
    question (the app shows third-party content: ESPN's public scores,
    lines and team logos; answer it honestly, and ask the lawyer from the
    prize-tournament review if unsure) and **Export compliance** (already
    answered in the app: standard HTTPS only).
16. **Submit.** Apple: Add for Review. Google: promote the internal build to
    Production. First reviews take a day to a week; answer questions in
    Resolution Center (Apple) or by email (Google) with the notes above.
17. **After approval:** point bookiebullies.app at a page that sends
    iPhones to the App Store and Androids to Google Play (BRAIN.md has the
    note), and update `/install` to link to the stores.
