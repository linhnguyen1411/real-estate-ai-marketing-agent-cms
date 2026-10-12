import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createTestApp, type TestContext } from '../helpers/app';

describe('Desktop Agent Ingest - Publisher & Inventory Endpoints', () => {
  let ctx: TestContext;
  const originalEnabled = process.env.AGENT_INGEST_ENABLED;

  beforeEach(() => {
    process.env.AGENT_INGEST_ENABLED = 'true';
    ctx = createTestApp();
  });

  afterEach(() => {
    process.env.AGENT_INGEST_ENABLED = originalEnabled;
  });

  it('rejects GET /api/agent-ingest/v1/properties without valid HMAC headers', async () => {
    const res = await request(ctx.app).get('/api/agent-ingest/v1/properties');

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Missing HMAC headers');
  });

  it('rejects POST /api/agent-ingest/v1/generate-post without valid HMAC headers', async () => {
    const res = await request(ctx.app)
      .post('/api/agent-ingest/v1/generate-post')
      .send({ tone: 'professional' });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Missing HMAC headers');
  });

  it('returns 503 if AGENT_INGEST_ENABLED is false', async () => {
    process.env.AGENT_INGEST_ENABLED = 'false';
    const res = await request(ctx.app).get('/api/agent-ingest/v1/properties');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Agent ingestion disabled');
  });
});
