// Core monitoring set chosen by the owner (2026-10-30). Everything else stays
// routed and monitored, but is presented as Archive and does not gate CI.

export const CORE_PAGES = {
  JP: ['/cpi', '/tokyo-cpi', '/wages', '/boj-policy'],
  US: ['/us/cpi', '/us/employment', '/us/consumption', '/us/manufacturing', '/us/rates', '/us-macro'],
}

// APIs the core pages read, including inputs joined into the BOJ Policy Monitor.
export const CORE_APIS = [
  '/api/cpi',
  '/api/tokyo-cpi',
  '/api/wages',
  '/api/boj-policy',
  '/api/ppi',
  '/api/tankan',
  '/api/us-cpi',
  '/api/us-employment',
  '/api/us-consumption',
  '/api/us-manufacturing',
  '/api/us-rates',
  '/api/us-macro',
]

const CORE_PAGE_SET = new Set([...CORE_PAGES.JP, ...CORE_PAGES.US])
// Sections of a core page that are not part of the core set.
const ARCHIVE_ANCHORS = new Set(['/us-macro#growth'])

export function isCorePage(href) {
  const text = String(href ?? '')
  return !ARCHIVE_ANCHORS.has(text) && CORE_PAGE_SET.has(text.split('#')[0])
}

export function isCoreApi(path) {
  return CORE_APIS.includes(String(path ?? '').split('?')[0])
}
