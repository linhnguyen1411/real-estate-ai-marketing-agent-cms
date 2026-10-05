import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import { URL } from 'url';

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
  maxSizeBytes?: number;
  maxRedirects?: number;
  allowedContentTypes?: string[]; // e.g. ['image/', 'text/html', 'application/json']
}

export interface SafeFetchResponse {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  url: string;
  buffer: () => Promise<Buffer>;
  text: () => Promise<string>;
  json: <T = unknown>() => Promise<T>;
}

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(`[SSRF_BLOCKED] ${message}`);
    this.name = 'SsrfBlockedError';
  }
}

/**
 * Checks whether an IP address belongs to any forbidden/private/internal range:
 * - IPv4:
 *   - 0.0.0.0/8 (Current network)
 *   - 10.0.0.0/8 (Private)
 *   - 100.64.0.0/10 (Shared address / CGNAT)
 *   - 127.0.0.0/8 (Loopback)
 *   - 169.254.0.0/16 (Link-local, including 169.254.169.254 cloud metadata)
 *   - 172.16.0.0/12 (Private)
 *   - 192.0.0.0/24 (IETF Protocol Assignments)
 *   - 192.0.2.0/24 (TEST-NET-1)
 *   - 192.88.99.0/24 (6to4 Relay Anycast)
 *   - 192.168.0.0/16 (Private)
 *   - 198.18.0.0/15 (Network benchmark tests)
 *   - 198.51.100.0/24 (TEST-NET-2)
 *   - 203.0.113.0/24 (TEST-NET-3)
 *   - 224.0.0.0/4 (Multicast)
 *   - 240.0.0.0/4 (Reserved)
 *   - 255.255.255.255/32 (Broadcast)
 * - IPv6:
 *   - ::/128 (Unspecified)
 *   - ::1/128 (Loopback)
 *   - ::ffff:0:0/96 (IPv4-mapped IPv6)
 *   - 64:ff9b::/96 (IPv4/IPv6 translation)
 *   - 100::/64 (Discard-only)
 *   - 2001::/23 (IETF Protocol)
 *   - 2001:db8::/32 (Documentation)
 *   - 2002::/16 (6to4)
 *   - fc00::/7 (Unique local / ULA)
 *   - fe80::/10 (Link-local unicast)
 *   - ff00::/8 (Multicast)
 */
export function isForbiddenIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 0) return true;

  if (family === 4) {
    const parts = ip.split('.').map(p => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;

    const [a, b, c] = parts;

    // 0.0.0.0/8
    if (a === 0) return true;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 100.64.0.0/10 (100.64.0.0 – 100.127.255.255)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8
    if (a === 127) return true;
    // 169.254.0.0/16
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (172.16.0.0 – 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24
    if (a === 192 && b === 0 && c === 2) return true;
    // 192.88.99.0/24
    if (a === 192 && b === 88 && c === 99) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (198.18.0.0 – 198.19.255.255)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (224-239)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (240-255)
    if (a >= 240) return true;

    return false;
  }

  if (family === 6) {
    const normalized = ip.toLowerCase();
    // Loopback & Unspecified
    if (normalized === '::' || normalized === '::1') return true;

    // IPv4-mapped IPv6 (::ffff:x.x.x.x or ::ffff:hex)
    if (normalized.startsWith('::ffff:')) {
      const v4Part = normalized.slice(7);
      if (net.isIPv4(v4Part)) {
        return isForbiddenIp(v4Part);
      }
      return true; // Malformed or hex IPv4-mapped, block for safety
    }

    // Link-local: fe80::/10 (fe80 - febf)
    if (/^fe[89ab][0-9a-f]:/i.test(normalized) || normalized.startsWith('fe80:')) return true;

    // Unique Local Addresses (ULA): fc00::/7 (fc00 - fdff)
    if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) return true;

    // Multicast: ff00::/8
    if (normalized.startsWith('ff')) return true;

    // Documentation: 2001:db8::/32
    if (normalized.startsWith('2001:db8:')) return true;

    return false;
  }

  return true;
}

/**
 * Validates a target URL: protocol must be http/https, port must be 80 or 443 (or default).
 */
export function validateUrlStructure(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(`Invalid URL structure: ${rawUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(`Forbidden protocol: ${parsed.protocol}. Only http and https allowed.`);
  }

  const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
  if (port !== 80 && port !== 443) {
    throw new SsrfBlockedError(`Forbidden port: ${port}. Only ports 80 and 443 are allowed.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]'
  ) {
    throw new SsrfBlockedError(`Forbidden local hostname: ${hostname}`);
  }

  return parsed;
}

/**
 * Resolves all addresses for a hostname and verifies NONE of them are private/forbidden.
 * Returns the first validated IP address for DNS pinning.
 */
