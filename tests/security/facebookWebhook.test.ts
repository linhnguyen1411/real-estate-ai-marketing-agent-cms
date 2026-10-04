import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { createApp } from '../../server/bootstrap/createApp';
import { registerFacebookWebhookRoutes } from '../../server/facebookRoutes';

describe('P1.1 Facebook Webhook Security (Fail-Closed & Timing-Safe)', () => {
  const originalSecret = process.env.FACEBOOK_APP_SECRET;
  const originalVerifyToken = process.env.FACEBOOK_VERIFY_TOKEN;

  afterEach(() => {
    process.env.FACEBOOK_APP_SECRET = originalSecret;
    process.env.FACEBOOK_VERIFY_TOKEN = originalVerifyToken;
  });

  const setupApp = () => {
    const app = createApp({ facebookGraphLegacyEnabled: true });
    registerFacebookWebhookRoutes(app);
    return app;
  };

  it('1. GET /webhooks/facebook: returns 403 when verify_token does not match', async () => {
    process.env.FACEBOOK_VERIFY_TOKEN = 'secret-verify-token-123';
    const app = setupApp();

    const res = await request(app)
      .get('/webhooks/facebook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'challenge-code-xyz',
      });

    expect(res.status).toBe(403);
  });

  it('2. GET /webhooks/facebook: returns 200 challenge when verify_token matches with timingSafeEqual', async () => {
    process.env.FACEBOOK_VERIFY_TOKEN = 'secret-verify-token-123';
    const app = setupApp();

    const res = await request(app)
      .get('/webhooks/facebook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'secret-verify-token-123',
        'hub.challenge': 'challenge-code-xyz',
      });

    expect(res.status).toBe(200);
    expect(res.text).toBe('challenge-code-xyz');
  });

  it('3. POST /webhooks/facebook: returns 403 when x-hub-signature-256 header is missing (fail-closed)', async () => {
    process.env.FACEBOOK_APP_SECRET = 'fb-app-secret-32-bytes-long-key-1';
    const app = setupApp();

    const res = await request(app)
      .post('/webhooks/facebook')
      .send({ object: 'page', entry: [] });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Invalid signature');
  });

  it('4. POST /webhooks/facebook: returns 403 when signature is invalid', async () => {
    process.env.FACEBOOK_APP_SECRET = 'fb-app-secret-32-bytes-long-key-1';
    const app = setupApp();

    const res = await request(app)
      .post('/webhooks/facebook')
      .set('x-hub-signature-256', 'sha256=invalidhexsignature0000000000000000000000000000000000000000000000')
      .send({ object: 'page', entry: [] });

    expect(res.status).toBe(403);
  });

  it('5. POST /webhooks/facebook: returns 403 when FACEBOOK_APP_SECRET is not configured', async () => {
    delete process.env.FACEBOOK_APP_SECRET;
    const app = setupApp();

    const res = await request(app)
      .post('/webhooks/facebook')
      .set('x-hub-signature-256', 'sha256=somevalidsignature')
      .send({ object: 'page', entry: [] });

    expect(res.status).toBe(403);
  });

  it('6. POST /webhooks/facebook: returns 200 when signature is valid', async () => {
    const secret = 'fb-app-secret-32-bytes-long-key-1';
    process.env.FACEBOOK_APP_SECRET = secret;
    const app = setupApp();

    const payload = JSON.stringify({ object: 'page', entry: [] });
    const signature = `sha256=${crypto.createHmac('sha256', secret).update(Buffer.from(payload)).digest('hex')}`;

    const res = await request(app)
      .post('/webhooks/facebook')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.text).toBe('EVENT_RECEIVED');
  });
});
