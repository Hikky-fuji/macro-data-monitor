// Keep in sync with SITE_URL in app/lib/site.mjs (checked by tests).
const CANONICAL_ORIGIN = 'https://macro-data-monitor.vercel.app'
// Former production host; both domains are attached to the Vercel project.
const LEGACY_HOST = 'japanpulse.vercel.app'

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // The US workspace merged into the overview page.
      { source: '/us', destination: '/#united-states', permanent: true },
      {
        source: '/:path*',
        has: [{ type: 'host', value: LEGACY_HOST }],
        destination: `${CANONICAL_ORIGIN}/:path*`,
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
