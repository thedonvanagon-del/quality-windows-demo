import { html } from '../html.js';

const PX = { xs: 20, '': 26, big: 44, huge: 76 };

/**
 * A player's face: their photo when they have one (and it isn't hidden),
 * else the initial in a circle, exactly as before photos. `user` has
 * `screen_name` (or `screenName`) and `photo`; `size` is '', 'xs', 'big' or 'huge'.
 */
export function avatar(user, size = '') {
  const name = String(user?.screen_name ?? user?.screenName ?? '?');
  const cls = size ? `avatar ${size}` : 'avatar';
  if (user?.photo) {
    const px = PX[size] ?? PX[''];
    return html`<img class="${cls} photo" src="/media/${user.photo}" alt="" width="${px}" height="${px}" loading="lazy" decoding="async">`;
  }
  return html`<span class="${cls}">${name[0]}</span>`;
}
