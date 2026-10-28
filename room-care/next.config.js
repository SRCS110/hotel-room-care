/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Keep every page and API response out of search engines
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }
];
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() { return [{ source: '/:path*', headers: securityHeaders }]; }
};
