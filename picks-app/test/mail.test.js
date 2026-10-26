import assert from 'node:assert/strict';
import net from 'node:net';
import { test } from 'node:test';

import { createMailer } from '../src/mail.js';

/** A tiny SMTP server that answers like Gmail and records what it was told. */
async function fakeSmtp({ authCode = 235 } = {}) {
  const seen = { commands: [], data: '' };
  const server = net.createServer((socket) => {
    let inData = false;
    let buffer = '';
    socket.write('220 smtp.example.test ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            socket.write('250 2.0.0 OK queued\r\n');
          } else seen.data += `${line}\n`;
          continue;
        }
        seen.commands.push(line);
        if (line.startsWith('EHLO')) socket.write('250-smtp.example.test\r\n250-AUTH PLAIN LOGIN\r\n250 SMTPUTF8\r\n');
        else if (line.startsWith('AUTH')) socket.write(authCode === 235 ? '235 2.7.0 Accepted\r\n' : '535 5.7.8 Username and Password not accepted\r\n');
        else if (line.startsWith('MAIL') || line.startsWith('RCPT')) socket.write('250 OK\r\n');
        else if (line === 'DATA') { inData = true; socket.write('354 Go ahead\r\n'); }
        else if (line === 'QUIT') { socket.write('221 Bye\r\n'); socket.end(); }
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { seen, port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}

test('sends a message the way Gmail expects', async () => {
  const smtp = await fakeSmtp();
  const mailer = createMailer({ host: '127.0.0.1', port: smtp.port, secure: false, user: 'hello@bookiebullies.com', pass: 'app-pass', from: 'Bookie Bullies <hello@bookiebullies.com>' });
  await mailer.send({ to: 'ann@example.com', subject: 'Reset your password', text: 'Hi Ann\n.starts with a dot\nBye' });
  await smtp.close();
  assert.equal(smtp.seen.commands[0], 'EHLO bookiebullies.com');
  assert.equal(smtp.seen.commands[1], `AUTH PLAIN ${Buffer.from('\0hello@bookiebullies.com\0app-pass').toString('base64')}`);
  assert.deepEqual(smtp.seen.commands.slice(2, 5), ['MAIL FROM:<hello@bookiebullies.com>', 'RCPT TO:<ann@example.com>', 'DATA']);
  assert.match(smtp.seen.data, /^From: Bookie Bullies <hello@bookiebullies\.com>$/m);
  assert.match(smtp.seen.data, /^Subject: Reset your password$/m);
  assert.match(smtp.seen.data, /\n\.\.starts with a dot\n/, 'a leading dot is doubled');
});

test('says why when the server turns down the login', async () => {
  const smtp = await fakeSmtp({ authCode: 535 });
  const mailer = createMailer({ host: '127.0.0.1', port: smtp.port, secure: false, user: 'x', pass: 'y', from: 'x@y.co' });
  await assert.rejects(mailer.send({ to: 'a@b.co', subject: 'Hi', text: 'Hi' }), /AUTH answered 535/);
  await smtp.close();
});

test('refuses a header with a line break in it', async () => {
  const mailer = createMailer({ host: '127.0.0.1', port: 1, secure: false, from: 'x@y.co' });
  await assert.rejects(mailer.send({ to: 'a@b.co\r\nBcc: c@d.co', subject: 'Hi', text: 'Hi' }), /line breaks/);
});

test('prints the message when no mail server is set', async () => {
  const lines = [];
  await createMailer({ log: { log: (l) => lines.push(l) } }).send({ to: 'a@b.co', subject: 'Hi', text: 'Body' });
  assert.match(lines[0], /to a@b\.co[\s\S]*Body/);
});
