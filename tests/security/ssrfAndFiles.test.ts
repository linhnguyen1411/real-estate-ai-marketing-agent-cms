import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { safeFetch, isForbiddenIp, validateUrlStructure, resolveAndValidateIp } from '../../server/security/safeFetch';
import { saveImageFromDataUrl } from '../../server/blog/imageStorage';
import { validateShortLinkTargetUrl } from '../../server/shortLink/shortLinkRoutes';
import { createTestApp } from '../helpers/app';

describe('Phase 4: SSRF, File Validation & XSS Prevention', () => {
  describe('Gate P4: safeFetch Anti-SSRF Security', () => {
    it('blocks localhost and loopback IPv4/IPv6', async () => {
      expect(isForbiddenIp('127.0.0.1')).toBe(true);
      expect(isForbiddenIp('127.0.0.2')).toBe(true);
      expect(isForbiddenIp('::1')).toBe(true);
      expect(isForbiddenIp('0.0.0.0')).toBe(true);

      await expect(safeFetch('http://127.0.0.1/')).rejects.toThrow(/SSRF_BLOCKED|forbidden/i);
      await expect(safeFetch('http://localhost:3000/')).rejects.toThrow(/SSRF_BLOCKED|forbidden/i);
      await expect(safeFetch('http://[::1]/')).rejects.toThrow(/SSRF_BLOCKED|forbidden/i);
    });

    it('blocks AWS/GCP cloud metadata IP 169.254.169.254 and link-local range', async () => {
      expect(isForbiddenIp('169.254.169.254')).toBe(true);
      expect(isForbiddenIp('169.254.1.1')).toBe(true);
      await expect(safeFetch('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/SSRF_BLOCKED|forbidden/i);
    });

    it('blocks RFC1918 private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', async () => {
      expect(isForbiddenIp('10.0.0.1')).toBe(true);
      expect(isForbiddenIp('172.16.0.5')).toBe(true);
      expect(isForbiddenIp('172.31.255.255')).toBe(true);
      expect(isForbiddenIp('192.168.1.1')).toBe(true);

      await expect(safeFetch('http://10.0.0.1/')).rejects.toThrow(/SSRF_BLOCKED|forbidden/i);
      await expect(safeFetch('http://192.168.1.1/admin')).rejects.toThrow(/SSRF_BLOCKED|forbidden/i);
    });

    it('blocks CGNAT (100.64.0.0/10) and IPv4-mapped IPv6', async () => {
      expect(isForbiddenIp('100.64.0.1')).toBe(true);
      expect(isForbiddenIp('100.127.255.255')).toBe(true);
      expect(isForbiddenIp('::ffff:127.0.0.1')).toBe(true);
      expect(isForbiddenIp('::ffff:192.168.1.1')).toBe(true);

      await expect(safeFetch('http://100.64.0.1/')).rejects.toThrow(/SSRF_BLOCKED|forbidden/i);
    });

    it('only allows http and https protocols on ports 80 and 443', () => {
      expect(() => validateUrlStructure('ftp://example.com/')).toThrow(/protocol/i);
      expect(() => validateUrlStructure('file:///etc/passwd')).toThrow(/protocol/i);
      expect(() => validateUrlStructure('gopher://example.com/')).toThrow(/protocol/i);
      expect(() => validateUrlStructure('http://example.com:8080/')).toThrow(/port/i);
      expect(() => validateUrlStructure('https://example.com:22/')).toThrow(/port/i);
      expect(validateUrlStructure('https://example.com/').hostname).toBe('example.com');
    });
  });

  describe('P4.3: Image Upload & Magic Bytes Hardening', () => {
    it('rejects fake MIME types with non-image buffers', () => {
      const fakePng = 'data:image/png;base64,' + Buffer.from('NOT A REAL PNG FILE').toString('base64');
      expect(() => saveImageFromDataUrl(fakePng, 'content-images')).toThrow(/không khớp header|không được hỗ trợ/i);
    });

    it('rejects SVG images due to XSS vulnerability', () => {
      const svgPayload = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
      expect(() => saveImageFromDataUrl(svgPayload, 'content-images')).toThrow(/SVG không được chấp nhận/i);
    });

    it('accepts valid PNG image with authentic magic bytes and generates random 32-char hex name', () => {
      // Valid minimal PNG buffer (8 bytes magic header + minimal IHDR)
      const validPngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
        0x89
      ]);
      const dataUrl = 'data:image/png;base64,' + validPngHeader.toString('base64');
      const savedPath = saveImageFromDataUrl(dataUrl, 'content-images');
      expect(savedPath).toMatch(/^\/content-images\/[a-f0-9]{32}\.png$/);
    });
  });

  describe('P4.6: XSS Prevention in /s/:slug and CSP', () => {
    it('escapes reflected XSS payload in /s/:slug and sets strict CSP', async () => {
      const { app } = createTestApp();
      const xssSlug = '<script>alert(1)</script>';
      const encodedSlug = encodeURIComponent(xssSlug);

      const res = await request(app).get(`/s/${encodedSlug}`);
      expect(res.status).toBe(404);
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.text).not.toContain('<script>alert(1)</script>');
      expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes img tag onerror XSS payload in 404 response', async () => {
      const { app } = createTestApp();
      const xssSlug = '<img src=x onerror=alert(1)>';
      const encodedSlug = encodeURIComponent(xssSlug);

      const res = await request(app).get(`/s/${encodedSlug}`);
      expect(res.status).toBe(404);
      expect(res.text).not.toContain('<img src=x onerror=alert(1)>');
      expect(res.text).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });
  });

  describe('P4.8: Short Link Open Redirect Prevention', () => {
    it('rejects external open redirect targets not in allowlist', () => {
      expect(() =>
        validateShortLinkTargetUrl('https://evil-attacker.com/login', 'https://bdsdanang.site')
      ).toThrow(/chống Open Redirect/i);
    });

    it('allows valid internal paths and official domain targets', () => {
      expect(validateShortLinkTargetUrl('/tin-tuc/bat-dong-san-da-nang', 'https://bdsdanang.site')).toBe('/tin-tuc/bat-dong-san-da-nang');
      expect(validateShortLinkTargetUrl('https://bdsdanang.site/bat-dong-san', 'https://bdsdanang.site')).toBe('https://bdsdanang.site/bat-dong-san');
      expect(validateShortLinkTargetUrl('https://www.bdsdanang.site/lien-he', 'https://bdsdanang.site')).toBe('https://www.bdsdanang.site/lien-he');
    });

    it('only allows owner or company roles to create short links', async () => {
      const { app, tokens } = createTestApp();

      // Member attempting to create short link -> 403 Forbidden
      const memberRes = await request(app)
        .post('/api/admin/short-links')
        .set('Authorization', `Bearer ${tokens.memberA}`)
        .send({ target_url: '/tin-tuc/bai-viet-1', title: 'Test Link' });
      expect(memberRes.status).toBe(403);

      // Company creating valid short link -> 200 OK
      const companyRes = await request(app)
        .post('/api/admin/short-links')
        .set('Authorization', `Bearer ${tokens.companyAdminA}`)
        .send({ target_url: '/tin-tuc/bai-viet-1', title: 'Test Link Company' });
      expect(companyRes.status).toBe(200);
      expect(companyRes.body.status).toBe('success');
    });
  });
});
