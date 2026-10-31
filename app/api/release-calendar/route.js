export const revalidate = 21600

const FRED_RELEASES = [
  { releaseId: 10, label: 'Consumer Price Index', href: '/us/cpi', category: 'Prices' },
  { releaseId: 46, label: 'Producer Price Index', href: '/us/ppi', category: 'Prices' },
  { releaseId: 50, label: 'Employment Situation', href: '/us/employment', category: 'Labor' },
  { releaseId: 192, label: 'JOLTS', href: '/us/jolts', category: 'Labor' },
  { releaseId: 54, label: 'PCE & Personal Income', href: '/us/consumption', category: 'Consumption' },
  { releaseId: 53, label: 'Gross Domestic Product', href: '/us-macro#growth', category: 'Growth' },
  { releaseId: 9, label: 'Retail Sales', href: '/us/retail-sales', category: 'Consumption' },
  { releaseId: 27, label: 'Housing Starts & Permits', href: '/us/housing', category: 'Housing' },
  { releaseId: 97, label: 'New Home Sales', href: '/us/housing', category: 'Housing' },
]

const JAPAN_SOURCES = {
  cpi: 'https://www.stat.go.jp/english/data/cpi/1582.htm',
  gdp: 'https://www.esri.cao.go.jp/en/sna/kouhyou/kouhyou_top.html',
  activity: 'https://www.esri.cao.go.jp/en/stat/stat-schedule-e.html',
  boj: 'https://www.boj.or.jp/en/statistics/outline/tkohyos.xlsx',
}

function calendarDate(timeZone = 'America/New_York') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = type => parts.find(part => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function cleanHtml(value) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function tableRows(html) {
  return [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(match => [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(cell => cleanHtml(cell[1])))
    .filter(row => row.length)
}

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
  october: 10, nov: 11, november: 11, dec: 12, december: 12,
}

function parseEnglishDate(text, state = { year: new Date().getUTCFullYear(), month: null }) {
  const normalized = cleanHtml(text).replace(/\./g, '')
  const match = normalized.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s*,?\s*(\d{1,2})(?:\s*,\s*(\d{4}))?/i,
  )
  if (!match) return null
  const month = MONTHS[match[1].toLowerCase()]
  let year = match[3] ? Number(match[3]) : state.year
  if (!match[3] && state.month && month < state.month - 6) year += 1
  state.year = year
  state.month = month
  return `${year}-${String(month).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`
}

function event({
  country,
  date,
  label,
  period,
  href,
  category,
  source,
  sourceUrl,
  time = null,
  timeZone = null,
  scheduleType = 'official',
}) {
  return {
    id: `${country}-${date}-${label}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    country,
    date,
    label,
    period,
    href,
    category,
    source,
    sourceUrl,
    time,
    timeZone,
    scheduleType,
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Macro Data Monitor release calendar' },
    next: { revalidate },
  })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response.text()
}

async function fredEvents(from, to) {
  const apiKey = process.env.FRED_API_KEY
  if (!apiKey) throw new Error('FRED_API_KEY is not configured')

  // Query each tracked release directly so near-term dates cannot be displaced
  // by the global calendar's much larger history.
  const schedules = await Promise.all(FRED_RELEASES.map(async definition => {
    const params = new URLSearchParams({
      release_id: String(definition.releaseId),
      api_key: apiKey,
      file_type: 'json',
      include_release_dates_with_no_data: 'true',
      sort_order: 'desc',
      limit: '1000',
    })
    const response = await fetch(
      `https://api.stlouisfed.org/fred/release/dates?${params}`,
      { next: { revalidate } },
    )
    if (!response.ok) {
      throw new Error(`FRED release ${definition.releaseId} returned HTTP ${response.status}`)
    }
    const payload = await response.json()
    if (payload.error_message) throw new Error(payload.error_message)
    return (payload.release_dates || []).flatMap(row => {
      if (row.date < from || row.date > to) return []
      return [event({
        country: 'US',
        date: row.date,
        label: definition.label,
        period: 'Official release date',
        href: definition.href,
        category: definition.category,
        source: 'FRED release calendar',
        sourceUrl: `https://fred.stlouisfed.org/release?rid=${definition.releaseId}`,
        scheduleType: 'official-api',
      })]
    })
  }))

  return schedules.flat()
}

async function statisticsBureauEvents(from, to) {
  const html = await fetchText(JAPAN_SOURCES.cpi)
  const rows = tableRows(html)
  const nationalState = { year: new Date().getUTCFullYear(), month: null }
  const tokyoState = { year: new Date().getUTCFullYear(), month: null }
  const events = []

  for (const row of rows) {
    if (row.length < 4) continue
    const nationalDate = parseEnglishDate(row[1], nationalState)
    const tokyoDate = parseEnglishDate(row[3], tokyoState)
    if (nationalDate && nationalDate >= from && nationalDate <= to) {
      events.push(event({
        country: 'JP',
        date: nationalDate,
        label: 'National CPI',
        period: row[0],
        href: '/cpi',
        category: 'Prices',
        source: 'Statistics Bureau',
        sourceUrl: JAPAN_SOURCES.cpi,
        timeZone: 'JST',
      }))
    }
    if (tokyoDate && tokyoDate >= from && tokyoDate <= to) {
      events.push(event({
        country: 'JP',
        date: tokyoDate,
        label: 'Tokyo CPI',
        period: row[2],
        href: '/tokyo-cpi',
        category: 'Prices',
        source: 'Statistics Bureau',
        sourceUrl: JAPAN_SOURCES.cpi,
        timeZone: 'JST',
      }))
    }
  }
  return events
}

