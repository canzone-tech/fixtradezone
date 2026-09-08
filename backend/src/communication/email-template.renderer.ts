import type { EmailMessage } from './communication.types';

interface ActionTemplateInput {
  to: string;
  displayName: string;
  actionUrl: string;
  ttlMinutes: number;
}

interface DeliveryTestTemplateInput {
  to: string;
  actorUsername: string;
  triggeredAt: Date;
}

export interface ManagedEmailTemplateInput {
  to: string;
  subject: string;
  preheader: string;
  headline: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  footer: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeDisplayName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || 'FixTradeZone user';
}

function brandedHtml(input: {
  preheader: string;
  heading: string;
  displayName?: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  footer: string;
}): string {
  const greeting = input.displayName
    ? `<tr><td style="padding:8px 32px;color:#c9d3e2;font-size:15px;line-height:1.7">Hi ${escapeHtml(safeDisplayName(input.displayName))},</td></tr>`
    : '';
  const action =
    input.actionLabel && input.actionUrl
      ? `<tr><td style="padding:8px 32px 24px"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#66e3c4;color:#071019;text-decoration:none;font-weight:800;padding:13px 20px;border-radius:10px">${escapeHtml(input.actionLabel)}</a></td></tr>`
      : '';

  return [
    '<!doctype html>',
    '<html><body style="margin:0;background:#070b14;font-family:Arial,Helvetica,sans-serif;color:#e8edf7">',
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>`,
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070b14;padding:28px 12px"><tr><td align="center">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#0f1726;border:1px solid #24324a;border-radius:16px;overflow:hidden">',
    '<tr><td style="padding:24px 32px;background:#111d30;border-bottom:1px solid #24324a">',
    '<div style="font-size:20px;font-weight:900;letter-spacing:.4px">FixTradeZone</div>',
    '<div style="margin-top:5px;font-size:11px;letter-spacing:1.8px;color:#7f91aa">SECURE ACCOUNT MESSAGE</div>',
    '</td></tr>',
    `<tr><td style="padding:30px 32px 10px"><div style="font-size:24px;line-height:1.25;font-weight:800">${escapeHtml(input.heading)}</div></td></tr>`,
    greeting,
    `<tr><td style="padding:4px 32px 18px;color:#c9d3e2;font-size:15px;line-height:1.7">${input.body}</td></tr>`,
    action,
    `<tr><td style="padding:20px 32px 28px;border-top:1px solid #24324a;color:#7f91aa;font-size:12px;line-height:1.6">${escapeHtml(input.footer)}</td></tr>`,
    '</table></td></tr></table>',
    '</body></html>',
  ].join('');
}

export function renderManagedEmailTemplate(
  input: ManagedEmailTemplateInput,
): EmailMessage {
  const actionLine =
    input.actionLabel && input.actionUrl
      ? `${input.actionLabel}: ${input.actionUrl}`
      : null;
  const escapedBody = escapeHtml(input.body).replaceAll('\n', '<br>');

  return {
    to: input.to,
    subject: input.subject.trim(),
    text: [
      input.headline,
      '',
      input.body,
      ...(actionLine ? ['', actionLine] : []),
      '',
      input.footer,
    ].join('\n'),
    html: brandedHtml({
      preheader: input.preheader,
      heading: input.headline,
      body: escapedBody,
      actionLabel: input.actionLabel,
      actionUrl: input.actionUrl,
      footer: input.footer,
    }),
  };
}

export function renderEmailVerificationTemplate(
  input: ActionTemplateInput,
): EmailMessage {
  const displayName = safeDisplayName(input.displayName);
  const ttlMinutes = Math.max(1, Math.trunc(input.ttlMinutes));

  return {
    to: input.to,
    subject: 'Verify your FixTradeZone account',
    text: [
      `Hi ${displayName},`,
      '',
      'Verify your email address to activate your FixTradeZone account:',
      input.actionUrl,
      '',
      `This verification link expires in ${ttlMinutes} minutes.`,
      'If you did not create this account, you can ignore this message.',
      '',
      'FixTradeZone Security',
    ].join('\n'),
    html: brandedHtml({
      preheader:
        'Verify your email address to activate your FixTradeZone account.',
      heading: 'Verify your email address',
      displayName,
      body: `Confirm this email address to activate your account. This verification link expires in <strong>${ttlMinutes} minutes</strong>.`,
      actionLabel: 'Verify Email',
      actionUrl: input.actionUrl,
      footer:
        'If you did not create this account, you can ignore this message. Never share verification links or security codes.',
    }),
    managedTemplate: {
      contentKey: 'EMAIL_VERIFICATION',
      values: {
        displayName,
        verificationUrl: input.actionUrl,
        expiresInMinutes: String(ttlMinutes),
      },
      actionUrl: input.actionUrl,
    },
  };
}

export function renderPasswordResetTemplate(
  input: ActionTemplateInput,
): EmailMessage {
  const displayName = safeDisplayName(input.displayName);
  const ttlMinutes = Math.max(1, Math.trunc(input.ttlMinutes));

  return {
    to: input.to,
    subject: 'Reset your FixTradeZone password',
    text: [
      `Hi ${displayName},`,
      '',
      'A password reset was requested for your FixTradeZone account.',
      input.actionUrl,
      '',
      `This reset link expires in ${ttlMinutes} minutes and can be used once.`,
      'If you did not request this change, you can ignore this message.',
      '',
      'FixTradeZone Security',
    ].join('\n'),
    html: brandedHtml({
      preheader:
        'A password reset was requested for your FixTradeZone account.',
      heading: 'Reset your password',
      displayName,
      body: `Use the secure button below to choose a new password. This link expires in <strong>${ttlMinutes} minutes</strong> and can be used once.`,
      actionLabel: 'Reset Password',
      actionUrl: input.actionUrl,
      footer:
        'If you did not request this password reset, you can ignore this message. Never share password-reset links or account credentials.',
    }),
    managedTemplate: {
      contentKey: 'PASSWORD_RESET',
      values: {
        displayName,
        resetUrl: input.actionUrl,
        expiresInMinutes: String(ttlMinutes),
      },
      actionUrl: input.actionUrl,
    },
  };
}

export function renderEmailDeliveryTestTemplate(
  input: DeliveryTestTemplateInput,
): EmailMessage {
  const actorUsername = safeDisplayName(input.actorUsername);
  const timestamp = input.triggeredAt.toISOString();

  return {
    to: input.to,
    subject: 'FixTradeZone email delivery test',
    text: [
      'FixTradeZone email delivery test succeeded.',
      '',
      `Triggered by ${actorUsername}.`,
      `Time: ${timestamp}`,
      '',
      'This message confirms that the configured email transport accepted a test message.',
    ].join('\n'),
    html: brandedHtml({
      preheader: 'FixTradeZone email transport test accepted.',
      heading: 'Email delivery test succeeded',
      displayName: actorUsername,
      body: `The configured email transport accepted this diagnostic message at <strong>${escapeHtml(timestamp)}</strong>.`,
      footer:
        'This diagnostic message was triggered from the FixTradeZone SUPER_ADMIN email-delivery workspace.',
    }),
    managedTemplate: {
      contentKey: 'DELIVERY_TEST',
      values: {
        requestedBy: actorUsername,
        triggeredAt: timestamp,
      },
    },
  };
}
