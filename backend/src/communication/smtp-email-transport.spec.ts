import { buildSmtpMimeMessage } from './smtp-email-transport';

describe('SMTP email MIME builder', () => {
  const config = {
    fromEmail: 'no-reply@fixtradezone.example',
    fromName: 'FixTradeZone',
  };

  it('builds a base64 plain-text message with required headers', () => {
    const mime = buildSmtpMimeMessage(config, {
      to: 'user@example.com',
      subject: 'Security update',
      text: 'Your account security settings changed.',
    });

    expect(mime).toContain(
      'From: "FixTradeZone" <no-reply@fixtradezone.example>',
    );
    expect(mime).toContain('To: <user@example.com>');
    expect(mime).toContain('Subject: Security update');
    expect(mime).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(mime).toContain('Content-Transfer-Encoding: base64');
    expect(mime).not.toContain('Your account security settings changed.');
  });

  it('creates multipart alternative content when HTML is provided', () => {
    const mime = buildSmtpMimeMessage(config, {
      to: 'user@example.com',
      subject: 'Verify email',
      text: 'Verify your email address.',
      html: '<p>Verify your email address.</p>',
    });

    expect(mime).toContain('Content-Type: multipart/alternative;');
    expect(mime).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(mime).toContain('Content-Type: text/html; charset=UTF-8');
  });

  it('sanitizes header newlines instead of allowing header injection', () => {
    const mime = buildSmtpMimeMessage(config, {
      to: 'user@example.com\r\nBcc: attacker@example.com',
      subject: 'Safe subject\r\nX-Evil: injected',
      text: 'hello',
    });

    expect(mime).not.toContain('\r\nBcc: attacker@example.com');
    expect(mime).not.toContain('\r\nX-Evil: injected');
    expect(mime).toContain('Bcc: attacker@example.com');
    expect(mime).toContain('X-Evil: injected');
  });
});
