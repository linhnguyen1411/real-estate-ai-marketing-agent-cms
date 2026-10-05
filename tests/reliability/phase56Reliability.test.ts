import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/bootstrap/createApp';
import { mountRoutes } from '../../server/bootstrap/mountRoutes';
import { setCacheForTesting, upsertUser, upsertCmsRecord, OptimisticLockError, getUserById } from '../../server/dbHelper';
import { encryptSecret, decryptSecret } from '../../server/security/settingsCrypto';
import { getCircuitBreaker, CircuitBreakerOpenError } from '../../server/utils/circuitBreaker';
import { safeRun } from '../../server/utils/safeRun';

describe('Phase 5 & 6: Data Integrity, Secrets Crypto & Operational Reliability', () => {
  let app: any;

  beforeEach(() => {
    app = createApp({ facebookGraphLegacyEnabled: false });
    mountRoutes(app, { facebookGraphLegacyEnabled: false, agentEnabled: true });

    setCacheForTesting({
      companies: [
        { id: 'comp-da-nang', name: 'Đà Nẵng Real Estate', status: 'active', created_at: new Date().toISOString() },
      ],
      users: [
        {
          id: 'u-owner-1',
          name: 'Owner Admin',
          email: 'owner@bdsdanang.site',
          role: 'owner',
          status: 'active',
          version: 1,
          created_at: new Date().toISOString(),
        },
      ],
      customers: [
        {
          id: 'c-test-1',
          name: 'Khách Test Concurrency',
          phone: '0905123456',
          company_id: 'comp-da-nang',
          version: 1,
          created_at: new Date().toISOString(),
        },
      ],
      properties: [],
      posts: [],
      inbox: [],
      automations: [],
      settings: {} as any,
    });
  });

  // P5.1: Fast in-memory user lookup
  it('P5.1: getUserById fetches directly from cache without full clone penalty', () => {
    const user = getUserById('u-owner-1');
    expect(user).toBeDefined();
    expect(user?.email).toBe('owner@bdsdanang.site');
    expect(getUserById('non-existent')).toBeNull();
  });

  // P5.3: Optimistic Locking Conflict Detection
  it('P5.3: Optimistic locking rejects stale version updates with OptimisticLockError (409)', async () => {
    // Current version is 1. Updating with expectedVersion 1 should succeed
    const updated = await upsertCmsRecord('customers', {
      id: 'c-test-1',
      name: 'Khách Cập Nhật Hợp Lệ',
      company_id: 'comp-da-nang',
    }, 1);

    expect(updated.version).toBe(2);

    // Stale update using old version 1 should throw OptimisticLockError
    await expect(
      upsertCmsRecord('customers', {
        id: 'c-test-1',
        name: 'Khách Cập Nhật Trễ',
        company_id: 'comp-da-nang',
      }, 1)
    ).rejects.toThrow(OptimisticLockError);
  });

  // P5.6: Settings Secrets Crypto
  it('P5.6: Encrypts and decrypts settings secrets with AES-256-GCM and HKDF context separation', () => {
    const originalSecret = 'AIzaSySecretApiKey1234567890';
    const encrypted = encryptSecret(originalSecret, 'gemini');

    expect(encrypted.startsWith('enc:k1:')).toBe(true);
    expect(encrypted).not.toContain(originalSecret);

    const decrypted = decryptSecret(encrypted, 'gemini');
    expect(decrypted).toBe(originalSecret);

    // Wrong context should fail auth tag verification
    expect(() => decryptSecret(encrypted, 'openai')).toThrow(/invalid auth tag or wrong key/);

    // Plaintext legacy fallback
    expect(decryptSecret('legacy-plain-token', 'telegram')).toBe('legacy-plain-token');
  });

  // P6.3: Health checks separation
  it('P6.3: /healthz returns 200 liveness and /readyz returns readiness status', async () => {
    const healthzRes = await request(app).get('/healthz');
    expect(healthzRes.status).toBe(200);
    expect(healthzRes.body.status).toBe('ok');

    const readyzRes = await request(app).get('/readyz');
    // In mock unit test without postgres, readyz returns 200 or 503 depending on db connectivity
    expect([200, 503]).toContain(readyzRes.status);
  });

  // P6.5: safeRun error isolation
  it('P6.5: safeRun isolates async and sync errors without unhandled crash', () => {
    expect(() => {
      safeRun('test-sync-failure', () => {
        throw new Error('Boom');
      });
    }).not.toThrow();

    expect(() => {
      safeRun('test-async-failure', async () => {
        throw new Error('Async Boom');
      });
    }).not.toThrow();
  });

  // P6.6: Circuit breaker for external APIs
  it('P6.6: Circuit breaker trips OPEN after threshold consecutive failures', async () => {
    const breaker = getCircuitBreaker('test-failing-ai', {
      failureThreshold: 2,
      cooldownPeriodMs: 5000,
    });

    const failingCall = async () => {
      throw new Error('Remote AI service unreachable');
    };

    // First failure
    await expect(breaker.execute(failingCall)).rejects.toThrow('Remote AI service unreachable');
    expect(breaker.state).toBe('CLOSED');

    // Second failure -> Trips OPEN
    await expect(breaker.execute(failingCall)).rejects.toThrow('Remote AI service unreachable');
    expect(breaker.state).toBe('OPEN');

    // Third call rejected immediately with CircuitBreakerOpenError (Fast fail)
    await expect(breaker.execute(failingCall)).rejects.toThrow(CircuitBreakerOpenError);
  });
});
