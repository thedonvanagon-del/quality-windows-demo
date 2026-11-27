// Checks on the shell's settings that are easy to break by hand and slow to
// notice (a store build to find out). Run with `npm test` in mobile/.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const config = createRequire(import.meta.url)('../capacitor.config.js');

test('the app is LockBox and loads the live site', () => {
  assert.equal(config.appId, 'com.bookiebullies.lockbox');
  assert.equal(config.appName, 'LockBox');
  assert.equal(config.server.url, 'https://app.bookiebullies.com');
  assert.deepEqual(config.server.allowNavigation, ['app.bookiebullies.com'], 'only the app itself loads inside the app');
  assert.equal(config.server.cleartext, false);
  assert.match(config.appendUserAgent, /\bLockBoxApp\b/);
  assert.match(config.ios.appendUserAgent, /\bLockBoxApp LockBoxPush\b/);
  assert.match(config.android.appendUserAgent, /^LockBoxApp( LockBoxPush)?$/);
});

test('a dev build can point at another server', () => {
  const out = execFileSync(process.execPath, ['-e', "const c = require('./capacitor.config.js'); console.log(JSON.stringify([c.server.url, c.server.allowNavigation, c.server.cleartext]))"], {
    cwd: root,
    env: { ...process.env, LOCKBOX_URL: 'http://10.0.2.2:3000/' },
  });
  assert.deepEqual(JSON.parse(out), ['http://10.0.2.2:3000', ['10.0.2.2:3000'], true]);
});

test('the offline page is there, says why, and tries again', () => {
  const page = read(`www/${config.server.errorPath}`);
  assert.match(page, /No connection\. LockBox needs the internet to load your board\./);
  assert.match(page, />Try again</);
  assert.match(page, /https:\/\/app\.bookiebullies\.com\//);
  assert.ok(fs.existsSync(path.join(root, 'www', 'crest.png')));
});

test('Android: push permission, the Game alerts channel, and no Firebase secrets in git', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(manifest, /default_notification_channel_id/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(read('android/app/src/main/res/values/strings.xml'), /<string name="notification_channel_id" translatable="false">game_alerts<\/string>/);
  assert.match(read('android/app/src/main/res/values/strings.xml'), /<string name="notification_channel_name">Game alerts<\/string>/);
  assert.match(read('android/.gitignore'), /^google-services\.json$/m);
  assert.match(read('android/.gitignore'), /^\*\.jks$/m);
  assert.match(read('android/app/build.gradle'), /ANDROID_KEYSTORE_FILE/);
});

test('iOS: push entitlement, iPhone only, a reason for each permission it can ask for', () => {
  const plist = read('ios/App/App/Info.plist');
  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  assert.match(read('ios/App/App/App.entitlements'), /<key>aps-environment<\/key>/);
  assert.equal((project.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) ?? []).length, 2, 'Debug and Release');
  assert.equal((project.match(/TARGETED_DEVICE_FAMILY = 1;/g) ?? []).length, 2, 'iPhone only for version 1');
  assert.match(plist, /NSCameraUsageDescription/, 'a profile photo can be taken with the camera');
  assert.match(plist, /NSPhotoLibraryAddUsageDescription/, 'Share as image offers Save Image');
  assert.doesNotMatch(plist, /UIBackgroundModes/, 'plain alerts need no background mode');
  assert.doesNotMatch(plist, /NSLocation|NSMicrophone|NSContacts/, 'nothing the app never asks for');
  assert.match(read('ios/App/App/AppDelegate.swift'), /capacitorDidRegisterForRemoteNotifications/);
  assert.ok(fs.existsSync(path.join(root, 'ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme')), 'a shared scheme for CI');
  assert.ok(!fs.existsSync(path.join(root, 'ios/App/Podfile')), 'Swift Package Manager, no CocoaPods');
});

test('the App Store icon is 1024 square with no transparency', () => {
  const png = fs.readFileSync(path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  // Color type 2 is RGB, no alpha channel (Apple rejects an icon with one).
  assert.equal(png[25], 2);
});
