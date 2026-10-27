// Sends plain-text email over SMTP. Built for Google Workspace (smtp.gmail.com,
// port 465, an app password), but any SMTP server on implicit TLS works.
// With no SMTP_HOST set, messages are printed to the log instead, which is
// what you want on a laptop.

import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

export function createMailer({ host, port = 465, user, pass, from, secure = true, log = console } = {}) {
  if (!host) {
    return {
      configured: false,
      async send({ to, subject, text }) {
        log.log(`[mail not sent: no SMTP_HOST] to ${to}\nSubject: ${subject}\n\n${text}`);
      },
    };
  }
  return {
    configured: true,
    send: (message) => deliver({ host, port, user, pass, from, secure }, message),
  };
}

async function deliver(opts, { to, subject, text }) {
  if (/[\r\n]/.test(to + subject)) throw new Error('mail headers cannot contain line breaks');
  const fromAddress = /<([^>]+)>/.exec(opts.from)?.[1] ?? opts.from;
  const socket = opts.secure
    ? tls.connect({ host: opts.host, port: opts.port, servername: opts.host })
    : net.connect({ host: opts.host, port: opts.port });
  socket.setTimeout(15_000, () => socket.destroy(new Error('SMTP server timed out')));
  const replies = replyReader(socket);
  const step = async (line, ...ok) => {
    if (line != null) socket.write(`${line}\r\n`);
    const { code, text: said } = await replies.next();
    if (!ok.includes(code)) throw new Error(`SMTP ${line?.split(' ')[0] ?? 'greeting'} answered ${code} ${said}`);
  };
  try {
    await step(null, 220);
    await step(`EHLO ${fromAddress.split('@')[1] ?? 'localhost'}`, 250);
    if (opts.user) await step(`AUTH PLAIN ${Buffer.from(`\0${opts.user}\0${opts.pass ?? ''}`).toString('base64')}`, 235);
    await step(`MAIL FROM:<${fromAddress}>`, 250);
    await step(`RCPT TO:<${to}>`, 250, 251);
    await step('DATA', 354);
    const body = [
      `From: ${opts.from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@${fromAddress.split('@')[1] ?? 'localhost'}>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      // A line starting with a dot gets a second one, so it can't end the message early.
      ...text.replace(/\r?\n/g, '\n').split('\n').map((l) => (l.startsWith('.') ? `.${l}` : l)),
    ].join('\r\n');
    await step(`${body}\r\n.`, 250);
    socket.write('QUIT\r\n');
  } finally {
    socket.end();
  }
}

/** Reads whole SMTP replies (multi-line ones end on "250 ..." after "250-..."). */
function replyReader(socket) {
  let buffer = '';
  let waiting = null;
  let failure = null;
  const ready = [];
  const take = () => {
    for (;;) {
      const end = buffer.indexOf('\r\n');
      if (end < 0) return;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      (take.lines ??= []).push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        ready.push({ code: Number(line.slice(0, 3)), text: take.lines.map((l) => l.slice(4)).join(' ') });
        take.lines = [];
      }
    }
  };
  const settle = () => {
    if (!waiting) return;
    if (ready.length) waiting.resolve(ready.shift());
    else if (failure) waiting.reject(failure);
    else return;
    waiting = null;
  };
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    buffer += chunk;
    take();
    settle();
  });
  socket.on('error', (err) => {
    failure = err;
    settle();
  });
  socket.on('close', () => {
    failure ??= new Error('SMTP server closed the connection');
    settle();
  });
  return {
    next: () => new Promise((resolve, reject) => {
      waiting = { resolve, reject };
      settle();
    }),
  };
}
