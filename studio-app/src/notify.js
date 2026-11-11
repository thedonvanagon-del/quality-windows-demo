// Every email the studio sends, plus the .ics calendar file. Plain text on
// purpose: it lands in inboxes and never looks like spam. A failed send is
// logged and never breaks a booking.

import { formatDay, formatTime, formatDuration } from './time.js';
import { money } from './html.js';

export function createNotifier({ mailer, config, getSettings, tz, log = console }) {
  async function send(to, subject, text) {
    try {
      await mailer.send({ to, subject, text });
    } catch (err) {
      log.error(`email to ${to} failed: ${err.message}`);
    }
  }
  const base = () => config.appUrl ?? '';
  const when = (a) => {
    const s = new Date(a.starts_at);
    return `${formatDay(s, tz)} at ${formatTime(s, tz)}`;
  };
  const what = (a) => [a.service_name, ...a.addons.map((x) => `+ ${x.name}`)].join(' ');
  const owners = () => config.adminEmails;

  return {
    send,

    code: (email, code, minutes) => send(email, `${code} is your sign-in code`,
      `Your code for ${getSettings().studio_name} is ${code}.\n\nIt works for ${minutes} minutes. If you did not ask for it, ignore this email.`),

    confirmed(a) {
      const s = getSettings();
      const where = s.address ? `Where: ${s.address}\n${s.arrival_notes}\n\n` : '';
      return send(a.client_email, `You're booked: ${what(a)}, ${when(a)}`,
        `Hi ${firstName(a.client_name)},\n\nYou're all set at ${s.studio_name}.\n\n${what(a)}\n${when(a)} (${formatDuration((Date.parse(a.ends_at) - Date.parse(a.starts_at)) / 60000)})\nTotal: ${money(a.price_cents)}, paid at your visit\n\n${where}Need to change it? Manage your appointment here: ${base()}/appointments/${a.id}\nFree changes until ${s.cancel_window_hours} hours before.\n\nSee you soon,\n${s.esthetician_name}`);
    },

    moved(a) {
      const s = getSettings();
      return send(a.client_email, `Your appointment moved to ${when(a)}`,
        `Hi ${firstName(a.client_name)},\n\nYour ${what(a)} is now ${when(a)}.\n\nManage it here: ${base()}/appointments/${a.id}\n\n${s.esthetician_name}`);
    },

    cancelled(a, by) {
      const s = getSettings();
      return send(a.client_email, `Cancelled: ${a.service_name}, ${when(a)}`,
        `Hi ${firstName(a.client_name)},\n\n${by === 'admin' ? `I had to cancel your ${what(a)} on ${when(a)}. I'm so sorry.` : `Your ${what(a)} on ${when(a)} is cancelled.`}\n\nBook a new time any time: ${base()}/book\n\n${s.esthetician_name}`);
    },

    reminder(a) {
      const s = getSettings();
      const where = s.address ? `Where: ${s.address}\n${s.arrival_notes}\n\n` : '';
      return send(a.client_email, `Tomorrow: ${a.service_name} at ${formatTime(new Date(a.starts_at), tz)}`,
        `Hi ${firstName(a.client_name)},\n\nA reminder: ${what(a)}, ${when(a)}.\n\n${where}Need to change it? ${base()}/appointments/${a.id}\n\n${s.esthetician_name}`);
    },

    /** Tells the owner(s) something happened. */
    tellOwner(subject, text) {
      return Promise.all(owners().map((to) => send(to, subject, text)));
    },
  };
}

export function bookingSummaryForOwner(a, tz) {
  const s = new Date(a.starts_at);
  const phone = a.client_phone ? `\nPhone: ${a.client_phone}` : '';
  const note = a.client_note ? `\nTheir note: ${a.client_note}` : '';
  return `${a.client_name || a.client_email} (${a.client_email})${phone}\n${a.service_name}${a.addons.map((x) => ` + ${x.name}`).join('')}\n${formatDay(s, tz)} at ${formatTime(s, tz)}${note}`;
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

// ---- calendar file ----

const icsStamp = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function appointmentIcs(a, settings, host = 'studio') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Studio Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:appointment-${a.id}@${host}`,
    `DTSTAMP:${icsStamp(a.created_at)}`,
    `DTSTART:${icsStamp(a.starts_at)}`,
    `DTEND:${icsStamp(a.ends_at)}`,
    `SUMMARY:${icsText(`${a.service_name} at ${settings.studio_name}`)}`,
    ...(settings.address ? [`LOCATION:${icsText(settings.address)}`] : []),
    `DESCRIPTION:${icsText([settings.arrival_notes, `Change or cancel free until ${settings.cancel_window_hours} hours before.`].filter(Boolean).join('\n'))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}
