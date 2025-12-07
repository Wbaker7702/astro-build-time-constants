import crypto from 'crypto';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { enforceSecurityOnConfig, verifyJwtToken, JWT_SECRET_ENV, JWT_TOKEN_ENV } from '../src/security';

const BASE_DATE = new Date('2025-01-01T00:00:00.000Z');

function createHs256Token(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const headerSegment = encode(header);
  const payloadSegment = encode(payload);
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signingInput}.${signature}`;
}

afterEach(() => {
  delete process.env[JWT_SECRET_ENV];
  delete process.env[JWT_TOKEN_ENV];
  vi.restoreAllMocks();
});

describe('enforceSecurityOnConfig', () => {
  it('throws when a blocked key is detected', () => {
    expect(() => enforceSecurityOnConfig({ apiSecret: 'value' })).toThrow(/apiSecret/);
  });

  it('allows allow-listed secret keys', () => {
    expect(() =>
      enforceSecurityOnConfig(
        { apiSecret: 'value' },
        { secrets: { allowList: ['custom.apiSecret'] } },
      ),
    ).not.toThrow();
  });

  it('warns instead of throwing when mode is set to warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    enforceSecurityOnConfig(
      { password: 'value' },
      { secrets: { mode: 'warn' } },
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('verifyJwtToken', () => {
  it('validates signed tokens with issuer and audience checks', () => {
    const secret = 'top-secret';
    const token = createHs256Token(
      {
        iss: 'astro',
        aud: 'builder',
        exp: Math.floor(BASE_DATE.getTime() / 1000) + 60,
      },
      secret,
    );

    const result = verifyJwtToken(
      { token, secret, issuer: 'astro', audience: 'builder' },
      BASE_DATE,
    );

    expect(result.payload.aud).toBe('builder');
  });

  it('reads token and secret from environment variables automatically', () => {
    process.env[JWT_SECRET_ENV] = 'env-secret';
    process.env[JWT_TOKEN_ENV] = createHs256Token(
      {
        exp: Math.floor(BASE_DATE.getTime() / 1000) + 60,
      },
      process.env[JWT_SECRET_ENV] as string,
    );

    const result = verifyJwtToken({}, BASE_DATE);
    expect(result.payload.exp).toBeGreaterThan(Math.floor(BASE_DATE.getTime() / 1000));
  });
});
