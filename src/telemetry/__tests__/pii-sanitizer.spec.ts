import { describe, it, expect } from 'vitest';
import { sanitizeErrorMessage, stripUrlQuery } from '../pii-sanitizer';

describe('sanitizeErrorMessage', () => {
  it('redacts email addresses', () => {
    expect(sanitizeErrorMessage('User user@example.com failed')).toBe(
      'User [REDACTED] failed',
    );
  });

  it('redacts Bearer token inline', () => {
    expect(sanitizeErrorMessage('Got Authorization: Bearer eyJfoo.bar.baz')).toContain(
      '[REDACTED]',
    );
    expect(sanitizeErrorMessage('Got Authorization: Bearer eyJfoo.bar.baz')).not.toContain(
      'eyJfoo',
    );
  });

  it('redacts JWT-shaped strings', () => {
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.signature123abc';
    const result = sanitizeErrorMessage(`Token was ${jwt} in body`);
    expect(result).not.toContain('eyJhbGciOiJSUzI1NiJ9');
    expect(result).toContain('[REDACTED]');
  });

  it('does not redact safe messages', () => {
    const safe = 'Connection timeout after 30s on /api/schedules';
    expect(sanitizeErrorMessage(safe)).toBe(safe);
  });

  it('handles empty string gracefully', () => {
    expect(sanitizeErrorMessage('')).toBe('');
  });

  it('handles multiple PII occurrences in one message', () => {
    const msg = 'a@b.com and c@d.com both failed';
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain('@');
    expect(result).toContain('[REDACTED]');
  });
});

describe('stripUrlQuery', () => {
  it('strips query string', () => {
    expect(stripUrlQuery('https://api.example.com/api/vibes?token=abc&page=1')).toBe(
      'https://api.example.com/api/vibes',
    );
  });

  it('strips fragment', () => {
    expect(stripUrlQuery('https://api.example.com/api/vibes#section')).toBe(
      'https://api.example.com/api/vibes',
    );
  });

  it('leaves clean URLs unchanged', () => {
    expect(stripUrlQuery('https://api.example.com/api/schedules')).toBe(
      'https://api.example.com/api/schedules',
    );
  });

  it('handles malformed URLs gracefully', () => {
    expect(stripUrlQuery('/relative/path?foo=bar')).toBe('/relative/path');
  });

  it('handles empty string', () => {
    expect(stripUrlQuery('')).toBe('');
  });
});