async function cabinetOfficeGdpEvents(from, to) {
  const rows = tableRows(await fetchText(JAPAN_SOURCES.gdp))
  return rows.flatMap(row => {
    if (row.length < 3 || !/preliminary/i.test(row[0])) return []
    const date = parseEnglishDate(row[1], { year: new Date().getUTCFullYear(), month: null })
    if (!date || date < from || date > to) return []
    return [event({
      country: 'JP',
      date,
      label: `GDP · ${/second/i.test(row[0]) ? 'Second preliminary' : 'First preliminary'}`,
      period: row[0].replace(/\s*\(The .+$/i, '').trim(),
      href: '/gdp',
      category: 'Growth',
      source: 'Cabinet Office',
      sourceUrl: JAPAN_SOURCES.gdp,
      time: row[2].replace(/\s*\(JST\)/i, '').trim(),
      timeZone: 'JST',
    })]
  })
}

async function cabinetOfficeActivityEvents(from, to) {
  const rows = tableRows(await fetchText(JAPAN_SOURCES.activity))
  return rows.flatMap(row => {
    if (row.length < 3) return []
    const date = parseEnglishDate(row[2], { year: new Date().getUTCFullYear(), month: null })
    if (!date || date < from || date > to) return []
    const period = row[2].match(/\(([^)]+)\)/)?.[1] || 'Monthly release'
    return [event({
      country: 'JP',
      date,
      label: 'Machine Orders',
      period,
      href: '/machine-orders',
      category: 'Business Activity',
      source: 'Cabinet Office',
      sourceUrl: JAPAN_SOURCES.activity,
      time: '08:50',
      timeZone: 'JST',
    })]
  })
}

function xlsxDate(value, XLSX) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && value > 30000) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  return parseEnglishDate(String(value ?? ''), { year: new Date().getUTCFullYear(), month: null })
}

async function bojEvents(from, to) {
  const response = await fetch(JAPAN_SOURCES.boj, { next: { revalidate } })
  if (!response.ok) throw new Error(`BOJ schedule returned HTTP ${response.status}`)
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array', cellDates: true })
  const definitions = [
    { match: /corporate goods price index/i, label: 'Corporate Goods Price Index', href: '/ppi', category: 'Prices' },
    { match: /services producer price index/i, label: 'Services Producer Price Index', href: '/ppi', category: 'Prices' },
    { match: /short-term economic survey.*enterprises|tankan/i, label: 'BOJ Tankan', href: '/tankan', category: 'Surveys' },
  ]
  const result = []

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true })
    for (const row of rows) {
      const rowText = row.map(value => value instanceof Date ? '' : String(value ?? '')).join(' ')
      const definition = definitions.find(item => item.match.test(rowText))
      if (!definition) continue
      for (const value of row) {
        const date = xlsxDate(value, XLSX)
        if (!date || date < from || date > to) continue
        result.push(event({
          country: 'JP',
          date,
          label: definition.label,
          period: 'Official BOJ schedule',
          href: definition.href,
          category: definition.category,
          source: 'Bank of Japan',
          sourceUrl: JAPAN_SOURCES.boj,
          timeZone: 'JST',
        }))
      }
    }
  }
  return result
}

function uniqueEvents(events) {
  const seen = new Set()
  return events
    .filter(item => {
      const key = `${item.country}|${item.date}|${item.label}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label))
}

export async function GET() {
  const from = calendarDate()
  const to = addDays(from, 180)
  const checks = await Promise.allSettled([
    fredEvents(from, to),
    statisticsBureauEvents(from, to),
    cabinetOfficeGdpEvents(from, to),
    cabinetOfficeActivityEvents(from, to),
    bojEvents(from, to),
  ])
  const events = uniqueEvents(checks.flatMap(check => check.status === 'fulfilled' ? check.value : []))
  const warnings = checks.flatMap((check, index) => check.status === 'rejected'
    ? [{
        source: ['FRED', 'Statistics Bureau', 'Cabinet Office GDP', 'Cabinet Office activity', 'Bank of Japan'][index],
        message: check.reason?.message || 'Unable to load schedule',
      }]
    : [])

  return Response.json({
    from,
    to,
    fetchedAt: new Date().toISOString(),
    automatic: true,
    methodology: 'Official published schedules only. Dates are refreshed every six hours; no estimated dates are included.',
    events,
    warnings,
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
    },
  })
}
