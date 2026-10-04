import { describe, it, expect } from 'vitest';
import { validateEnv } from '../../server/config/env';

describe('P1.2 Environment Configuration & Fail-Fast Boot', () => {
  it('1. Throws in production when AUTH_SECRET is missing', () => {
    expect(() => {
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://prod_user:secret@prod_db:5432/cms',
        TOKEN_ENCRYPTION_KEY: 'token-encryption-key-32-chars-long-12',
        AGENT_ENABLED: 'true',
        AGENT_RUNTIME_TOKEN: 'agent-runtime-token-32-chars-long-12',
      });
    }).toThrow(/AUTH_SECRET/);
  });

  it('2. Throws in production when AUTH_SECRET is too short (< 32 chars)', () => {
    expect(() => {
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://prod_user:secret@prod_db:5432/cms',
        AUTH_SECRET: 'short-secret-123',
        TOKEN_ENCRYPTION_KEY: 'token-encryption-key-32-chars-long-12',
        AGENT_ENABLED: 'true',
        AGENT_RUNTIME_TOKEN: 'agent-runtime-token-32-chars-long-12',
      });
    }).toThrow(/AUTH_SECRET/);
  });

  it('3. Throws in production when AGENT_ENABLED=true and AGENT_RUNTIME_TOKEN is missing or < 32 chars', () => {
    expect(() => {
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://prod_user:secret@prod_db:5432/cms',
        AUTH_SECRET: 'a-very-long-production-auth-secret-key-32',
        TOKEN_ENCRYPTION_KEY: 'token-encryption-key-32-chars-long-12',
        AGENT_ENABLED: 'true',
        AGENT_RUNTIME_TOKEN: 'short-token',
      });
    }).toThrow(/AGENT_RUNTIME_TOKEN/);
  });

  it('4. Succeeds in production when all secrets meet length requirements (>= 32 chars)', () => {
    const config = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod_user:secret@prod_db:5432/cms',
      AUTH_SECRET: 'a-very-long-production-auth-secret-key-32',
      TOKEN_ENCRYPTION_KEY: 'token-encryption-key-32-chars-long-12',
      AGENT_ENABLED: 'true',
      AGENT_RUNTIME_TOKEN: 'agent-runtime-token-32-chars-long-12',
    });
    expect(config.NODE_ENV).toBe('production');
    expect(config.AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it('5. Generates ephemeral random secrets with warning in development/test if unset', () => {
    const config = validateEnv({
      NODE_ENV: 'development',
    });
    expect(config.AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(config.TOKEN_ENCRYPTION_KEY.length).toBeGreaterThanOrEqual(32);
  });
});