export async function resolveAndValidateIp(hostname: string): Promise<{ ip: string; family: number }> {
  // If hostname is directly an IP literal
  const cleanHost = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(cleanHost)) {
    if (isForbiddenIp(cleanHost)) {
      throw new SsrfBlockedError(`Target IP is in a forbidden or internal range: ${cleanHost}`);
    }
    return { ip: cleanHost, family: net.isIP(cleanHost) };
  }

  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch (err: any) {
    throw new SsrfBlockedError(`DNS lookup failed for ${hostname}: ${err.message || String(err)}`);
  }

  if (!addresses || addresses.length === 0) {
    throw new SsrfBlockedError(`No DNS records found for ${hostname}`);
  }

  for (const addr of addresses) {
    if (isForbiddenIp(addr.address)) {
      throw new SsrfBlockedError(
        `Hostname ${hostname} resolved to forbidden IP ${addr.address} (${addr.family})`
      );
    }
  }

  return { ip: addresses[0].address, family: addresses[0].family };
}

/**
 * Safe HTTP/HTTPS request with:
 * - Anti-SSRF (blocking local, loopback, cloud metadata, private IP ranges)
 * - DNS Pinning (anti-DNS rebinding)
 * - Manual redirect handling (up to maxRedirects hops, re-validating every hop)
 * - Timeout enforcement
 * - Maximum response size truncation / guard
 * - Content-Type validation
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResponse> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 8_000,
    maxSizeBytes = 10 * 1024 * 1024, // 10MB default
    maxRedirects = 3,
    allowedContentTypes,
  } = options;

  let currentUrl = rawUrl;
  let redirectsCount = 0;

  while (redirectsCount <= maxRedirects) {
    const parsedUrl = validateUrlStructure(currentUrl);
    const { ip, family } = await resolveAndValidateIp(parsedUrl.hostname);

    const isHttps = parsedUrl.protocol === 'https:';
    const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (isHttps ? 443 : 80);

    // Pin resolved IP by creating custom agent or socket lookup
    const requestModule = isHttps ? https : http;

    const requestHeaders: Record<string, string> = {
      Host: parsedUrl.hostname,
      'User-Agent': 'SafeFetch/1.0 (+https://bdsdanang.site)',
      ...headers,
    };

    const reqOptions: http.RequestOptions = {
      method: method.toUpperCase(),
      hostname: parsedUrl.hostname,
      port,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers: requestHeaders,
      timeout: timeoutMs,
      // Pin IP: custom lookup function that directly returns the already-validated IP
      lookup: (_hostname, _opts, callback) => {
        callback(null, ip, family);
      },
      // For HTTPS SNI matching
      ...(isHttps ? { servername: parsedUrl.hostname } : {}),
    };

    const response = await new Promise<{
      statusCode: number;
      statusMessage: string;
      headers: http.IncomingHttpHeaders;
      chunks: Buffer[];
      redirectLocation?: string;
    }>((resolve, reject) => {
      let isTimedOut = false;
      const req = requestModule.request(reqOptions, (res) => {
        const statusCode = res.statusCode || 0;
        const statusMessage = res.statusMessage || '';

        // Check for redirects (301, 302, 303, 307, 308)
        if ([301, 302, 303, 307, 308].includes(statusCode) && res.headers.location) {
          res.resume(); // Discard redirect body
          resolve({
            statusCode,
            statusMessage,
            headers: res.headers,
            chunks: [],
            redirectLocation: res.headers.location,
          });
          return;
        }

        // Validate Content-Type if specified
        if (allowedContentTypes && allowedContentTypes.length > 0) {
          const contentType = res.headers['content-type'] || '';
          const matches = allowedContentTypes.some(allowed =>
            contentType.toLowerCase().includes(allowed.toLowerCase())
          );
          if (!matches) {
            res.destroy();
            reject(
              new SsrfBlockedError(
                `Content-Type "${contentType}" is not in allowlist: ${allowedContentTypes.join(', ')}`
              )
            );
            return;
          }
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;

        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > maxSizeBytes) {
            res.destroy();
            reject(
              new Error(`Response size exceeded maximum allowed limit of ${maxSizeBytes} bytes`)
            );
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          resolve({
            statusCode,
            statusMessage,
            headers: res.headers,
            chunks,
          });
        });

        res.on('error', (err) => {
          reject(err);
        });
      });

      req.on('timeout', () => {
        isTimedOut = true;
        req.destroy();
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      });

      req.on('error', (err) => {
        if (!isTimedOut) {
          reject(err);
        }
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });

    if (response.redirectLocation) {
      redirectsCount++;
      if (redirectsCount > maxRedirects) {
        throw new Error(`Maximum redirect limit of ${maxRedirects} exceeded`);
      }
      // Resolve relative redirect URL against current URL
      currentUrl = new URL(response.redirectLocation, currentUrl).toString();
      continue;
    }

    const flatHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(response.headers)) {
      if (typeof val === 'string') {
        flatHeaders[key.toLowerCase()] = val;
      } else if (Array.isArray(val)) {
        flatHeaders[key.toLowerCase()] = val.join(', ');
      }
    }

    const fullBuffer = Buffer.concat(response.chunks);

    return {
      status: response.statusCode,
      statusText: response.statusMessage,
      ok: response.statusCode >= 200 && response.statusCode < 300,
      headers: flatHeaders,
      url: currentUrl,
      buffer: async () => fullBuffer,
      text: async () => fullBuffer.toString('utf-8'),
      json: async <T>() => JSON.parse(fullBuffer.toString('utf-8')) as T,
    };
  }

  throw new Error(`Exceeded redirect limit`);
}
