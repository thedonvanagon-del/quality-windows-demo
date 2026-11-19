// The one outside link a player can put on their profile. Only plain web
// addresses, and a short label that defaults to the site's name.

export const LINK_LABEL_MAX = 30;

const KNOWN = [
  [/(^|\.)t\.me$|(^|\.)telegram\.(me|org)$/, 'Telegram'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(x|twitter)\.com$/, 'X'],
  [/(^|\.)discord\.(gg|com)$/, 'Discord'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'YouTube'],
  [/(^|\.)patreon\.com$/, 'Patreon'],
  [/(^|\.)whop\.com$/, 'Whop'],
];

/** { url, label } for a link someone typed, or { error }. Empty input clears it. */
export function cleanLink(rawUrl, rawLabel) {
  let text = String(rawUrl ?? '').trim();
  const label = String(rawLabel ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { url: null, label: null };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: "That link doesn't look right. Paste the whole address." };
  }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) {
    return { error: 'Use a regular web address, like https://t.me/yourname.' };
  }
  if (url.href.length > 200) return { error: 'That link is too long. Keep it under 200 characters.' };
  if (label.length > LINK_LABEL_MAX) return { error: `Keep the button label to ${LINK_LABEL_MAX} characters.` };
  const host = url.hostname.toLowerCase();
  return { url: url.href, label: label || (KNOWN.find(([re]) => re.test(host))?.[1] ?? 'Website') };
}
