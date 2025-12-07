import crypto from 'crypto';
import type {
  BuildTimeConstantsConfigType,
  JwtHeader,
  JwtPayload,
  JwtSecurityOptions,
  JwtVerificationResult,
  SecretValidationMode,
  SecretValidationOptions,
  SecurityOptions,
  SupportedJwtAlgorithm,
} from './types';

const DEFAULT_SECRET_BLOCKLIST = ['secret', 'password', 'token', 'credential', 'passphrase', 'privatekey', 'apikey'];
const PROHIBITED_PROPERTY_NAMES = new Set(['__proto__', 'prototype', 'constructor']);
const HASH_ALGORITHM_BY_JWT_ALG: Record<SupportedJwtAlgorithm, string> = {
  HS256: 'sha256',
  HS384: 'sha384',
  HS512: 'sha512',
};
const DEFAULT_SECRET_MODE: SecretValidationMode = 'error';

export const JWT_TOKEN_ENV = 'ASTRO_BUILD_TIME_TOKEN';
export const JWT_SECRET_ENV = 'ASTRO_BUILD_TIME_SECRET';

interface SecretScanOptions {
  blocklist: string[];
  allowList: Set<string>;
  mode: SecretValidationMode;
}

interface ResolvedJwtInputs {
  token?: string;
  secret?: string;
  tokenEnvName: string;
  secretEnvName: string;
}

export function enforceSecurityOnConfig(
  buildTimeConstantsConfig: BuildTimeConstantsConfigType,
  securityOptions: SecurityOptions = {},
  now: Date = new Date(),
): JwtVerificationResult | null {
  const secretScanOptions = normalizeSecretOptions(securityOptions.secrets);
  scanConfigForSecurityViolations(buildTimeConstantsConfig, secretScanOptions, 'custom');

  const jwtOptions = securityOptions.jwt;
  const shouldValidateJwt = jwtOptions
    ? (jwtOptions.required ?? false) || Boolean(resolveJwtInputs(jwtOptions).token)
    : Boolean(resolveJwtInputs({}).token);

  if (!shouldValidateJwt) {
    return null;
  }

  return verifyJwtToken(jwtOptions ?? {}, now);
}

export function verifyJwtToken(
  jwtOptions: JwtSecurityOptions = {},
  now: Date = new Date(),
): JwtVerificationResult {
  const { token, secret, tokenEnvName, secretEnvName } = resolveJwtInputs(jwtOptions);

  if (!token) {
    throw new Error(
      `JWT token is required. Provide security.jwt.token or set the ${tokenEnvName} environment variable.`,
    );
  }

  if (!secret) {
    throw new Error(
      `JWT secret is required. Provide security.jwt.secret or set the ${secretEnvName} environment variable.`,
    );
  }

  const allowedAlgorithms = jwtOptions.algorithms ?? ['HS256'];
  allowedAlgorithms.forEach((alg) => {
    if (!HASH_ALGORITHM_BY_JWT_ALG[alg]) {
      throw new Error(
        `Unsupported JWT algorithm "${alg}". Supported algorithms: ${Object.keys(HASH_ALGORITHM_BY_JWT_ALG).join(', ')}`,
      );
    }
  });

  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new Error('Invalid JWT format. Expected header.payload.signature');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = parseJwtSegment<JwtHeader>(encodedHeader, 'header');

  if (!allowedAlgorithms.includes(header.alg)) {
    throw new Error(`JWT algorithm "${header.alg}" is not allowed.`);
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmacSignature(signingInput, secret, header.alg);
  const providedSignature = base64UrlDecode(encodedSignature);

  if (
    expectedSignature.length !== providedSignature.length ||
    !crypto.timingSafeEqual(expectedSignature, providedSignature)
  ) {
    throw new Error('JWT signature verification failed');
  }

  const payload = parseJwtSegment<JwtPayload>(encodedPayload, 'payload');
  validateJwtClaims(payload, jwtOptions, now);

  return { header, payload };
}

function normalizeSecretOptions(secrets?: SecretValidationOptions): SecretScanOptions {
  const mergedBlocklist = Array.from(
    new Set([
      ...DEFAULT_SECRET_BLOCKLIST,
      ...((secrets?.blocklist ?? []).map((entry) => entry.toLowerCase())),
    ]),
  );

  const allowList = new Set((secrets?.allowList ?? []).map((entry) => entry.toLowerCase()));
  const mode: SecretValidationMode = secrets?.mode ?? DEFAULT_SECRET_MODE;

  return { blocklist: mergedBlocklist, allowList, mode };
}

function scanConfigForSecurityViolations(value: unknown, options: SecretScanOptions, currentPath: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      scanConfigForSecurityViolations(entry, options, `${currentPath}[${index}]`);
    });
    return;
  }

  if (!isPlainObject(value)) {
    if (!isSerializableLeaf(value)) {
      throw new Error(
        `Unsupported value at "${currentPath}". Only JSON-serializable values are allowed in buildTimeConstants configuration.`,
      );
    }
    return;
  }

  Object.entries(value).forEach(([key, child]) => {
    ensureSafePropertyName(key, currentPath);
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    enforceSecretPolicy(key, nextPath, options);
    scanConfigForSecurityViolations(child, options, nextPath);
  });
}

