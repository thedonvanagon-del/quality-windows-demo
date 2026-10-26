import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanLink } from '../src/links.js';

test('names well-known sites and keeps a custom label', () => {
  assert.deepEqual(cleanLink('https://t.me/sharpshooter', ''), { url: 'https://t.me/sharpshooter', label: 'Telegram' });
  assert.deepEqual(cleanLink('instagram.com/sharp', ''), { url: 'https://instagram.com/sharp', label: 'Instagram' });
  assert.equal(cleanLink('https://x.com/sharp').label, 'X');
  assert.equal(cleanLink('https://discord.gg/abc').label, 'Discord');
  assert.equal(cleanLink('https://sharppicks.com', '').label, 'Website');
  assert.equal(cleanLink('https://sharppicks.com', '  Get my   picks ').label, 'Get my picks');
});

test('clears on empty and refuses anything but a web address', () => {
  assert.deepEqual(cleanLink('   ', 'x'), { url: null, label: null });
  assert.match(cleanLink('javascript:alert(1)').error, /regular web address/);
  assert.match(cleanLink('data:text/html,hi').error, /regular web address/);
  assert.match(cleanLink('https://user:pass@evil.com').error, /regular web address/);
  assert.match(cleanLink('localhost').error, /regular web address/);
  assert.match(cleanLink(`https://a.com/${'x'.repeat(200)}`).error, /too long/);
  assert.match(cleanLink('https://a.com', 'x'.repeat(31)).error, /30 characters/);
});
