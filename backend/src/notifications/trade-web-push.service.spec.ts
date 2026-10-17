import { BadRequestException } from '@nestjs/common';
import { validatedPushEndpoint } from './trade-web-push.service';

describe('Web Push endpoint validation / SSRF protection', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-by3p.notify.windows.com/?token=abc',
  ])('accepts known browser push origins: %s', (endpoint) => {
    expect(validatedPushEndpoint(endpoint)).toBe(endpoint);
  });

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'http://127.0.0.1/private',
    'https://localhost/private',
    'https://10.0.0.1/private',
    'https://fcm.googleapis.com.attacker.test/abc',
    'https://fcm.googleapis.com:8443/send',
    'https://evil.example.com/abc',
  ])('rejects untrusted push destinations: %s', (endpoint) => {
    expect(() => validatedPushEndpoint(endpoint)).toThrow(BadRequestException);
  });
});
