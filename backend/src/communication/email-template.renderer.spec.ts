import {
  renderEmailDeliveryTestTemplate,
  renderEmailVerificationTemplate,
  renderPasswordResetTemplate,
} from './email-template.renderer';

describe('email template renderer', () => {
  it('renders branded verification text and html with an escaped recipient name', () => {
    const message = renderEmailVerificationTemplate({
      to: 'user@example.com',
      displayName: '<script>alert(1)</script>',
      actionUrl: 'https://app.fixtradezone.com/verify-email?token=abc123',
      ttlMinutes: 30,
    });

    expect(message.subject).toBe('Verify your FixTradeZone account');
    expect(message.text).toContain(
      'https://app.fixtradezone.com/verify-email?token=abc123',
    );
    expect(message.html).toContain('FixTradeZone');
    expect(message.html).toContain('Verify Email');
    expect(message.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(message.html).not.toContain('<script>alert(1)</script>');
  });

  it('renders the password-reset single-use and expiry contract', () => {
    const message = renderPasswordResetTemplate({
      to: 'user@example.com',
      displayName: 'Test User',
      actionUrl: 'https://app.fixtradezone.com/reset-password?token=reset-token',
      ttlMinutes: 20,
    });

    expect(message.subject).toBe('Reset your FixTradeZone password');
    expect(message.text).toContain('20 minutes and can be used once');
    expect(message.html).toContain('Reset Password');
    expect(message.html).toContain('20 minutes');
  });

  it('renders a deterministic diagnostic message without exposing transport secrets', () => {
    const message = renderEmailDeliveryTestTemplate({
      to: 'owner@example.com',
      actorUsername: 'superadmin',
      triggeredAt: new Date('2026-09-05T06:00:00.000Z'),
    });

    expect(message.subject).toBe('FixTradeZone email delivery test');
    expect(message.text).toContain('superadmin');
    expect(message.text).toContain('2026-09-05T06:00:00.000Z');
    expect(message.html).toContain('Email delivery test succeeded');
  });
});
