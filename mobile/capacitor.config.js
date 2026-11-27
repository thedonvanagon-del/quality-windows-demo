// LockBox for iPhone and Android. The app is a native shell that loads the
// live site, https://app.bookiebullies.com; nothing of the server-rendered app
// is bundled. www/ only holds the offline page shown when the site can't load.
//
// Plain CommonJS (no TypeScript to install). The Capacitor CLI reads it on
// every `npx cap sync` and writes the result into each native project.

const fs = require('node:fs');
const path = require('node:path');

// LOCKBOX_URL points a dev build at another server, like a laptop running
// `npm run demo` (http://10.0.2.2:3000 from the Android emulator). Store
// builds always use the real site.
const SITE = (process.env.LOCKBOX_URL || 'https://app.bookiebullies.com').replace(/\/+$/, '');
const host = new URL(SITE).host;

// Android push needs Firebase's google-services.json (never committed). A
// build without it says so in its user agent, and the page never asks for
// push there: registering without Firebase would fail. iOS needs nothing
// extra at build time (without the APNs entitlement, registering just fails).
const androidPush = fs.existsSync(path.join(__dirname, 'android', 'app', 'google-services.json'));

// The server reads "LockBoxApp" to hide its Get the app prompts. Never trusted
// for anything that matters: anyone can send any user agent.
const UA = 'LockBoxApp';

/** @type {import('@capacitor/cli').CapacitorConfig} */
module.exports = {
  appId: 'com.bookiebullies.lockbox',
  appName: 'LockBox',
  webDir: 'www',
  backgroundColor: '#0a1228',
  appendUserAgent: `${UA} LockBoxPush`,
  server: {
    url: SITE,
    // Only the app's own site loads inside the app. Anything else (the
    // www.bookiebullies.com picks site, ESPN, a player's outside link) opens
    // in the system browser: the page sends off-site links to the Browser
    // plugin, and Capacitor itself sends any other navigation out.
    allowNavigation: [host],
    // Shown when the site can't load (no signal, server down).
    errorPath: 'offline.html',
    cleartext: SITE.startsWith('http://'),
  },
  android: {
    appendUserAgent: androidPush ? `${UA} LockBoxPush` : UA,
    allowMixedContent: false,
  },
  ios: {
    appendUserAgent: `${UA} LockBoxPush`,
    contentInset: 'never',
    backgroundColor: '#0a1228',
    // Swipe back and forward like Safari.
    allowsBackForwardNavigationGestures: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      launchFadeOutDuration: 250,
      backgroundColor: '#0a1228',
      showSpinner: false,
      androidScaleType: 'CENTER_INSIDE',
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      // "Dark" means light text, for a dark page.
      style: 'DARK',
      backgroundColor: '#0a1228',
      overlaysWebView: false,
    },
    PushNotifications: {
      // While the app is open, still show the banner and play the sound.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};
