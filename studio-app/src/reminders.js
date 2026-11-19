// Day-before reminder emails. Runs on a timer (see server.js). Only visits
// booked more than 24 hours ahead get one: someone who books for tomorrow
// morning already has a fresh confirmation.

import { getAppointment } from './booking.js';

const DAY = 86_400_000;

export async function sendReminders({ store, notifier, now = new Date() }) {
  const due = store.all(
    `SELECT a.id FROM appointments a JOIN users u ON u.id = a.user_id
      WHERE a.status = 'booked' AND a.reminder_sent_at IS NULL AND u.email_reminders = 1
        AND a.starts_at > ? AND a.starts_at <= ?`,
    now.toISOString(), new Date(now.getTime() + DAY).toISOString(),
  );
  let sent = 0;
  for (const { id } of due) {
    const a = getAppointment(store, id);
    if (Date.parse(a.created_at) > Date.parse(a.starts_at) - DAY) continue;
    store.run('UPDATE appointments SET reminder_sent_at = ? WHERE id = ?', now.toISOString(), id);
    await notifier.reminder(a);
    sent += 1;
  }
  return sent;
}
