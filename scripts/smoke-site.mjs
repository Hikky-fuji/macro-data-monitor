import { isCoreApi } from '../app/lib/core-indicators.mjs'
import { SITE_URL } from '../app/lib/site.mjs'

const baseUrl = (process.env.BASE_URL || SITE_URL).replace(/\/$/, '')

const checks = [
  { path: '/api/cpi', required: ['headline'] },
  { path: '/api/tokyo-cpi', required: ['headline'] },
  { path: '/api/ppi', required: ['cgpi', 'sppi'] },
  { path: '/api/boj-policy', required: ['latest', 'meta'] },
  { path: '/api/yen-transmission', required: ['latest'] },
  { path: '/api/gdp', required: ['gdp_qoq'] },
  { path: '/api/iip', required: ['鉱工業'] },
  { path: '/api/tsip', required: ['latest'] },
  { path: '/api/machine-orders', required: ['latest'] },
  { path: '/api/consumption', required: ['total'] },
  { path: '/api/housing', required: ['series', 'fetchedAt'] },
  { path: '/api/tankan', required: ['large_mfg'] },
  { path: '/api/watcher', required: ['current_all'] },
  { path: '/api/wages', required: ['nominal'] },
  { path: '/api/labour', required: ['data'] },
  { path: '/api/job-ratio', required: ['latest'] },
  { path: '/api/trade', required: ['export', 'import'] },
  { path: '/api/inbound-tourism', required: ['arrivalSummary'] },
  { path: '/api/us-cpi', required: ['series', 'fetchedAt'] },
  { path: '/api/us-ppi', required: ['series', 'fetchedAt'] },
  { path: '/api/us-consumption', required: ['series', 'fetchedAt', 'meta'] },
  { path: '/api/us-household-credit', required: ['series', 'latestQuarter', 'meta'] },
  { path: '/api/us-retail-sales', required: ['series', 'fetchedAt', 'meta'] },
  { path: '/api/us-housing', required: ['series', 'fetchedAt', 'meta'] },
  { path: '/api/us-employment', required: ['employment'] },
  { path: '/api/us-initial-claims', required: ['series', 'fetchedAt'] },
  { path: '/api/us-jolts', required: ['series', 'fetchedAt'] },
  { path: '/api/us-manufacturing', required: ['regional', 'ism'] },
  { path: '/api/us-macro', required: ['growth', 'policy'] },
  { path: '/api/us-rates', required: ['series', 'latest'] },
  { path: '/api/release-calendar', required: ['events', 'fetchedAt'] },
  { path: '/api/workspace-pulse?country=JP', required: ['sources', 'summary'] },
  { path: '/api/workspace-pulse?country=US', required: ['sources', 'summary'] },
  { path: '/api/data-health?country=JP', required: ['items', 'summary'] },
  { path: '/api/data-health?country=US', required: ['items', 'summary'] },
]

// Operations endpoints and core feeds gate the run; archive feeds only warn.
const OPERATIONS_PATHS = ['/api/release-calendar', '/api/workspace-pulse', '/api/data-health']

function gates(check) {
  const path = check.path.split('?')[0]
  return OPERATIONS_PATHS.includes(path) || isCoreApi(path)
}

function result(check, startedAt) {
  return { path: check.path, ok: true, gating: gates(check), durationMs: Date.now() - startedAt }
}

async function inspect(check) {
  const startedAt = Date.now()
  try {
    const response = await fetch(`${baseUrl}${check.path}`, {
      headers: { 'User-Agent': 'Macro Data Monitor production smoke test' },
      signal: AbortSignal.timeout(check.path.includes('data-health') ? 65000 : 30000),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (payload?.error) throw new Error(payload.error)
    for (const key of check.required) {
      if (payload?.[key] === undefined || payload?.[key] === null) throw new Error(`missing ${key}`)
    }
    if (check.path.includes('workspace-pulse') && payload.summary?.failed > 0) {
      throw new Error(`${payload.summary.failed} aggregated source(s) failed`)
    }
    if (check.path.includes('data-health')) {
      const core = payload.coreSummary || payload.summary
      const coreIssues = (payload.items || [])
        .filter(item => (item.tier || 'core') === 'core' && ['failed', 'stale'].includes(item.status))
        .map(item => `${item.key} ${item.status}`)
      if (core?.failed > 0 || core?.stale > 0) throw new Error(`core feed issue(s): ${coreIssues.join(', ')}`)
      const archiveIssues = (payload.items || [])
        .filter(item => item.tier === 'archive' && ['failed', 'stale'].includes(item.status))
        .map(item => `${item.key} ${item.status}`)
      if (archiveIssues.length) return { ...result(check, startedAt), warning: `archive: ${archiveIssues.join(', ')}` }
    }
    return result(check, startedAt)
  } catch (error) {
    return { ...result(check, startedAt), ok: false, error: error.message }
  }
}

const results = []
for (let index = 0; index < checks.length; index += 4) {
  results.push(...await Promise.all(checks.slice(index, index + 4).map(inspect)))
}

for (const item of results) {
  const state = item.ok ? (item.warning ? 'WARN' : 'PASS') : item.gating ? 'FAIL' : 'WARN'
  const note = item.error || item.warning
  const tier = item.gating ? '' : ' [archive]'
  console.log(`${state.padEnd(4)} ${String(item.durationMs).padStart(6)}ms  ${item.path}${tier}${note ? ` · ${note}` : ''}`)
}

const failures = results.filter(item => !item.ok && item.gating)
const warnings = results.filter(item => (!item.ok && !item.gating) || item.warning)
console.log(`\n${results.length - failures.length}/${results.length} checks passed against ${baseUrl} (${warnings.length} archive warning(s))`)
if (failures.length) process.exitCode = 1
