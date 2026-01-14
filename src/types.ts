export type SecretValidationMode = 'warn' | 'error';

export interface SecretValidationOptions {
  blocklist?: string[];
  allowList?: string[];
  mode?: SecretValidationMode;
}

export type SupportedJwtAlgorithm = 'HS256' | 'HS384' | 'HS512';

export interface JwtSecurityOptions {
  token?: string;
  tokenEnvName?: string;
  secret?: string;
  secretEnvName?: string;
  issuer?: string;
  subject?: string;
  audience?: string | string[];
  required?: boolean;
  algorithms?: SupportedJwtAlgorithm[];
  clockToleranceSeconds?: number;
}

export interface SecurityOptions {
  jwt?: JwtSecurityOptions;
  secrets?: SecretValidationOptions;
}

export interface BuildTimeConstantsConfigType {
  [key: string]: unknown;
}

export interface BuildTimeConstantsOptions {
  outputFile?: string;
  now?: Date;
  security?: SecurityOptions;
}

export interface JwtHeader {
  alg: SupportedJwtAlgorithm;
  typ?: string;
  kid?: string;
  [key: string]: unknown;
}

export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  [key: string]: unknown;
}

export interface JwtVerificationResult {
  header: JwtHeader;
  payload: JwtPayload;
}
