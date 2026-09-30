// This route carries only Google's public verification certificates. It never
// forwards a caller's headers, cookies, ID token, or query string to Google.
const CERTIFICATE_PATHS = {
  '/.well-known/google-certs/pem': 'https://www.googleapis.com/oauth2/v1/certs',
  '/.well-known/google-certs/jwk': 'https://www.googleapis.com/oauth2/v3/certs',
};
const MAX_CERTIFICATE_BYTES = 64 * 1024;

function validCertificates(path, value) {
  if (path.endsWith('/pem')) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).length > 0 && Object.values(value).every(
        (certificate) => typeof certificate === 'string' && certificate.includes('-----BEGIN CERTIFICATE-----'),
      );
  }
  return value !== null && typeof value === 'object' && Array.isArray(value.keys) &&
    value.keys.length > 0 && value.keys.every(
      (key) => key?.kty === 'RSA' && typeof key.kid === 'string' &&
        typeof key.n === 'string' && typeof key.e === 'string',
    );
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const upstreamUrl = CERTIFICATE_PATHS[url.pathname];
    if (!upstreamUrl) return new Response('Not found', { status: 404 });
    if (request.method !== 'GET' || url.search) return new Response('Not allowed', { status: 405 });

    try {
      const upstream = await fetch(upstreamUrl, {
        headers: { accept: 'application/json' },
        cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': 300, '400-599': 0 } },
      });
      if (!upstream.ok) throw new Error('Google certificate request failed');
      const body = await upstream.text();
      if (body.length > MAX_CERTIFICATE_BYTES || !validCertificates(url.pathname, JSON.parse(body))) {
        throw new Error('Unexpected Google certificate response');
      }
      return new Response(body, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=300',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      // Fail closed: never serve invented or indefinitely stale signing keys.
      return new Response('Certificate source unavailable', {
        status: 502,
        headers: { 'cache-control': 'no-store' },
      });
    }
  },
};