function enforceSecretPolicy(key: string, path: string, options: SecretScanOptions): void {
  const normalizedKey = key.toLowerCase();
  const blocked = options.blocklist.find((blockedKey) => normalizedKey.includes(blockedKey));

  if (!blocked) {
    return;
  }

  if (options.allowList.has(path.toLowerCase())) {
    return;
  }

  const message = `Config property "${path}" matched blocked keyword "${blocked}". If this property intentionally carries a secret, list it under security.secrets.allowList.`;

  if (options.mode === 'warn') {
    console.warn(message);
  } else {
    throw new Error(message);
  }
}

function ensureSafePropertyName(key: string, path: string): void {
  if (PROHIBITED_PROPERTY_NAMES.has(key)) {
    const target = path ? `${path}.${key}` : key;
    throw new Error(`Unsafe configuration property name "${target}" is blocked to prevent prototype pollution.`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isSerializableLeaf(value: unknown): boolean {
  if (value === null) {
    return true;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }

  if (value instanceof Date) {
    return true;
  }

  if (value && typeof value === 'object' && typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return true;
  }

  return false;
}

function parseJwtSegment<T>(segment: string, segmentName: string): T {
  try {
    const buffer = base64UrlDecode(segment);
    return JSON.parse(buffer.toString('utf8')) as T;
  } catch (error) {
    throw new Error(`Unable to parse JWT ${segmentName}. ${(error as Error).message}`);
  }
}

function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + (4 - (normalized.length % 4)) % 4, '=');
  return Buffer.from(padded, 'base64');
}

function createHmacSignature(
  signingInput: string,
  secret: string,
  algorithm: SupportedJwtAlgorithm,
): Buffer {
  const hashAlgorithm = HASH_ALGORITHM_BY_JWT_ALG[algorithm];
  return crypto.createHmac(hashAlgorithm, secret).update(signingInput).digest();
}

function validateJwtClaims(payload: JwtPayload, options: JwtSecurityOptions, now: Date): void {
  const tolerance = options.clockToleranceSeconds ?? 60;
  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (typeof payload.exp === 'number' && nowSeconds >= payload.exp + tolerance) {
    throw new Error('JWT token has expired.');
  }

  if (typeof payload.nbf === 'number' && nowSeconds < payload.nbf - tolerance) {
    throw new Error('JWT token is not valid yet (nbf check failed).');
  }

  if (typeof payload.iat === 'number' && payload.iat - tolerance > nowSeconds) {
    throw new Error('JWT token issued-at (iat) claim is in the future.');
  }

  if (options.issuer && payload.iss !== options.issuer) {
    throw new Error('JWT issuer claim mismatch.');
  }

  if (options.subject && payload.sub !== options.subject) {
    throw new Error('JWT subject claim mismatch.');
  }

  if (options.audience) {
    const expectedAudience = Array.isArray(options.audience) ? options.audience : [options.audience];
    const payloadAudience = payload.aud
      ? Array.isArray(payload.aud)
        ? payload.aud
        : [payload.aud]
      : [];

    const hasOverlap = expectedAudience.some((aud) => payloadAudience.includes(aud));
    if (!hasOverlap) {
      throw new Error('JWT audience claim mismatch.');
    }
  }
}

function resolveJwtInputs(jwtOptions: JwtSecurityOptions): ResolvedJwtInputs {
  const tokenEnvName = jwtOptions.tokenEnvName ?? JWT_TOKEN_ENV;
  const secretEnvName = jwtOptions.secretEnvName ?? JWT_SECRET_ENV;

  const token = jwtOptions.token ?? (tokenEnvName ? process.env[tokenEnvName] : undefined);
  const secret = jwtOptions.secret ?? (secretEnvName ? process.env[secretEnvName] : undefined);

  return { token, secret, tokenEnvName, secretEnvName };
}
