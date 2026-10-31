import { SITE_URL } from './lib/site.mjs'

const routes = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/status', priority: 0.8, changeFrequency: 'daily' },
  { path: '/about', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/changelog', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/cpi', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/tokyo-cpi', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/ppi', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/boj-policy', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/yen-transmission', priority: 0.9, changeFrequency: 'daily' },
  { path: '/gdp', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/iip', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/tsip', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/machine-orders', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/consumption', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/housing', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/tankan', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/watcher', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/wages', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/labour', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/job-ratio', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/trade', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/inbound-tourism', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/us/cpi', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/us/ppi', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/us/consumption', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/us/household-credit', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/us/retail-sales', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/us/housing', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/us/employment', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/us/initial-claims', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/us/jolts', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/us/manufacturing', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/us/rates', priority: 0.9, changeFrequency: 'daily' },
  { path: '/us-macro', priority: 0.8, changeFrequency: 'weekly' },
]

export default function sitemap() {
  const lastModified = new Date()
  return routes.map(route => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
